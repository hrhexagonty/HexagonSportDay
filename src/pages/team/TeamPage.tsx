import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Badge, EmptyState, ErrorBox, Eyebrow, Field, Loading, StatusBadge, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull } from '../../lib/format';
import { evaluateTeam, isMergedTeam, registrationOpen } from '../../lib/rules';
import { useAsync } from '../../lib/useAsync';
import EventsPanel from './EventsPanel';
import MembersPanel from './MembersPanel';
import type { TeamPageData } from './types';

function TeamInfo({ data }: { data: TeamPageData }) {
  const { team, editable, reload } = data;
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', captain: '', phone: '' });

  function startEdit() {
    setForm({ name: team.name, captain: team.captain_name ?? '', phone: team.captain_phone ?? '' });
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      // 隊名只有管理員能改（窗口送出隊名會被資料庫拒絕）
      await api.updateTeam(team.id, {
        ...(data.isAdmin ? { name: form.name.trim() } : {}),
        captain_name: blankToNull(form.captain),
        captain_phone: blankToNull(form.phone),
      });
      toast.ok('隊伍資料已更新');
      setEditing(false);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove() {
    if (!confirm(`確定要刪除「${team.name}」？隊員與項目報名資料將一併刪除，無法復原。`)) return;
    try {
      await api.deleteTeam(team.id);
      toast.ok('隊伍已刪除');
      navigate('/admin');
    } catch (err) {
      toast.error(err);
    }
  }

  if (editing) {
    return (
      <form className="card stack" onSubmit={save}>
        <div className="row-3">
          <Field label="隊名" hint={data.isAdmin ? undefined : '隊名由活動小組設定'}>
            <input
              required
              disabled={!data.isAdmin}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="隊長姓名">
            <input value={form.captain} onChange={(e) => setForm({ ...form, captain: e.target.value })} />
          </Field>
          <Field label="隊長電話">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <div className="actions">
          <button className="btn btn-primary">儲存</button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            取消
          </button>
        </div>
      </form>
    );
  }

  const companies = team.org_ids.map((id) => data.orgNames.get(id) ?? '—').join('、');

  return (
    <div className="page-head">
      <div>
        <Eyebrow>{data.merged ? 'Merged team' : 'Team'}</Eyebrow>
        <div className="title-row">
          <h1>{team.name}</h1>
          {data.merged && <Badge tone="accent">聯隊</Badge>}
          <StatusBadge level={data.status.level} />
        </div>
        <p className="muted">
          {data.merged ? '參與公司' : '公司'}：{companies} · 隊長：{team.captain_name ?? '未填寫'}
          {team.captain_phone ? `（${team.captain_phone}）` : ''}
        </p>
      </div>
      {editable && (
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={startEdit}>
            {data.isAdmin ? '編輯隊伍資料' : '編輯隊長資料'}
          </button>
          {data.isAdmin && (
            <button className="btn btn-danger-ghost btn-sm" onClick={remove}>
              刪除隊伍
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { teamId = '' } = useParams();
  const { isAdmin, isVendor, session } = useAuth();
  const [tab, setTab] = useState<'members' | 'events'>('members');

  const q = useAsync(async () => {
    const [settings, events, team, members, entries, orgNames] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.getTeam(teamId),
      api.listMembers({ teamId }),
      api.listEntries({ teamId }),
      api.listOrgNames(),
    ]);
    return { settings, events, team, members, entries, orgNames: new Map(orgNames.map((o) => [o.id, o.name])) };
  }, [teamId]);

  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const { settings, events, team, members, entries, orgNames } = q.data;
  if (!team) return <EmptyState title="找不到隊伍">隊伍可能已被刪除，或您沒有檢視權限。</EmptyState>;

  // 自己在這隊代表的公司（以哪家公司的邀請碼加入）；管理員為 null
  const myOrgId = session?.teams.find((t) => t.teamId === team.id)?.orgId ?? null;
  const data: TeamPageData = {
    settings,
    events,
    team,
    members,
    entries,
    status: evaluateTeam(settings, events, members, entries),
    orgNames,
    merged: isMergedTeam(team),
    myOrgId,
    defaultOrgId: myOrgId && team.org_ids.includes(myOrgId) ? myOrgId : team.org_ids[0],
    editable: isAdmin || (!isVendor && registrationOpen(settings)),
    isAdmin,
    isVendor,
    reload: q.reload,
  };
  const staff = isAdmin || isVendor;

  return (
    <div className="page">
      <Link className="back-link" to={staff ? '/admin' : '/org'}>
        ← 回{staff ? '管理後台' : '我的隊伍'}
      </Link>
      <TeamInfo data={data} />

      {isVendor ? (
        <div className="notice notice-info">委外廠商檢視：資料僅供檢視，隊員的證號、生日、手機與隊長電話已隱碼。</div>
      ) : (
        !data.editable && <div className="notice notice-err">報名已截止，資料僅供檢視。</div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'members', label: `隊員名單（${members.length}）` },
          { value: 'events', label: '項目報名' },
        ]}
      />
      {tab === 'members' ? <MembersPanel data={data} /> : <EventsPanel data={data} />}
    </div>
  );
}
