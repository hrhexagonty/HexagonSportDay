// 報名規則（純函式）：
// - evaluate*：計算隊伍 / 項目的完成度與問題清單，供畫面顯示
// - check*：寫入前的檢查，回傳錯誤訊息或 null；展示模式直接用它當作「資料庫限制」
// 與 DB trigger（supabase/migrations）規則需保持一致

import type { EventEntry, Member, Settings, SportEvent, Team } from './types';

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
  const issues: Issue[] = [];
  const n = teamMembers.length;

  if (n > settings.team_max_size) {
    issues.push({ level: 'error', message: `隊伍人數 ${n} 人，超過上限 ${settings.team_max_size} 人` });
  } else if (n < settings.team_min_size) {
    issues.push({ level: 'warning', message: `隊伍人數 ${n} 人，未達下限 ${settings.team_min_size} 人` });
  }

  const perMember = new Map<string, number>();
  for (const e of teamEntries) perMember.set(e.member_id, (perMember.get(e.member_id) ?? 0) + 1);
  for (const [memberId, count] of perMember) {
    if (count > settings.max_events_per_member) {
      const name = membersById.get(memberId)?.name ?? '未知隊員';
      issues.push({
        level: 'error',
        message: `${name} 報名 ${count} 項，超過每人上限 ${settings.max_events_per_member} 項`,
      });
    }
  }

  const eventStatuses = sortEvents(events).map((ev) => evaluateEvent(ev, teamEntries, membersById));
  for (const s of eventStatuses) {
    for (const i of s.issues) issues.push({ ...i, message: `【${s.event.name}】${i.message}` });
  }

  return {
    memberCount: n,
    femaleCount: teamMembers.filter((m) => m.gender === 'F').length,
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
  /** 該隊員目前所有報名 */
  memberEntries: EventEntry[];
  isAdmin: boolean;
}): string | null {
  const { settings, event, member, teamEntries, memberEntries, isAdmin } = args;
  const closed = checkWritable(settings, isAdmin);
  if (closed) return closed;
  if (memberEntries.some((e) => e.event_id === event.id)) return `${member.name} 已報名「${event.name}」`;
  const count = teamEntries.filter((e) => e.event_id === event.id).length;
  if (count >= event.max_per_team) return `「${event.name}」每隊最多 ${event.max_per_team} 人`;
  if (memberEntries.length >= settings.max_events_per_member) {
    return `${member.name} 已報名 ${memberEntries.length} 項，每人最多 ${settings.max_events_per_member} 項`;
  }
  return null;
}
