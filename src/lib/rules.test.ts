import { describe, expect, it } from 'vitest';
import {
  checkAddEntry,
  checkAddMembers,
  evaluateEvent,
  evaluateTeam,
  isMergedTeam,
  registrationOpen,
} from './rules';
import type { EventEntry, Gender, Member, Settings, SportEvent } from './types';

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
