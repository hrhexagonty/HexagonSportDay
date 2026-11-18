import { describe, expect, it } from 'vitest';
import {
  checkAddEntry,
  checkAddMembers,
  checkAddSquadMember,
  checkSubmitSquad,
  evaluateSquad,
  evaluateEvent,
  evaluateTeam,
  isMergedTeam,
  registrationOpen,
} from './rules';
import type { EventEntry, Gender, Member, OrgSquad, Settings, SportEvent } from './types';

const settings: Settings = {
  event_title: '測試運動會',
  event_date: null,
  venue: null,
  registration_open: true,
  registration_deadline: null,
  total_team_target: 24,
  team_min_size: 4,
  team_max_size: 6,
  max_events_per_member: 2,
};

const relay: SportEvent = {
  id: 'fun1',
  name: '毛毛蟲大隊接力',
  category: 'fun',
  description: '',
  min_per_team: 3,
  max_per_team: 3,
  min_female: 1,
  sort_order: 1,
  rules: '',
  video_url: '',
};

const optional: SportEvent = { ...relay, id: 'opt', name: '選填項目', min_per_team: 0, max_per_team: 2, min_female: 1, sort_order: 2 };

function member(id: string, gender: Gender): Member {
  return { id, team_id: 't1', org_id: 'o1', name: `隊員${id}`, gender, private: null };
}

const entry = (event_id: string, member_id: string): EventEntry => ({ event_id, member_id });

describe('registrationOpen', () => {
  it('開關關閉時視為截止', () => {
    expect(registrationOpen({ registration_open: false, registration_deadline: null })).toBe(false);
  });
  it('超過截止時間視為截止', () => {
    const s = { registration_open: true, registration_deadline: '2026-01-01T00:00:00Z' };
    expect(registrationOpen(s, new Date('2025-12-31T23:59:00Z'))).toBe(true);
    expect(registrationOpen(s, new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('evaluateEvent', () => {
  const members = [member('a', 'M'), member('b', 'M'), member('c', 'F')];
  const byId = new Map(members.map((m) => [m.id, m]));

  it('人數與女性人數皆符合時為完成', () => {
    const s = evaluateEvent(relay, [entry('fun1', 'a'), entry('fun1', 'b'), entry('fun1', 'c')], byId);
    expect(s.level).toBe('complete');
    expect(s.female).toBe(1);
  });

  it('女性不足時為未完成', () => {
    const s = evaluateEvent(relay, [entry('fun1', 'a'), entry('fun1', 'b')], byId);
    expect(s.level).toBe('incomplete');
    expect(s.issues.map((i) => i.message).join()).toContain('女性至少 1 人');
  });

  it('選填項目沒人報名時視為完成，有人報名才檢查女性人數', () => {
    expect(evaluateEvent(optional, [], byId).level).toBe('complete');
    expect(evaluateEvent(optional, [entry('opt', 'a')], byId).level).toBe('incomplete');
  });
});

describe('evaluateTeam', () => {
  it('隊員超過每人項目上限時為錯誤', () => {
    const members = [member('a', 'M'), member('b', 'F'), member('c', 'F'), member('d', 'M')];
    const entries = [entry('fun1', 'a'), entry('opt', 'a'), entry('x', 'a')];
    const s = evaluateTeam(settings, [relay, optional], members, entries);
    expect(s.level).toBe('error');
    expect(s.issues.some((i) => i.message.includes('超過每人上限'))).toBe(true);
  });

  it('人數不足下限時為未完成', () => {
    const s = evaluateTeam(settings, [], [member('a', 'M')], []);
    expect(s.level).toBe('incomplete');
    expect(s.sizeIssues).toHaveLength(1);
  });

  it('健力比賽以公司為單位報名，不列入隊伍檢核', () => {
    const pl: SportEvent = { ...relay, id: 'pl', name: '健力比賽', category: 'powerlifting', sort_order: 0 };
    const members = [member('a', 'M'), member('b', 'F'), member('c', 'F'), member('d', 'M')];
    const entries = ['a', 'b', 'c'].map((id) => entry('fun1', id));
    const s = evaluateTeam(settings, [pl, relay], members, entries);
    expect(s.events.map((e) => e.event.id)).toEqual(['fun1']);
    expect(s.level).toBe('complete');
  });
});

describe('checkAddEntry', () => {
  const a = member('a', 'M');
  const base = { settings, event: relay, member: a, teamEntries: [], memberEntries: [], isAdmin: false };

  it('可正常報名', () => {
    expect(checkAddEntry(base)).toBeNull();
  });
  it('項目額滿時拒絕', () => {
    const full = [entry('fun1', 'x'), entry('fun1', 'y'), entry('fun1', 'z')];
    expect(checkAddEntry({ ...base, teamEntries: full })).toContain('每隊最多');
  });
  it('個人項目數達上限時拒絕', () => {
    expect(checkAddEntry({ ...base, memberEntries: [entry('p', 'a'), entry('q', 'a')] })).toContain('每人最多');
  });
  it('截止後一般單位不可報名，管理員可以', () => {
    const closed = { ...settings, registration_open: false };
    expect(checkAddEntry({ ...base, settings: closed })).toContain('截止');
    expect(checkAddEntry({ ...base, settings: closed, isAdmin: true })).toBeNull();
  });
});

describe('checkAddMembers', () => {
  it('超過隊伍人數上限時拒絕', () => {
    expect(checkAddMembers(settings, 5, 1, false)).toBeNull();
    expect(checkAddMembers(settings, 5, 2, false)).toContain('上限');
  });
});

describe('聯隊', () => {
  it('參與公司超過 1 家即為聯隊', () => {
    expect(isMergedTeam({ org_ids: ['A'] })).toBe(false);
    expect(isMergedTeam({ org_ids: [] })).toBe(false);
    expect(isMergedTeam({ org_ids: ['A', 'C', 'D'] })).toBe(true);
  });
});

describe('公司組隊（健力）', () => {
  const pl: SportEvent = {
    ...relay,
    id: 'pl',
    name: '健力比賽',
    category: 'powerlifting',
    min_per_team: 4,
    max_per_team: 4,
    min_female: 2,
  };
  const squad = (id: string, member_ids: string[], submitted = false): OrgSquad => ({
    id,
    org_id: 'o1',
    event_id: 'pl',
    submitted_at: submitted ? '2027-01-01T00:00:00Z' : null,
    created_at: '2027-01-01T00:00:00Z',
    member_ids,
  });

  it('健力不能以隊伍報名', () => {
    const msg = checkAddEntry({ settings, event: pl, member: member('a', 'M'), teamEntries: [], memberEntries: [], isAdmin: false });
    expect(msg).toContain('改以公司為單位');
  });

  it('健力報名不計入每人項目數', () => {
    const members = [member('a', 'M'), member('b', 'F'), member('c', 'F'), member('d', 'M')];
    const entries = [entry('fun1', 'a'), entry('opt', 'a'), entry('pl', 'a')];
    const s = evaluateTeam(settings, [relay, optional, pl], members, entries);
    expect(s.loadIssues).toEqual([]);
  });

  it('送出前檢查人數與女性下限', () => {
    expect(checkSubmitSquad(pl, ['M', 'M', 'F'])).toContain('每隊需 4 人（目前 3 人）');
    expect(checkSubmitSquad(pl, ['M', 'M', 'M', 'F'])).toContain('女性至少 2 人');
    expect(checkSubmitSquad(pl, ['M', 'M', 'F', 'F'])).toBeNull();
    expect(evaluateSquad(pl, ['M', 'F']).issues.map((i) => i.message)).toEqual([
      '尚缺 2 人（每隊 4 人）',
      '女性至少 2 人（目前 1 人）',
    ]);
  });

  it('一人只能一隊、已送出不可調整、不超過上限', () => {
    const a = { id: 'a', name: '隊員a' };
    const base = { settings, event: pl, member: a, isAdmin: false };
    const s1 = squad('s1', []);
    const s2 = squad('s2', ['a']);
    expect(checkAddSquadMember({ ...base, squad: s1, eventSquads: [s1, s2] })).toContain('每人只能參加一隊');
    expect(checkAddSquadMember({ ...base, squad: squad('s3', [], true), eventSquads: [] })).toContain('取消送出');
    expect(checkAddSquadMember({ ...base, squad: squad('s4', ['b', 'c', 'd', 'e']), eventSquads: [] })).toContain('最多 4 人');
    expect(checkAddSquadMember({ ...base, squad: s1, eventSquads: [s1] })).toBeNull();
  });
});
