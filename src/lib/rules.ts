// 報名規則（純函式）：
// - evaluate*：計算隊伍 / 項目的完成度與問題清單，供畫面顯示
// - check*：寫入前的檢查，回傳錯誤訊息或 null；展示模式直接用它當作「資料庫限制」
// 與 DB trigger（supabase/migrations）規則需保持一致

import type { EventEntry, Gender, Member, OrgSquad, Settings, SportEvent, Team } from './types';

export type IssueLevel = 'error' | 'warning';
export interface Issue {
  level: IssueLevel;
  message: string;
}

/** complete = 完成；incomplete = 尚未填齊；error = 違反規則需修正 */
export type StatusLevel = 'complete' | 'incomplete' | 'error';

export function registrationOpen(
  s: Pick<Settings, 'registration_open' | 'registration_deadline'>,
  now: Date = new Date(),
): boolean {
  if (!s.registration_open) return false;
  if (s.registration_deadline && now >= new Date(s.registration_deadline)) return false;
  return true;
}

export function levelOf(issues: Issue[]): StatusLevel {
  if (issues.some((i) => i.level === 'error')) return 'error';
  return issues.length > 0 ? 'incomplete' : 'complete';
}

/** 依隊員清單篩出這些隊員的報名紀錄 */
export function entriesOfMembers(entries: EventEntry[], members: Member[]): EventEntry[] {
  const ids = new Set(members.map((m) => m.id));
  return entries.filter((e) => ids.has(e.member_id));
}

/** 聯隊 = 由多家公司組成的隊伍 */
export function isMergedTeam(team: Pick<Team, 'org_ids'>): boolean {
  return team.org_ids.length > 1;
}


export function sortEvents(events: SportEvent[]): SportEvent[] {
  return [...events].sort((a, b) => a.sort_order - b.sort_order);
}

/** 以公司為單位組隊的項目（健力比賽）；與 DB trigger 的判斷一致 */
export function isCompanyEvent(event: Pick<SportEvent, 'category'>): boolean {
  return event.category === 'powerlifting';
}

/** 以隊伍為單位安排選手的項目（依排序）；健力比賽改在「我的公司」組隊 */
export function teamEvents(events: SportEvent[]): SportEvent[] {
  return sortEvents(events).filter((e) => !isCompanyEvent(e));
}

/** 以公司為單位組隊的項目（依排序） */
export function companyEvents(events: SportEvent[]): SportEvent[] {
  return sortEvents(events).filter(isCompanyEvent);
}

export function teamSizeLabel(event: Pick<SportEvent, 'min_per_team' | 'max_per_team'>): string {
  const { min_per_team: min, max_per_team: max } = event;
  if (min === max) return `每隊 ${min} 人`;
  if (min === 0) return `每隊最多 ${max} 人`;
  return `每隊 ${min}–${max} 人`;
}

export interface EventStatus {
  event: SportEvent;
  entries: EventEntry[];
  female: number;
  issues: Issue[];
  level: StatusLevel;
}

export function evaluateEvent(
  event: SportEvent,
  teamEntries: EventEntry[],
  membersById: Map<string, Member>,
): EventStatus {
  const entries = teamEntries.filter((e) => e.event_id === event.id);
  const female = entries.filter((e) => membersById.get(e.member_id)?.gender === 'F').length;
  const n = entries.length;
  const issues: Issue[] = [];

  if (n > event.max_per_team) {
    issues.push({ level: 'error', message: `已報 ${n} 人，超過上限 ${event.max_per_team} 人` });
  } else if (n < event.min_per_team) {
    issues.push({ level: 'warning', message: `尚缺 ${event.min_per_team - n} 人（${teamSizeLabel(event)}）` });
  }
  // 選填項目（min=0）沒人報名時不檢查女性人數
  if (event.min_female > 0 && (n > 0 || event.min_per_team > 0) && female < event.min_female) {
    issues.push({ level: 'warning', message: `女性至少 ${event.min_female} 人（目前 ${female} 人）` });
  }
  return { event, entries, female, issues, level: levelOf(issues) };
}

export interface TeamStatus {
  memberCount: number;
  femaleCount: number;
  /** 隊伍人數的問題 */
  sizeIssues: Issue[];
  /** 個別隊員報名項目數的問題 */
  loadIssues: Issue[];
  /** 隊伍層級 + 各項目的所有問題（項目問題會加上【項目名】前綴） */
  issues: Issue[];
  events: EventStatus[];
  level: StatusLevel;
}

export function evaluateTeam(
  settings: Settings,
  events: SportEvent[],
  teamMembers: Member[],
  teamEntries: EventEntry[],
): TeamStatus {
  const membersById = new Map(teamMembers.map((m) => [m.id, m]));
  const sizeIssues: Issue[] = [];
  const loadIssues: Issue[] = [];
  const n = teamMembers.length;

  if (n > settings.team_max_size) {
    sizeIssues.push({ level: 'error', message: `隊伍人數 ${n} 人，超過上限 ${settings.team_max_size} 人` });
  } else if (n < settings.team_min_size) {
    sizeIssues.push({ level: 'warning', message: `隊伍人數 ${n} 人，未達下限 ${settings.team_min_size} 人` });
  }

  // 以公司組隊的項目（含改版前留下的健力報名）不計入每人項目數
  const companyIds = new Set(events.filter(isCompanyEvent).map((e) => e.id));
  const perMember = new Map<string, number>();
  for (const e of teamEntries) {
    if (!companyIds.has(e.event_id)) perMember.set(e.member_id, (perMember.get(e.member_id) ?? 0) + 1);
  }
  for (const [memberId, count] of perMember) {
    if (count > settings.max_events_per_member) {
      const name = membersById.get(memberId)?.name ?? '未知隊員';
      loadIssues.push({
        level: 'error',
        message: `${name} 報名 ${count} 項，超過每人上限 ${settings.max_events_per_member} 項`,
      });
    }
  }

  const issues: Issue[] = [...sizeIssues, ...loadIssues];
  const eventStatuses = teamEvents(events).map((ev) => evaluateEvent(ev, teamEntries, membersById));
  for (const s of eventStatuses) {
    for (const i of s.issues) issues.push({ ...i, message: `【${s.event.name}】${i.message}` });
  }

  return {
    memberCount: n,
    femaleCount: teamMembers.filter((m) => m.gender === 'F').length,
    sizeIssues,
    loadIssues,
    issues,
    events: eventStatuses,
    level: levelOf(issues),
  };
}

// ---------------------------------------------------------------------
// 寫入前檢查
// ---------------------------------------------------------------------

export function checkWritable(settings: Settings, isAdmin: boolean): string | null {
  if (!isAdmin && !registrationOpen(settings)) return '報名已截止，無法異動資料';
  return null;
}

export function checkAddMembers(
  settings: Settings,
  currentCount: number,
  adding: number,
  isAdmin: boolean,
): string | null {
  const closed = checkWritable(settings, isAdmin);
  if (closed) return closed;
  if (currentCount + adding > settings.team_max_size) {
    return `隊伍人數上限 ${settings.team_max_size} 人，目前 ${currentCount} 人，無法再新增 ${adding} 人`;
  }
  return null;
}

export function checkAddEntry(args: {
  settings: Settings;
  event: SportEvent;
  member: Member;
  /** 該隊目前所有報名 */
  teamEntries: EventEntry[];
  /** 該隊員目前的報名（不含以公司組隊的項目） */
  memberEntries: EventEntry[];
  isAdmin: boolean;
}): string | null {
  const { settings, event, member, teamEntries, memberEntries, isAdmin } = args;
  const closed = checkWritable(settings, isAdmin);
  if (closed) return closed;
  if (isCompanyEvent(event)) return `「${event.name}」改以公司為單位組隊，請至「我的公司」報名`;
  if (memberEntries.some((e) => e.event_id === event.id)) return `${member.name} 已報名「${event.name}」`;
  const count = teamEntries.filter((e) => e.event_id === event.id).length;
  if (count >= event.max_per_team) return `「${event.name}」每隊最多 ${event.max_per_team} 人`;
  if (memberEntries.length >= settings.max_events_per_member) {
    return `${member.name} 已報名 ${memberEntries.length} 項，每人最多 ${settings.max_events_per_member} 項`;
  }
  return null;
}

// ---------------------------------------------------------------------
// 公司組隊（健力）：與 org_squads / org_squad_members 的 trigger 同規則
// ---------------------------------------------------------------------

export interface SquadStatus {
  count: number;
  female: number;
  issues: Issue[];
  level: StatusLevel;
}

export function evaluateSquad(event: SportEvent, genders: Gender[]): SquadStatus {
  const count = genders.length;
  const female = genders.filter((g) => g === 'F').length;
  const issues: Issue[] = [];
  if (count > event.max_per_team) {
    issues.push({ level: 'error', message: `已有 ${count} 人，超過上限 ${event.max_per_team} 人` });
  } else if (count < event.min_per_team) {
    issues.push({ level: 'warning', message: `尚缺 ${event.min_per_team - count} 人（${teamSizeLabel(event)}）` });
  }
  if (female < event.min_female) {
    issues.push({ level: 'warning', message: `女性至少 ${event.min_female} 人（目前 ${female} 人）` });
  }
  return { count, female, issues, level: levelOf(issues) };
}

/** 送出成隊前的檢查：人數需在上下限之間、女性達下限 */
export function checkSubmitSquad(event: SportEvent, genders: Gender[]): string | null {
  const n = genders.length;
  const female = genders.filter((g) => g === 'F').length;
  if (n < event.min_per_team || n > event.max_per_team) {
    const need =
      event.min_per_team === event.max_per_team ? `${event.max_per_team}` : `${event.min_per_team}–${event.max_per_team}`;
    return `「${event.name}」每隊需 ${need} 人（目前 ${n} 人）`;
  }
  if (female < event.min_female) return `女性至少 ${event.min_female} 人才能成隊（目前 ${female} 人）`;
  return null;
}

export function checkAddSquadMember(args: {
  settings: Settings;
  event: SportEvent;
  squad: OrgSquad;
  member: { id: string; name: string };
  /** 同一項目的所有隊伍（含本隊） */
  eventSquads: OrgSquad[];
  isAdmin: boolean;
}): string | null {
  const { settings, event, squad, member, eventSquads, isAdmin } = args;
  const closed = checkWritable(settings, isAdmin);
  if (closed) return closed;
  if (squad.submitted_at) return '已送出的隊伍不可調整，請先取消送出';
  if (squad.member_ids.includes(member.id)) return `${member.name} 已在這一隊`;
  if (eventSquads.some((s) => s.id !== squad.id && s.member_ids.includes(member.id))) {
    return `${member.name} 已加入其他「${event.name}」隊伍（每人只能參加一隊）`;
  }
  if (squad.member_ids.length >= event.max_per_team) return `「${event.name}」每隊最多 ${event.max_per_team} 人`;
  return null;
}
