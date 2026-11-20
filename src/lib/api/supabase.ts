// 正式環境資料存取：所有權限檢查都交給 Supabase RLS、DB trigger 與 RPC
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { normalizeInviteCode } from '../inviteCode';
import type {
  EventEntry,
  Member,
  MemberPrivate,
  OrgName,
  OrgSquad,
  Organization,
  RosterMember,
  Settings,
  SportEvent,
  Team,
  TeamContact,
  TeamInvite,
  Vendor,
  VendorContact,
} from '../types';
import type { DataApi, InviteInfo, SessionInfo, SessionTeam } from './types';

const PAGE_SIZE = 1000; // Supabase 預設單次最多回傳 1000 筆

/** 把資料庫錯誤翻成使用者看得懂的中文 */
function translateError(error: PostgrestError): string {
  const text = `${error.message} ${error.details ?? ''}`;
  if (error.code === '23505') {
    if (text.includes('national_id')) return '身分證字號已報名，同一人不可重複報名';
    if (text.includes('teams_name')) return '隊名已被使用，請換一個';
    if (text.includes('organizations_name')) return '公司名稱已存在';
    if (text.includes('invite_code')) return '邀請碼已被使用，請換一組';
    if (text.includes('org_squad_members')) return '此同仁已加入其他隊伍（每人只能參加一隊）';
    return '資料重複';
  }
  if (error.code === '23514' && text.includes('national_id')) return '身分證字號格式或檢查碼錯誤';
  if (error.code === '23514' && text.includes('invite_code')) return '邀請碼需為 6–20 位英文字母或數字';
  if (error.code === '23514' && text.includes('video_url')) return '影片連結需以 http:// 或 https:// 開頭';
  if (error.code === '23514' && text.includes('vendors_name')) return '請輸入廠商名稱';
  if (error.code === '23514' && text.includes('account_limit')) return '帳號數需為 0 以上的整數';
  if (error.code === '23503' && text.includes('members_team_org_fkey')) return '此公司未參與該隊伍';
  if (error.code === '42501') return '權限不足';
  // P0001 為 trigger / RPC 主動丟出的中文訊息，直接顯示
  return error.message;
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return '帳號或密碼錯誤';
  if (/email not confirmed/i.test(message)) return '信箱尚未驗證，請先至信箱點擊驗證連結';
  if (/already registered/i.test(message)) return '此信箱已註冊：請改用「登入」，登入後可在「我的隊伍」輸入邀請碼加入其他隊伍';
  if (/password should be at least/i.test(message)) return '密碼長度不足';
  // handle_new_user 綁定隊伍失敗（例如檢查後名額剛好被搶走）時，Supabase 只回傳這句
  if (/database error saving new user/i.test(message)) return '註冊失敗：邀請碼可能已失效或名額已滿，請重新確認';
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
const TEAM_SELECT = 'id, name, captain_name, captain_phone, contact_limit, team_orgs(org_id)';
const toTeam = ({ team_orgs, ...t }: TeamRow): Team => ({ ...t, org_ids: (team_orgs ?? []).map((x) => x.org_id) });

type MemberRow = Omit<Member, 'private' | 'diet'> & { member_private: (MemberPrivate & { member_id?: string }) | null };
const MEMBER_SELECT =
  'id, team_id, org_id, name, gender, member_private(national_id, birthday, phone, shirt_size, diet, special_needs)';
const toMember = ({ member_private, ...m }: MemberRow): Member => ({
  ...m,
  diet: member_private?.diet ?? null,
  private: member_private ?? null,
});

/** 委外廠商讀取的隊伍（vendor_teams()：隊長電話已隱碼） */
type VendorTeamRow = Team & { created_at: string };
const fromVendorTeam = ({ created_at: _, ...t }: VendorTeamRow): Team => ({ ...t, org_ids: t.org_ids ?? [] });

type SquadRow = Omit<OrgSquad, 'member_ids'> & { org_squad_members: { member_id: string; created_at: string }[] | null };
const SQUAD_SELECT = 'id, org_id, event_id, submitted_at, created_at, org_squad_members(member_id, created_at)';
const toSquad = ({ org_squad_members, ...s }: SquadRow): OrgSquad => ({
  ...s,
  member_ids: [...(org_squad_members ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((x) => x.member_id),
});

export function createSupabaseApi(url: string, key: string): DataApi {
  const sb = createClient(url, key);
  /**
   * 目前登入者是否為委外廠商（每次 getSession 更新；登入後的頁面都在 AuthProvider 讀完 session 才載入資料）。
   * 委外廠商不能直接讀 teams、member_private，改走資料庫隱碼後的 vendor_teams()、vendor_member_private()
   */
  let vendorSession = false;

  /** 分頁抓取全部資料（900 人規模的報名紀錄會超過單次上限） */
  async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<Result<T[] | null>>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = (await run(build(from, from + PAGE_SIZE - 1))) ?? [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) return out;
    }
  }

  async function vendorTeams(teamId?: string): Promise<Team[]> {
    const rows = (await run(sb.rpc('vendor_teams', { p_team_id: teamId ?? null }))) as VendorTeamRow[] | null;
    return (rows ?? []).map(fromVendorTeam);
  }

  async function getTeam(id: string): Promise<Team | null> {
    if (vendorSession) return (await vendorTeams(id))[0] ?? null;
    const row = await run(sb.from('teams').select(TEAM_SELECT).eq('id', id).maybeSingle());
    return row ? toTeam(row as unknown as TeamRow) : null;
  }

  return {
    mode: 'supabase',

    async getSession(): Promise<SessionInfo | null> {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) {
        vendorSession = false;
        return null;
      }
      const [profile, teams, vendorName] = await Promise.all([
        run(sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle()),
        run(sb.rpc('my_teams')) as Promise<{ team_id: string; team_name: string; org_id: string; org_name: string }[]>,
        run(sb.rpc('my_vendor')) as Promise<string | null>,
      ]);
      const role = profile?.role === 'super_admin' ? 'super_admin' : vendorName ? 'vendor' : 'org_admin';
      vendorSession = role === 'vendor';
      return {
        userId: session.user.id,
        email: session.user.email ?? '',
        role,
        teams: (teams ?? []).map(
          (t): SessionTeam => ({ teamId: t.team_id, teamName: t.team_name, orgId: t.org_id, orgName: t.org_name }),
        ),
        vendorName: role === 'vendor' ? vendorName : null,
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

    async registerWithInvite(email, password, join) {
      const code = normalizeInviteCode(join.inviteCode);
      // 隊伍與邀請碼（或廠商邀請碼）放在 user metadata，由 DB 的 handle_new_user 於建立帳號時一併綁定
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: join.kind === 'vendor' ? { vendor_code: code } : { team_id: join.teamId, invite_code: code },
        },
      });
      // 信箱已註冊：關閉 Confirm email 時回傳錯誤；開啟時回傳沒有 identities 的假使用者
      const exists = error ? /already registered|already exists/i.test(error.message) : data.user?.identities?.length === 0;
      if (error && !exists) throw new Error(translateAuthError(error.message));
      if (!exists) return { needsEmailConfirm: !data.session, existingAccount: false };

      // 同一位窗口代表多隊：以原本的密碼登入後，把這一隊加入同一個帳號
      // （委外廠商：被解除後以同一個帳號重新綁定）
      const signIn = await sb.auth.signInWithPassword({ email, password });
      if (signIn.error) {
        throw new Error(
          /invalid login credentials/i.test(signIn.error.message)
            ? join.kind === 'vendor'
              ? '此信箱已註冊：請輸入該帳號原本的密碼'
              : '此信箱已註冊：請輸入該帳號原本的密碼，即可把這一隊加入同一個帳號'
            : translateAuthError(signIn.error.message),
        );
      }
      try {
        if (join.kind === 'vendor') await run(sb.rpc('join_vendor', { p_code: code }));
        else await run(sb.rpc('join_team', { p_team_id: join.teamId, p_code: code }));
      } catch (e) {
        // 已綁定視為成功；其他錯誤（名額已滿等）先登出，讓使用者留在註冊頁看到錯誤
        if (!(e instanceof Error && /已是該隊窗口|已是委外廠商帳號/.test(e.message))) {
          await sb.auth.signOut();
          throw e;
        }
      }
      return { needsEmailConfirm: false, existingAccount: true };
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async lookupInvite(inviteCode): Promise<InviteInfo> {
      const rows = (await run(sb.rpc('lookup_invite', { p_code: normalizeInviteCode(inviteCode) }))) as {
        kind: 'team' | 'vendor';
        team_id: string;
        team_name: string;
        org_id: string;
        org_name: string;
        vendor_name: string;
        is_full: boolean;
      }[];
      const r = rows?.[0];
      if (!r) throw new Error('邀請碼錯誤，請確認活動小組提供的邀請碼');
      if (r.kind === 'vendor') return { kind: 'vendor', vendorName: r.vendor_name, isFull: r.is_full };
      return { kind: 'team', teamId: r.team_id, teamName: r.team_name, orgId: r.org_id, orgName: r.org_name, isFull: r.is_full };
    },

    async joinTeam(teamId, inviteCode) {
      return run(sb.rpc('join_team', { p_team_id: teamId, p_code: normalizeInviteCode(inviteCode) })) as Promise<string>;
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
      if (vendorSession) return vendorTeams();
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
      const rows = await run(sb.from('teams').delete().eq('id', id).select('id'));
      if (!rows?.length) throw new Error('權限不足：隊伍只能由活動小組刪除');
    },

    async listTeamInvites() {
      return run(sb.from('team_invites').select('team_id, org_id, invite_code')) as Promise<TeamInvite[]>;
    },

    async setTeamInviteCode(teamId, orgId, inviteCode) {
      await run(
        sb
          .from('team_invites')
          .update({ invite_code: normalizeInviteCode(inviteCode) })
          .eq('team_id', teamId)
          .eq('org_id', orgId),
      );
    },

    async listTeamContacts() {
      const rows = await run(
        sb.from('team_contacts').select('user_id, team_id, org_id, created_at, profiles(email)').order('created_at'),
      );
      return (rows as unknown as (Omit<TeamContact, 'email'> & { profiles: { email: string | null } | null })[]).map(
        ({ profiles, ...c }) => ({ ...c, email: profiles?.email ?? '' }),
      );
    },

    async removeTeamContact(userId, teamId) {
      await run(sb.from('team_contacts').delete().eq('user_id', userId).eq('team_id', teamId));
    },

    async listVendors() {
      return run(sb.from('vendors').select('id, name, invite_code, account_limit').order('created_at')) as Promise<Vendor[]>;
    },

    async createVendor(input) {
      // 邀請碼由資料庫預設值產生
      await run(sb.from('vendors').insert({ name: input.name.trim(), account_limit: input.account_limit }));
    },

    async updateVendor(id, patch) {
      const next = { ...patch };
      if (next.name !== undefined) next.name = next.name.trim();
      if (next.invite_code !== undefined) next.invite_code = normalizeInviteCode(next.invite_code);
      await run(sb.from('vendors').update(next).eq('id', id));
    },

    async deleteVendor(id) {
      await run(sb.from('vendors').delete().eq('id', id));
    },

    async listVendorContacts() {
      const rows = await run(sb.from('vendor_contacts').select('user_id, vendor_id, created_at, profiles(email)').order('created_at'));
      return (rows as unknown as (Omit<VendorContact, 'email'> & { profiles: { email: string | null } | null })[]).map(
        ({ profiles, ...c }) => ({ ...c, email: profiles?.email ?? '' }),
      );
    },

    async removeVendorContact(userId) {
      await run(sb.from('vendor_contacts').delete().eq('user_id', userId));
    },

    async listMembers(filter) {
      const rows = await fetchAll<MemberRow>((from, to) => {
        let q = sb.from('members').select(MEMBER_SELECT).order('created_at').order('id');
        if (filter?.teamId) q = q.eq('team_id', filter.teamId);
        return q.range(from, to) as unknown as PromiseLike<Result<MemberRow[] | null>>;
      });
      if (vendorSession) {
        // 委外廠商：個資一律由資料庫隱碼後回傳（證號、生日、手機）
        const masked = await fetchAll<MemberPrivate & { member_id: string }>((from, to) =>
          sb.rpc('vendor_member_private', { p_team_id: filter?.teamId ?? null }).range(from, to),
        );
        const privOf = new Map(masked.map(({ member_id, ...p }) => [member_id, p]));
        return rows.map((r) => {
          const p = privOf.get(r.id) ?? null;
          return { ...toMember(r), diet: p?.diet ?? null, private: p };
        });
      }
      // 用餐習慣存在個資表，聯隊其他公司的隊員要另外以 member_diets() 取得（只回傳 diet）
      const diets = await fetchAll<{ member_id: string; diet: Member['diet'] }>((from, to) =>
        sb.rpc('member_diets', { p_team_id: filter?.teamId ?? null }).range(from, to),
      );
      const dietOf = new Map(diets.map((d) => [d.member_id, d.diet]));
      return rows.map((r) => {
        const m = toMember(r);
        return { ...m, diet: dietOf.get(m.id) ?? m.diet };
      });
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

    async listOrgRoster(orgId) {
      const rows = (await run(sb.rpc('org_roster', { p_org_id: orgId }))) as {
        member_id: string;
        name: string;
        gender: RosterMember['gender'];
        team_id: string;
        team_name: string;
      }[];
      return (rows ?? []).map(({ member_id, ...r }) => ({ id: member_id, ...r }));
    },

    async listOrgSquads(orgId) {
      let q = sb.from('org_squads').select(SQUAD_SELECT).order('created_at');
      if (orgId) q = q.eq('org_id', orgId);
      return ((await run(q)) as unknown as SquadRow[]).map(toSquad);
    },

    async createOrgSquad(orgId, eventId) {
      const row = await run(sb.from('org_squads').insert({ org_id: orgId, event_id: eventId }).select(SQUAD_SELECT).single());
      return toSquad(row as unknown as SquadRow);
    },

    async deleteOrgSquad(id) {
      const rows = await run(sb.from('org_squads').delete().eq('id', id).select('id'));
      if (!rows?.length) throw new Error('找不到隊伍或無權限刪除');
    },

    async addSquadMember(squadId, memberId) {
      // event_id 由 DB trigger 依隊伍帶入
      await run(sb.from('org_squad_members').insert({ squad_id: squadId, member_id: memberId }));
    },

    async removeSquadMember(squadId, memberId) {
      await run(sb.from('org_squad_members').delete().eq('squad_id', squadId).eq('member_id', memberId));
    },

    async setSquadSubmitted(id, submitted) {
      // 送出時間由 DB trigger 設定，並在送出時檢查人數與女性下限
      const rows = await run(
        sb
          .from('org_squads')
          .update({ submitted_at: submitted ? new Date().toISOString() : null })
          .eq('id', id)
          .select('id'),
      );
      if (!rows?.length) throw new Error('找不到隊伍或無權限');
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
