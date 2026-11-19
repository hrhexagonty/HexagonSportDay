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
  legacy: '00000000-0000-0000-0000-0000000000f1', // 改版前以公司邀請碼綁定的窗口
  a: '00000000-0000-0000-0000-0000000000a1', // 甲公司窗口
  b: '00000000-0000-0000-0000-0000000000b1', // 乙公司窗口（聯隊）
  c: '00000000-0000-0000-0000-0000000000c1', // 丙公司窗口（聯隊）
  d: '00000000-0000-0000-0000-0000000000d1',
  e: '00000000-0000-0000-0000-0000000000e1',
  f: '00000000-0000-0000-0000-0000000000f2', // 戊公司（戊一隊）窗口
  g: '00000000-0000-0000-0000-0000000000f3', // 戊公司（戊二隊）窗口
  h: '00000000-0000-0000-0000-0000000000f4', // 己公司窗口
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

/** 以未登入訪客（anon）身分執行 SQL */
async function asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.exec('set role anon');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

/** 模擬 Supabase Auth 註冊（signUp 的 options.data 會寫入 raw_user_meta_data） */
const signUp = (id: string, email: string, meta: Record<string, string> = {}) =>
  db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(meta)]);

const codeOf = async (teamName: string, orgName: string) =>
  (
    await db.query<{ invite_code: string }>(
      `select i.invite_code from team_invites i join teams t on t.id = i.team_id join organizations o on o.id = i.org_id
        where t.name = $1 and o.name = $2`,
      [teamName, orgName],
    )
  ).rows[0].invite_code;

const contactsOf = async (user: string) =>
  (
    await db.query<{ team: string; org: string }>(
      `select t.name team, o.name org from team_contacts c join teams t on t.id = c.team_id
         join organizations o on o.id = c.org_id where c.user_id = $1 order by t.name`,
      [user],
    )
  ).rows;

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
/** 產生通過檢查碼的身分證字號（P 開頭；第 2 碼 1 = 男、2 = 女） */
function twId(gender: 'M' | 'F', seq: number): string {
  const body = `${gender === 'M' ? 1 : 2}${String(seq).padStart(7, '0')}`;
  let sum = 2 + 3 * 9; // P = 23
  [...body].forEach((d, i) => (sum += Number(d) * (8 - i)));
  return `P${body}${(10 - (sum % 10)) % 10}`;
}
const memberId = async (name: string) =>
  (await db.query<{ id: string }>('select id from members where name = $1', [name])).rows[0].id;

beforeAll(async () => {
  // Supabase 環境模擬
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((x) => x.endsWith('.sql'))
    .sort();
  for (const [i, f] of files.entries()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    if (i === 0) {
      // 改版前（init）的資料：窗口以公司邀請碼綁定公司，公司有一支自組隊伍
      await db.exec(`
        insert into auth.users (id, email) values ('${U.legacy}', 'legacy@x.tw');
        insert into organizations (name, team_quota, invite_code) values ('舊公司', 1, 'OLD00001');
        update profiles set org_id = (select id from organizations where name = '舊公司') where id = '${U.legacy}';
        insert into teams (name) values ('舊隊');
        insert into team_orgs select t.id, o.id from teams t, organizations o where t.name = '舊隊' and o.name = '舊公司';
      `);
    }
  }
  await signUp(U.admin, 'admin@x.tw');
  await db.exec(`update profiles set role = 'super_admin' where email = 'admin@x.tw'`);
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

describe('既有資料轉換', () => {
  it('原本綁定公司的窗口改為該公司隊伍的窗口，並產生隊伍邀請碼', async () => {
    expect(await contactsOf(U.legacy)).toEqual([{ team: '舊隊', org: '舊公司' }]);
    expect(await codeOf('舊隊', '舊公司')).toMatch(/^[0-9A-F]{8}$/);
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('organizations', 'profiles')
          and column_name in ('team_quota', 'invite_code', 'org_id')`,
    );
    expect(cols.rows).toEqual([]);
  });
});

describe('管理員建立公司與隊伍', () => {
  it('公司窗口不能建立隊伍', async () => {
    await expect(as(U.legacy, `select create_team('X隊', null, null, '{}')`)).rejects.toThrow('活動小組');
  });

  it('管理員先建公司、再建隊伍，可建立未分配公司的隊伍；每隊每家公司各一組邀請碼', async () => {
    await as(U.admin, `insert into organizations (name) values ('甲'), ('乙'), ('丙')`);
    for (const r of (await db.query<{ name: string; id: string }>('select name, id from organizations')).rows) org[r.name] = r.id;
    const create = async (name: string, orgIds: string[]) =>
      (await as<{ id: string }>(U.admin, `select create_team($1, null, null, $2) id`, [name, orgIds])).rows[0].id;
    team.a = await create('甲一隊', [org['甲']]);
    team.a2 = await create('甲二隊', [org['甲']]);
    team.merged = await create('乙丙聯隊', []);
    // 拖曳配置：之後才把公司加入隊伍
    await as(U.admin, 'select set_team_orgs($1, $2)', [team.merged, [org['乙'], org['丙']]]);
    team.empty = await create('未分配隊', []);

    const n = await db.query<{ name: string; n: number }>(
      `select t.name, count(i.org_id)::int n from teams t left join team_invites i on i.team_id = t.id group by t.name order by t.name`,
    );
    expect(Object.fromEntries(n.rows.map((r) => [r.name, r.n]))).toEqual({ 甲一隊: 1, 甲二隊: 1, 乙丙聯隊: 2, 未分配隊: 0, 舊隊: 1 });
    expect(await codeOf('乙丙聯隊', '乙')).not.toBe(await codeOf('乙丙聯隊', '丙'));
  });

  it('管理員可自訂邀請碼（需 6–20 位英數大寫、不可重複）', async () => {
    await as(U.admin, `update team_invites set invite_code = 'JIA0001' where team_id = $1`, [team.a]);
    await expect(as(U.admin, `update team_invites set invite_code = 'JIA0001' where team_id = $1`, [team.a2])).rejects.toThrow();
    await expect(as(U.admin, `update team_invites set invite_code = 'ab' where team_id = $1`, [team.a2])).rejects.toThrow();
  });
});

describe('前台註冊與綁定隊伍', () => {
  it('未登入先輸入邀請碼，帶出對應的隊伍與公司；前台取不到隊伍清單與邀請碼', async () => {
    const r = await asAnon<{ team_id: string; team_name: string; org_name: string; is_full: boolean }>(
      'select team_id, team_name, org_name, is_full from lookup_team_invite($1)',
      [` ${(await codeOf('乙丙聯隊', '丙')).toLowerCase()} `],
    );
    expect(r.rows).toEqual([{ team_id: team.merged, team_name: '乙丙聯隊', org_name: '丙', is_full: false }]);
    await expect(asAnon('select * from lookup_team_invite($1)', ['NOPE0000'])).rejects.toThrow('邀請碼錯誤');
    await expect(asAnon('select * from team_invites')).rejects.toThrow('permission denied');
    const gone = await db.query<{ a: string | null; b: string | null }>(
      `select to_regprocedure('public.team_options()')::text a, to_regprocedure('public.check_team_invite(uuid, text)')::text b`,
    );
    expect(gone.rows[0]).toEqual({ a: null, b: null });
  });

  it('註冊時依邀請碼綁定隊伍與公司；邀請碼錯誤則整筆註冊失敗', async () => {
    await signUp(U.a, 'a@x.tw', { team_id: team.a, invite_code: 'jia0001' });
    await signUp(U.b, 'b@x.tw', { team_id: team.merged, invite_code: await codeOf('乙丙聯隊', '乙') });
    await signUp(U.c, 'c@x.tw', { team_id: team.merged, invite_code: await codeOf('乙丙聯隊', '丙') });
    expect(await contactsOf(U.a)).toEqual([{ team: '甲一隊', org: '甲' }]);
    expect(await contactsOf(U.b)).toEqual([{ team: '乙丙聯隊', org: '乙' }]);
    expect(await contactsOf(U.c)).toEqual([{ team: '乙丙聯隊', org: '丙' }]);

    await expect(signUp(U.d, 'd@x.tw', { team_id: team.a, invite_code: 'WRONG000' })).rejects.toThrow('邀請碼錯誤');
    const left = await db.query('select 1 from profiles where id = $1', [U.d]);
    expect(left.rows).toHaveLength(0);
  });

  it('窗口人數達上限後無法再綁定，查詢邀請碼時標示已滿', async () => {
    await as(U.admin, 'update teams set contact_limit = 1 where id = $1', [team.a]);
    await expect(signUp(U.d, 'd@x.tw', { team_id: team.a, invite_code: 'JIA0001' })).rejects.toThrow('名額已滿');
    const r = await asAnon<{ is_full: boolean }>('select is_full from lookup_team_invite($1)', ['JIA0001']);
    expect(r.rows[0].is_full).toBe(true);
  });

  it('同一帳號可再加入其他隊伍；重複加入與管理員綁定被擋', async () => {
    await as(U.a, 'select join_team($1, $2)', [team.a2, await codeOf('甲二隊', '甲')]);
    const mine = await as<{ team_name: string; org_name: string }>(U.a, 'select team_name, org_name from my_teams() order by team_name');
    expect(mine.rows).toEqual([
      { team_name: '甲一隊', org_name: '甲' },
      { team_name: '甲二隊', org_name: '甲' },
    ]);
    await expect(as(U.a, 'select join_team($1, $2)', [team.a2, await codeOf('甲二隊', '甲')])).rejects.toThrow('已是該隊窗口');
    await expect(as(U.admin, 'select join_team($1, $2)', [team.a2, await codeOf('甲二隊', '甲')])).rejects.toThrow('管理員');
  });

  it('管理員解除窗口綁定後釋出名額', async () => {
    await as(U.admin, 'delete from team_contacts where user_id = $1 and team_id = $2', [U.a, team.a]);
    await signUp(U.d, 'd@x.tw', { team_id: team.a, invite_code: 'JIA0001' });
    expect(await contactsOf(U.d)).toEqual([{ team: '甲一隊', org: '甲' }]);
    await as(U.admin, 'update teams set contact_limit = 2 where id = $1', [team.a]);
    await as(U.a, 'select join_team($1, $2)', [team.a, 'JIA0001']);
  });
});

describe('窗口權限', () => {
  it('只看得到自己綁定的隊伍；讀不到邀請碼、公司完整資料與他人的綁定', async () => {
    expect((await as(U.a, 'select name from teams order by name')).rows).toEqual([{ name: '甲一隊' }, { name: '甲二隊' }]);
    expect((await as(U.c, 'select name from teams')).rows).toEqual([{ name: '乙丙聯隊' }]);
    expect((await as(U.a, 'select * from team_invites')).rows).toEqual([]);
    expect((await as(U.a, 'select * from organizations')).rows).toEqual([]);
    expect((await as(U.a, 'select name from org_names()')).rows.length).toBeGreaterThanOrEqual(3);
    expect((await as(U.a, 'select team_id from team_contacts')).rows).toHaveLength(2);
    const del = await as(U.a, 'delete from team_contacts where user_id = $1', [U.d]);
    expect(del.affectedRows).toBe(0);
  });

  it('窗口可改隊長資料，不可改隊名、窗口人數，也不可刪除隊伍', async () => {
    await as(U.a, `update teams set captain_name = '王隊長' where id = $1`, [team.a]);
    await expect(as(U.a, `update teams set name = '改名' where id = $1`, [team.a])).rejects.toThrow('活動小組');
    await expect(as(U.a, 'update teams set contact_limit = 9 where id = $1', [team.a])).rejects.toThrow('活動小組');
    const del = await as(U.a, 'delete from teams where id = $1', [team.a]);
    expect(del.affectedRows).toBe(0);
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

  it('聯隊其他公司只多看得到用餐習慣，其餘個資仍看不到；非該隊窗口與訪客什麼都看不到', async () => {
    await as(U.admin, `update member_private set diet = 'vegan' where member_id = $1`, [await memberId('乙二')]);
    const diets = await as<{ member_id: string; diet: string }>(U.c, 'select * from member_diets($1)', [team.merged]);
    const byName = new Map<string, string>();
    for (const r of diets.rows) {
      const n = (await db.query<{ name: string }>('select name from members where id = $1', [r.member_id])).rows[0].name;
      byName.set(n, r.diet);
    }
    expect(Object.fromEntries(byName)).toEqual({ 乙一: 'meat', 乙二: 'vegan', 丙一: 'meat' });
    expect(Object.keys(diets.rows[0]).sort()).toEqual(['diet', 'member_id']);
    // 直接查個資表仍只拿到自己公司的隊員
    const own = await as<{ n: number }>(U.c, 'select count(*)::int n from member_private');
    expect(own.rows[0].n).toBe(1);
    // 不是該隊窗口：查不到；不指定隊伍也只回傳自己隊伍的
    expect((await as(U.a, 'select * from member_diets($1)', [team.merged])).rows).toEqual([]);
    expect((await as(U.c, 'select * from member_diets()')).rows).toHaveLength(3);
    await expect(asAnon('select * from member_diets($1)', [team.merged])).rejects.toThrow('permission denied');
  });

  it('同公司但未綁定該隊的窗口看不到隊員', async () => {
    await addMembers(U.a, team.a2, org['甲'], [row('甲二一', 'M', 'C100000003')]);
    expect((await as(U.d, 'select name from members')).rows).toEqual([]);
  });

  it('只能修改 / 刪除自己公司的隊員', async () => {
    const id = await memberId('乙一');
    await expect(as(U.c, 'select update_member($1, $2)', [id, JSON.stringify(row('乙一改', 'M', 'A123456789'))])).rejects.toThrow('無權限');
    await as(U.b, 'select update_member($1, $2)', [id, JSON.stringify(row('乙一改', 'M', 'A123456789'))]);
    const del = await as(U.c, 'delete from members where id = $1', [await memberId('乙二')]);
    expect(del.affectedRows).toBe(0);
  });

  it('只填姓名與性別也能送出，證號、生日、用餐可之後再補；有填仍照常檢查', async () => {
    const blank = { national_id: '', birthday: '', diet: '', phone: '', shirt_size: '', special_needs: '' };
    await addMembers(U.a, team.a2, org['甲'], [{ name: '甲二二', gender: 'F' }, { name: '甲二三', gender: 'M', ...blank }]);
    const priv = async () =>
      (
        await as<{ name: string; national_id: string | null; birthday: string | null; diet: string | null }>(
          U.a,
          `select m.name, p.national_id, p.birthday::text, p.diet from members m join member_private p on p.member_id = m.id
            where m.name in ('甲二二', '甲二三') order by m.name`,
        )
      ).rows;
    // 未填欄位存成 null；兩位都沒填證號也不會觸發 unique
    expect(await priv()).toEqual([
      { name: '甲二三', national_id: null, birthday: null, diet: null },
      { name: '甲二二', national_id: null, birthday: null, diet: null },
    ]);
    // 用餐未填時，聯隊 / 同隊看到的也是 null
    const diets = await as<{ diet: string | null }>(U.a, 'select diet from member_diets($1) where member_id = $2', [
      team.a2,
      await memberId('甲二二'),
    ]);
    expect(diets.rows).toEqual([{ diet: null }]);

    // 之後補資料：證號仍檢查性別一致、全活動唯一，生日不可在未來
    const id = await memberId('甲二二');
    const patch = (data: object) => as(U.a, 'select update_member($1, $2)', [id, JSON.stringify({ name: '甲二二', gender: 'F', ...data })]);
    await expect(patch({ national_id: 'B200000004' })).rejects.toThrow('已報名');
    await expect(patch({ national_id: twId('M', 901) })).rejects.toThrow('不符');
    await expect(patch({ national_id: 'B200000005' })).rejects.toThrow('national_id');
    await expect(patch({ birthday: '2999-01-01' })).rejects.toThrow('生日');
    await expect(patch({ diet: 'fish' })).rejects.toThrow('diet');
    await patch({ national_id: ` ${twId('F', 901).toLowerCase()} `, birthday: '1991-02-03', diet: 'vegan' });
    expect((await priv())[1]).toEqual({ name: '甲二二', national_id: twId('F', 901), birthday: '1991-02-03', diet: 'vegan' });
    // 也可以改回未填；直接寫入空白證號視為未填
    await patch({ birthday: '1991-02-03' });
    await as(U.a, `update member_private set national_id = '  ', diet = '' where member_id = $1`, [id]);
    expect((await priv())[1]).toEqual({ name: '甲二二', national_id: null, birthday: '1991-02-03', diet: null });
  });
});

describe('項目報名', () => {
  it('聯隊各公司可互相安排選手，每人最多 2 項', async () => {
    const id = await memberId('乙一改');
    await as(U.c, `insert into event_entries (event_id, member_id) values ('fun1', $1)`, [id]);
    await as(U.c, `insert into event_entries (event_id, member_id) values ('fun2', $1)`, [id]);
    await expect(as(U.c, `insert into event_entries (event_id, member_id) values ('fun3', $1)`, [id])).rejects.toThrow('每人最多');
  });

  it('非該隊窗口不能報名', async () => {
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

  it('移除仍有隊員的公司被擋；移除沒有隊員的公司會一併移除其邀請碼與窗口', async () => {
    await expect(as(U.admin, 'select set_team_orgs($1, $2)', [team.merged, [org['丙']]])).rejects.toThrow('仍有隊員');
    await as(U.admin, 'select set_team_orgs($1, $2)', [team.a, []]);
    const r = await db.query<{ n: number; c: number }>(
      `select (select count(*)::int from team_invites where team_id = $1) n, (select count(*)::int from team_contacts where team_id = $1) c`,
      [team.a],
    );
    expect(r.rows[0]).toEqual({ n: 0, c: 0 });
  });

  it('只有管理員能清除個資', async () => {
    await expect(as(U.b, 'select purge_private_data()')).rejects.toThrow('權限不足');
    const r = await as<{ n: number }>(U.admin, 'select purge_private_data() n');
    expect(r.rows[0].n).toBe(7);
  });

  it('刪除公司：隊伍保留，只移除該公司的隊員、邀請碼與窗口', async () => {
    await as(U.admin, `delete from organizations where name = '乙'`);
    const after = await db.query<{ t: number; m: number; i: number }>(
      `select (select count(*)::int from teams where name = '乙丙聯隊') t,
              (select count(*)::int from members where team_id = $1) m,
              (select count(*)::int from team_invites where team_id = $1) i`,
      [team.merged],
    );
    expect(after.rows[0]).toEqual({ t: 1, m: 1, i: 1 });
    expect(await contactsOf(U.b)).toEqual([]);
  });
});

describe('公司組隊（健力）', () => {
  const squad: Record<string, string> = {};
  const ids = async (names: string[]) => Promise.all(names.map(memberId));
  const addTo = (user: string, squadId: string, name: string) =>
    memberId(name).then((id) => as(user, 'insert into org_squad_members (squad_id, member_id) values ($1, $2)', [squadId, id]));
  const submit = (user: string, squadId: string, on: boolean) =>
    as(user, `update org_squads set submitted_at = ${on ? 'now()' : 'null'} where id = $1`, [squadId]);

  beforeAll(async () => {
    await as(U.admin, 'update settings set registration_open = true where id = 1');
    await as(U.admin, `insert into organizations (name) values ('戊'), ('己')`);
    for (const r of (await db.query<{ name: string; id: string }>('select name, id from organizations')).rows) org[r.name] = r.id;
    const create = async (name: string, orgIds: string[]) =>
      (await as<{ id: string }>(U.admin, `select create_team($1, null, null, $2) id`, [name, orgIds])).rows[0].id;
    team.w1 = await create('戊一隊', [org['戊']]);
    team.w2 = await create('戊二隊', [org['戊']]);
    team.j = await create('己隊', [org['己']]);
    await signUp(U.f, 'f@x.tw', { team_id: team.w1, invite_code: await codeOf('戊一隊', '戊') });
    await signUp(U.g, 'g@x.tw', { team_id: team.w2, invite_code: await codeOf('戊二隊', '戊') });
    await signUp(U.h, 'h@x.tw', { team_id: team.j, invite_code: await codeOf('己隊', '己') });
    // 戊公司：一隊 5 男 2 女、二隊 3 男 2 女；己公司 1 女
    let seq = 1;
    const people = (prefix: string, m: number, f: number) => [
      ...Array.from({ length: m }, (_, i) => row(`${prefix}男${i + 1}`, 'M', twId('M', seq++))),
      ...Array.from({ length: f }, (_, i) => row(`${prefix}女${i + 1}`, 'F', twId('F', seq++))),
    ];
    await addMembers(U.f, team.w1, org['戊'], people('戊一', 5, 2));
    await addMembers(U.g, team.w2, org['戊'], people('戊二', 3, 2));
    await addMembers(U.h, team.j, org['己'], people('己', 0, 1));
  });

  it('窗口看得到自己公司各分隊的同仁（只有姓名、性別、分隊），其他公司窗口不行', async () => {
    const r = await as<{ name: string; team_name: string }>(U.f, 'select * from org_roster($1)', [org['戊']]);
    expect(r.rows).toHaveLength(12);
    expect(new Set(r.rows.map((x) => x.team_name))).toEqual(new Set(['戊一隊', '戊二隊']));
    expect(Object.keys(r.rows[0]).sort()).toEqual(['gender', 'member_id', 'name', 'team_id', 'team_name']);
    await expect(as(U.h, 'select * from org_roster($1)', [org['戊']])).rejects.toThrow('無權限');
    // 一般查詢仍只看得到自己綁定隊伍的隊員
    expect((await as(U.f, 'select name from members')).rows).toHaveLength(7);
  });

  it('只有該公司窗口能組隊，且只能為以公司組隊的項目建立', async () => {
    const insert = (user: string, orgName: string, eventId: string) =>
      as<{ id: string }>(user, 'insert into org_squads (org_id, event_id) values ($1, $2) returning id', [org[orgName], eventId]);
    await expect(insert(U.h, '戊', 'powerlifting')).rejects.toThrow('row-level security');
    await expect(insert(U.f, '戊', 'fun1')).rejects.toThrow('不能以公司組隊');
    squad.a = (await insert(U.f, '戊', 'powerlifting')).rows[0].id;
    squad.b = (await insert(U.g, '戊', 'powerlifting')).rows[0].id;
    expect((await as(U.h, 'select id from org_squads')).rows).toEqual([]);
  });

  it('可跨分隊選同公司同仁；不能選他公司、一人只能參加一隊、不超過上限', async () => {
    for (const n of ['戊一男1', '戊一男2', '戊一男3', '戊一男4', '戊一男5', '戊二男1', '戊二男2', '戊二男3', '戊一女1', '戊二女1']) {
      await addTo(U.f, squad.a, n);
    }
    await expect(addTo(U.f, squad.a, '己女1')).rejects.toThrow('同公司');
    await expect(addTo(U.g, squad.b, '戊一男1')).rejects.toThrow('每人只能參加一隊');
    await expect(addTo(U.f, squad.a, '戊一女2')).rejects.toThrow('最多 10 人');
    // 同公司其他分隊的窗口也看得到這支隊伍
    const r = await as<{ n: number }>(U.g, 'select count(*)::int n from org_squad_members where squad_id = $1', [squad.a]);
    expect(r.rows[0].n).toBe(10);
  });

  it('送出時檢查人數與女性下限；送出後不可調整、刪除，取消送出後才能修改', async () => {
    const minFemale = (await db.query<{ n: number }>(`select min_female n from events where id = 'powerlifting'`)).rows[0].n;
    expect(minFemale).toBe(4);
    await expect(submit(U.f, squad.a, true)).rejects.toThrow('女性至少 4 人');
    await as(U.f, 'delete from org_squad_members where squad_id = $1 and member_id = any($2)', [
      squad.a,
      await ids(['戊二男2', '戊二男3']),
    ]);
    await addTo(U.f, squad.a, '戊一女2');
    await addTo(U.f, squad.a, '戊二女2');
    await submit(U.f, squad.a, true);
    await expect(submit(U.g, squad.b, true)).rejects.toThrow('每隊需 10 人（目前 0 人）');

    await expect(addTo(U.f, squad.a, '戊二男2')).rejects.toThrow('已送出');
    const one = await memberId('戊一男1');
    await expect(as(U.f, 'delete from org_squad_members where squad_id = $1 and member_id = $2', [squad.a, one])).rejects.toThrow('已送出');
    await expect(as(U.f, 'delete from org_squads where id = $1', [squad.a])).rejects.toThrow('不可刪除');
    // 隊員在已送出的隊伍中時，不能直接刪除該隊員
    await expect(as(U.f, 'delete from members where id = $1', [one])).rejects.toThrow('已送出');

    await submit(U.g, squad.a, false);
    await as(U.f, 'delete from org_squad_members where squad_id = $1 and member_id = $2', [squad.a, one]);
    const r = await db.query<{ submitted_at: string | null }>('select submitted_at from org_squads where id = $1', [squad.a]);
    expect(r.rows[0].submitted_at).toBeNull();
  });

  it('健力不再以隊伍報名，也不計入每人項目數', async () => {
    const id = await memberId('戊一男2');
    await expect(as(U.f, `insert into event_entries (event_id, member_id) values ('powerlifting', $1)`, [id])).rejects.toThrow(
      '改以公司為單位',
    );
    // 改版前留下的健力報名不刪除，但不計入每人上限（測試設定為每人 2 項）
    await db.exec('alter table event_entries disable trigger event_entries_before_write');
    await db.query(`insert into event_entries (event_id, member_id) values ('powerlifting', $1)`, [id]);
    await db.exec('alter table event_entries enable trigger event_entries_before_write');
    await as(U.f, `insert into event_entries (event_id, member_id) values ('fun1', $1), ('fun2', $1)`, [id]);
  });

  it('截止後窗口不可組隊或調整，管理員可以；影片連結只接受 http(s)', async () => {
    await as(U.admin, 'update settings set registration_open = false where id = 1');
    await expect(addTo(U.f, squad.a, '戊一男1')).rejects.toThrow('截止');
    await addTo(U.admin, squad.a, '戊一男1');
    await as(U.admin, 'update settings set registration_open = true where id = 1');

    await as(U.admin, `update events set rules = '每人三次試舉', video_url = 'https://youtu.be/abc' where id = 'powerlifting'`);
    await expect(as(U.admin, `update events set video_url = 'javascript:alert(1)' where id = 'fun1'`)).rejects.toThrow('video_url');
    await as(U.f, `update events set rules = 'x' where id = 'fun1'`);
    const r = await db.query<{ rules: string }>(`select rules from events where id = 'fun1'`);
    expect(r.rows[0].rules).toBe('');
  });
});
