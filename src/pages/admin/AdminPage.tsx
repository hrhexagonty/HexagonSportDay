import { useState } from 'react';
import { ErrorBox, Loading, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import Exports from './Exports';
import OrgsManager from './OrgsManager';
import Overview from './Overview';
import SettingsEditor from './SettingsEditor';
import TeamsManager from './TeamsManager';
import type { AdminData } from './types';

type Tab = 'overview' | 'orgs' | 'teams' | 'settings' | 'export';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const q = useAsync(async (): Promise<AdminData> => {
    const [settings, events, orgs, teams, members, entries] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrganizations(),
      api.listTeams(),
      api.listMembers(),
      api.listEntries(),
    ]);
    return { settings, events, orgs, teams, members, entries };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>管理後台</h1>
          <p className="muted">掌握各公司填報進度、管理公司額度與聯隊、比賽規則、匯出名單。</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={q.reload} disabled={q.loading}>
          {q.loading ? '更新中…' : '重新整理'}
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: '填報總覽' },
          { value: 'orgs', label: '公司管理' },
          { value: 'teams', label: '隊伍管理' },
          { value: 'settings', label: '活動與項目設定' },
          { value: 'export', label: '匯出名單' },
        ]}
      />
      {!q.data ? (
        q.error ? (
          <ErrorBox message={q.error} onRetry={q.reload} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          {tab === 'overview' && <Overview data={q.data} />}
          {tab === 'orgs' && <OrgsManager data={q.data} onChanged={q.reload} />}
          {tab === 'teams' && <TeamsManager data={q.data} onChanged={q.reload} />}
          {tab === 'settings' && <SettingsEditor key={JSON.stringify(q.data.settings)} data={q.data} onChanged={q.reload} />}
          {tab === 'export' && <Exports data={q.data} onChanged={q.reload} />}
        </>
      )}
    </div>
  );
}
