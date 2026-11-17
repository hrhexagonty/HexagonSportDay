// 資料庫層測試：以 PGlite（WASM Postgres）實際執行 migration，
// 模擬 Supabase 的 auth.uid() 與 anon / authenticated 角色，驗證 RLS、trigger 與 RPC。
// 修改 supabase/migrations 後請務必執行：npx vitest run supabase/tests
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const db = new PGlite();

const U = {
  admin: '00000000-0000-0000-0000-00000000000a',
  a: '00000000-0000-0000-0000-0000000000a1',
  b: '00000000-0000-0000-0000-0000000000b1',
  c: '00000000-0000-0000-0000-0000000000c1',
};
const org: Record<string, string> = {};
const team: Record<string, string> = {};

/** 以某使用者身分（authenticated + JWT sub）執行 SQL */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await db.exec('set role authenticated');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const row = (name: string, gender: 'M' | 'F', id: string) => ({
  name,
  gender,
  national_id: id,
  birthday: '1990-05-12',
  diet: 'meat',
  phone: '0912',
  shirt_size: 'L',
  special_needs: '',
});
const addMembers = (user: string, teamId: string, orgId: string, rows: unknown[]) =>
  as(user, 'select add_members($1, $2, $3)', [teamId, orgId, JSON.stringify(rows)]);
const memberId = async (name: string) =>
  (await db.query<{ id: string }>('select id from members where name = $1', [name])).rows[0].id;

beforeAll(async () => {
  // Supabase 環境模擬
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users values ($1, $2)', [id, `${k}@x.tw`]);
  await db.exec(`update profiles set role = 'super_admin' where email = 'admin@x.tw'`);
  await db.exec(`insert into organizations (name, team_quota, invite_code) values
    ('甲', 1, 'AAAA0001'), ('乙', 0, 'BBBB0001'), ('丙', 0, 'CCCC0001')`);
  for (const r of (await db.query<{ name: string; id: string }>('select name, id from organizations')).rows) org[r.name] = r.id;
}, 60_000);

describe('證號驗證函式', () => {
  it('身分證 / 新式居留證檢查碼、舊式居留證格式', async () => {
    const r = await db.query<Record<string, boolean>>(
      `select tw_id_valid('A123456789') a, tw_id_valid('A123456788') b, tw_id_valid('A800000014') c,
              tw_id_valid('AC12345678') d, tw_id_valid('A323456789') e`,
    );
    expect(r.rows[0]).toEqual({ a: true, b: false, c: true, d: true, e: false });
  });
});

describe('綁定公司與建立隊伍', () => {
  it('窗口以邀請碼綁定公司（不分大小寫）', async () => {
    await as(U.a, `select join_org('aaaa0001')`);
    await as(U.b, `select join_org('BBBB0001')`);
    await as(U.c, `select join_org('CCCC0001')`);
    await expect(as(U.a, `select join_org('BBBB0001')`)).rejects.toThrow('已綁定');
  });

  it('窗口在額度內建立自己公司隊伍，超過額度被擋', async () => {
    const r = await as<{ id: string }>(U.a, `select create_team('甲一隊', null, null, $1) id`, [[org['甲']]]);
    team.a = r.rows[0].id;
    await expect(as(U.a, `select create_team('甲二隊', null, null, $1)`, [[org['甲']]])).rejects.toThrow('上限');
  });

  it('只有管理員能建立聯隊', async () => {
    await expect(as(U.b, `select create_team('聯隊X', null, null, $1)`, [[org['乙'], org['丙']]])).rejects.toThrow('聯隊');
    const r = await as<{ id: string }>(U.admin, `select create_team('乙丙聯隊', null, null, $1) id`, [[org['乙'], org['丙']]]);
    team.merged = r.rows[0].id;
  });

  it('窗口只看得到自己參與的隊伍與自己公司資料', async () => {
    expect((await as(U.a, 'select name from teams')).rows).toEqual([{ name: '甲一隊' }]);
    expect((await as(U.c, 'select name from teams')).rows).toEqual([{ name: '乙丙聯隊' }]);
    expect((await as(U.b, 'select name from organizations')).rows).toEqual([{ name: '乙' }]);
    expect((await as(U.b, 'select name from org_names()')).rows).toHaveLength(3);
  });
});

describe('隊員與個資', () => {
  it('各公司窗口只能新增自己公司的隊員', async () => {
    await addMembers(U.b, team.merged, org['乙'], [row('乙一', 'M', 'A123456789'), row('乙二', 'F', 'b200000004')]);
    await addMembers(U.c, team.merged, org['丙'], [row('丙一', 'M', 'A800000014')]);
    await expect(addMembers(U.b, team.merged, org['丙'], [row('假冒', 'F', 'A900000016')])).rejects.toThrow('row-level security');
    await expect(addMembers(U.a, team.merged, org['甲'], [row('甲X', 'F', 'A900000016')])).rejects.toThrow();
  });

  it('證號全活動唯一、檢查碼與性別錯誤被擋，失敗整批回滾', async () => {
    await expect(addMembers(U.a, team.a, org['甲'], [row('甲一', 'M', 'A123456789')])).rejects.toThrow('已報名');
    await expect(addMembers(U.a, team.a, org['甲'], [row('甲一', 'M', 'A123456788')])).rejects.toThrow('national_id');
    await expect(addMembers(U.a, team.a, org['甲'], [row('甲一', 'F', 'F123456786')])).rejects.toThrow('不符');
    const n = await db.query<{ n: number }>('select count(*)::int n from members where team_id = $1', [team.a]);
    expect(n.rows[0].n).toBe(0);
  });

  it('聯隊其他公司看得到姓名，看不到個資', async () => {
    const r = await as<{ name: string; national_id: string | null }>(
      U.c,
      'select m.name, p.national_id from members m left join member_private p on p.member_id = m.id order by m.name',
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.name, x.national_id]))).toEqual({
      丙一: 'A800000014',
      乙一: null,
      乙二: null,
    });
  });

  it('只能修改 / 刪除自己公司的隊員', async () => {
    const id = await memberId('乙一');
    await expect(as(U.c, 'select update_member($1, $2)', [id, JSON.stringify(row('乙一改', 'M', 'A123456789'))])).rejects.toThrow('無權限');
    await as(U.b, 'select update_member($1, $2)', [id, JSON.stringify(row('乙一改', 'M', 'A123456789'))]);
    const del = await as(U.c, 'delete from members where id = $1', [await memberId('乙二')]);
    expect(del.affectedRows).toBe(0);
  });
});

describe('項目報名', () => {
  it('聯隊各公司可互相安排選手，每人最多 2 項', async () => {
    const id = await memberId('乙一改');
    await as(U.c, `insert into event_entries (event_id, member_id) values ('fun1', $1)`, [id]);
    await as(U.c, `insert into event_entries (event_id, member_id) values ('fun2', $1)`, [id]);
    await expect(as(U.c, `insert into event_entries (event_id, member_id) values ('fun3', $1)`, [id])).rejects.toThrow('每人最多');
  });

  it('未參與隊伍的公司不能報名', async () => {
    const id = await memberId('乙二');
    await expect(as(U.a, `insert into event_entries (event_id, member_id) values ('fun3', $1)`, [id])).rejects.toThrow(
      'row-level security',
    );
  });
});

describe('截止與管理員操作', () => {
  it('報名截止後窗口不可異動，管理員可以', async () => {
    await as(U.admin, 'update settings set registration_open = false where id = 1');
    await expect(addMembers(U.b, team.merged, org['乙'], [row('乙三', 'F', 'A900000016')])).rejects.toThrow('截止');
    await addMembers(U.admin, team.merged, org['乙'], [row('乙三', 'F', 'A900000016')]);
  });

  it('移除仍有隊員的公司被擋', async () => {
    await expect(as(U.admin, 'select set_team_orgs($1, $2)', [team.merged, [org['丙']]])).rejects.toThrow('仍有隊員');
  });

  it('只有管理員能清除個資', async () => {
    await expect(as(U.b, 'select purge_private_data()')).rejects.toThrow('權限不足');
    const r = await as<{ n: number }>(U.admin, 'select purge_private_data() n');
    expect(r.rows[0].n).toBe(4);
  });

  it('刪除公司：聯隊保留只移除該公司隊員；自組隊伍整隊刪除', async () => {
    await as(U.admin, `delete from organizations where name = '乙'`);
    const after = await db.query<{ t: number; m: number }>(
      `select (select count(*)::int from teams where name = '乙丙聯隊') t, (select count(*)::int from members) m`,
    );
    expect(after.rows[0]).toEqual({ t: 1, m: 1 });
    await as(U.admin, `delete from organizations where name = '甲'`);
    const left = await db.query<{ n: number }>('select count(*)::int n from teams');
    expect(left.rows[0].n).toBe(1);
  });
});
