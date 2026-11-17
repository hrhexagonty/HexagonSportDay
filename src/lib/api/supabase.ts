// 正式環境資料存取：所有權限檢查都交給 Supabase RLS、DB trigger 與 RPC
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import type { EventEntry, Member, MemberPrivate, OrgName, Organization, Settings, SportEvent, Team } from '../types';
import type { DataApi, SessionInfo } from './types';

const PAGE_SIZE = 1000; // Supabase 預設單次最多回傳 1000 筆

/** 把資料庫錯誤翻成使用者看得懂的中文 */
function translateError(error: PostgrestError): string {
  const text = `${error.message} ${error.details ?? ''}`;
  if (error.code === '23505') {
    if (text.includes('national_id')) return '身分證字號已報名，同一人不可重複報名';
    if (text.includes('teams_name')) return '隊名已被使用，請換一個';
    if (text.includes('organizations_name')) return '單位名稱已存在';
    return '資料重複';
  }
  if (error.code === '23514' && text.includes('national_id')) return '身分證字號格式或檢查碼錯誤';
  if (error.code === '23503' && text.includes('members_team_org_fkey')) return '此公司未參與該隊伍';
  if (error.code === '42501') return '權限不足';
  // P0001 為 trigger / RPC 主動丟出的中文訊息，直接顯示
  return error.message;
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return '帳號或密碼錯誤';
  if (/email not confirmed/i.test(message)) return '信箱尚未驗證，請先至信箱點擊驗證連結';
  if (/already registered/i.test(message)) return '此信箱已註冊，請直接登入';
  if (/password should be at least/i.test(message)) return '密碼長度不足';
  return message;
}

type Result<T> = { data: T; error: PostgrestError | null };

async function run<T>(p: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(translateError(error));
  return data;
}

// ---- 資料列轉換 ----
type TeamRow = Omit<Team, 'org_ids'> & { team_orgs: { org_id: string }[] | null };
const TEAM_SELECT = 'id, name, captain_name, captain_phone, team_orgs(org_id)';
const toTeam = ({ team_orgs, ...t }: TeamRow): Team => ({ ...t, org_ids: (team_orgs ?? []).map((x) => x.org_id) });

type MemberRow = Omit<Member, 'private'> & { member_private: (MemberPrivate & { member_id?: string }) | null };
const MEMBER_SELECT =
  'id, team_id, org_id, name, gender, member_private(national_id, birthday, phone, shirt_size, diet, special_needs)';
const toMember = ({ member_private, ...m }: MemberRow): Member => ({ ...m, private: member_private ?? null });

export function createSupabaseApi(url: string, key: string): DataApi {
  const sb = createClient(url, key);

  /** 分頁抓取全部資料（900 人規模的報名紀錄會超過單次上限） */
  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<Result<T[] | null>>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = (await run(build(from, from + PAGE_SIZE - 1))) ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) return out;
    }
  }

  async function getTeam(id: string): Promise<Team | null> {
    const row = await run(sb.from('teams').select(TEAM_SELECT).eq('id', id).maybeSingle());
    return row ? toTeam(row as unknown as TeamRow) : null;
  }

  return {
    mode: 'supabase',

    async getSession(): Promise<SessionInfo | null> {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) return null;
      const profile = await run(
        sb.from('profiles').select('role, org_id, organizations(name)').eq('id', session.user.id).maybeSingle(),
      );
      const org = profile?.organizations as unknown as { name: string } | null;
      return {
        userId: session.user.id,
        email: session.user.email ?? '',
        role: profile?.role ?? 'org_admin',
        orgId: profile?.org_id ?? null,
        orgName: org?.name ?? null,
      };
    },

    onAuthChange(cb) {
      // 不可在 callback 內直接 await supabase 呼叫（會卡住 auth lock），因此延後執行
      const { data } = sb.auth.onAuthStateChange(() => {
        setTimeout(cb, 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translateAuthError(error.message));
    },

    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw new Error(translateAuthError(error.message));
      return { needsEmailConfirm: !data.session };
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async joinOrg(inviteCode) {
      return run(sb.rpc('join_org', { p_code: inviteCode }));
    },

    async getSettings() {
      return run(sb.from('settings').select('*').eq('id', 1).single()) as Promise<Settings>;
    },

    async updateSettings(patch) {
      await run(sb.from('settings').update(patch).eq('id', 1));
    },

    async listEvents() {
      return run(sb.from('events').select('*').order('sort_order')) as Promise<SportEvent[]>;
    },

    async updateEvent(id, patch) {
      await run(sb.from('events').update(patch).eq('id', id));
    },

    async listOrganizations() {
      return run(sb.from('organizations').select('*').order('name')) as Promise<Organization[]>;
    },

    async listOrgNames() {
      return run(sb.rpc('org_names')) as Promise<OrgName[]>;
    },

    async createOrganization(input) {
      await run(sb.from('organizations').insert(input));
    },

    async updateOrganization(id, patch) {
      await run(sb.from('organizations').update(patch).eq('id', id));
    },

    async deleteOrganization(id) {
      await run(sb.from('organizations').delete().eq('id', id));
    },

    async listTeams() {
      const rows = await run(sb.from('teams').select(TEAM_SELECT).order('created_at'));
      return (rows as unknown as TeamRow[]).map(toTeam);
    },

    getTeam,

    async createTeam(input, orgIds) {
      const id = await run(
        sb.rpc('create_team', {
          p_name: input.name,
          p_captain_name: input.captain_name,
          p_captain_phone: input.captain_phone,
          p_org_ids: orgIds,
        }),
      );
      const team = await getTeam(id as string);
      if (!team) throw new Error('隊伍建立後讀取失敗');
      return team;
    },

    async updateTeam(id, patch) {
      await run(sb.from('teams').update(patch).eq('id', id));
    },

    async setTeamOrgs(id, orgIds) {
      await run(sb.rpc('set_team_orgs', { p_team_id: id, p_org_ids: orgIds }));
    },

    async deleteTeam(id) {
      await run(sb.from('teams').delete().eq('id', id));
    },

    async listMembers(filter) {
      const rows = await fetchAll<MemberRow>((from, to) => {
        let q = sb.from('members').select(MEMBER_SELECT).order('created_at').order('id');
        if (filter?.teamId) q = q.eq('team_id', filter.teamId);
        return q.range(from, to) as unknown as PromiseLike<Result<MemberRow[] | null>>;
      });
      return rows.map(toMember);
    },

    async addMembers(teamId, orgId, inputs) {
      // 公開資料與個資在同一個 RPC（交易）內寫入
      await run(sb.rpc('add_members', { p_team_id: teamId, p_org_id: orgId, p_rows: inputs }));
    },

    async updateMember(id, input) {
      await run(sb.rpc('update_member', { p_member_id: id, p_data: input }));
    },

    async deleteMember(id) {
      await run(sb.from('members').delete().eq('id', id));
    },

    async purgePrivateData() {
      return run(sb.rpc('purge_private_data')) as Promise<number>;
    },

    async listEntries(filter) {
      const rows = await fetchAll<{ event_id: string; member_id: string }>((from, to) => {
        let q = sb
          .from('event_entries')
          .select('event_id, member_id, members!inner(team_id)')
          .order('event_id')
          .order('member_id');
        if (filter?.teamId) q = q.eq('members.team_id', filter.teamId);
        return q.range(from, to);
      });
      return rows.map((r): EventEntry => ({ event_id: r.event_id, member_id: r.member_id }));
    },

    async addEntry(entry) {
      await run(sb.from('event_entries').insert(entry));
    },

    async removeEntry(eventId, memberId) {
      await run(sb.from('event_entries').delete().eq('event_id', eventId).eq('member_id', memberId));
    },
  };
}
