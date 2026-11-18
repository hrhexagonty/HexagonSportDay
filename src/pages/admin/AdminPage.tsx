import { useState } from 'react';
import { ErrorBox, Eyebrow, Loading, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import Exports from './Exports';
import ContactsManager from './ContactsManager';
import Overview from './Overview';
import SettingsEditor from './SettingsEditor';
import TeamSetup from './TeamSetup';
import type { AdminData } from './types';

type Tab = 'overview' | 'setup' | 'contacts' | 'settings' | 'export';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const q = useAsync(async (): Promise<AdminData> => {
    const [settings, events, orgs, teams, invites, contacts, members, entries] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrganizations(),
      api.listTeams(),
      api.listTeamInvites(),
      api.listTeamContacts(),
      api.listMembers(),
      api.listEntries(),
    ]);
    return { settings, events, orgs, teams, invites, contacts, members, entries };
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>Admin console</Eyebrow>
          <h1>管理後台</h1>
          <p className="muted">掌握各隊填報進度、配置公司與隊伍、管理窗口與邀請碼、比賽規則、匯出名單。</p>
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
          { value: 'setup', label: '隊伍配置' },
          { value: 'contacts', label: '窗口與邀請碼' },
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
          {tab === 'setup' && <TeamSetup data={q.data} onChanged={q.reload} />}
          {tab === 'contacts' && <ContactsManager data={q.data} onChanged={q.reload} />}
          {tab === 'settings' && <SettingsEditor key={JSON.stringify(q.data.settings)} data={q.data} onChanged={q.reload} />}
          {tab === 'export' && <Exports data={q.data} onChanged={q.reload} />}
        </>
      )}
    </div>
  );
}
