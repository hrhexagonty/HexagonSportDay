import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBox, Eyebrow, Loading, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import Exports from './Exports';
import ContactsManager from './ContactsManager';
import Overview from './Overview';
import { ActivitySettings, EventsEditor } from './SettingsEditor';
import Squads from './Squads';
import TeamSetup from './TeamSetup';
import type { AdminData } from './types';

type Tab = 'overview' | 'setup' | 'contacts' | 'squads' | 'settings' | 'events' | 'export';

const TABS: { value: Tab; label: string; vendor: boolean }[] = [
  { value: 'overview', label: '填報總覽', vendor: true },
  { value: 'setup', label: '隊伍配置', vendor: true },
  // 窗口與邀請碼、匯出名單（含完整個資）不開放委外廠商
  { value: 'contacts', label: '窗口與邀請碼', vendor: false },
  { value: 'squads', label: '健力報名', vendor: true },
  { value: 'settings', label: '活動設定', vendor: true },
  { value: 'events', label: '競賽項目設定', vendor: true },
  { value: 'export', label: '匯出名單', vendor: false },
];

/** 委外廠商：只讀得到公司名稱、隊伍（隊長電話隱碼）、隊員（個資隱碼）、報名與健力隊伍 */
async function loadVendorData(): Promise<AdminData> {
  const [settings, events, orgNames, teams, members, entries, squads] = await Promise.all([
    api.getSettings(),
    api.listEvents(),
    api.listOrgNames(),
    api.listTeams(),
    api.listMembers(),
    api.listEntries(),
    api.listOrgSquads(),
  ]);
  const orgs = orgNames.map((o) => ({ ...o, contact_name: null, contact_phone: null }));
  return {
    settings,
    events,
    orgs,
    teams,
    invites: [],
    contacts: [],
    vendors: [],
    vendorContacts: [],
    members,
    entries,
    squads,
    readOnly: true,
  };
}

async function loadAdminData(): Promise<AdminData> {
  const [settings, events, orgs, teams, invites, contacts, vendors, vendorContacts, members, entries, squads] =
    await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrganizations(),
      api.listTeams(),
      api.listTeamInvites(),
      api.listTeamContacts(),
      api.listVendors(),
      api.listVendorContacts(),
      api.listMembers(),
      api.listEntries(),
      api.listOrgSquads(),
    ]);
  return { settings, events, orgs, teams, invites, contacts, vendors, vendorContacts, members, entries, squads, readOnly: false };
}

export default function AdminPage() {
  const { isVendor } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const q = useAsync(() => (isVendor ? loadVendorData() : loadAdminData()), [isVendor]);
  const tabs = TABS.filter((t) => !isVendor || t.vendor);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>{isVendor ? 'Vendor console' : 'Admin console'}</Eyebrow>
          <h1>管理後台</h1>
          <p className="muted">
            {isVendor
              ? '委外廠商：檢視各隊填報進度、隊伍配置與健力報名（僅供檢視，隊員證號、生日、手機已隱碼），並可編輯活動設定、活動指南與競賽項目。'
              : '掌握各隊填報進度、配置公司與隊伍、管理窗口與邀請碼、檢視健力報名、編輯活動指南與競賽規則、匯出名單。'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={q.reload} disabled={q.loading}>
          {q.loading ? '更新中…' : '重新整理'}
        </button>
      </div>
      <Tabs value={tab} onChange={setTab} items={tabs.map(({ value, label }) => ({ value, label }))} />
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
          {tab === 'contacts' && !isVendor && <ContactsManager data={q.data} onChanged={q.reload} />}
          {tab === 'squads' && <Squads data={q.data} onChanged={q.reload} />}
          {tab === 'settings' && <ActivitySettings data={q.data} onChanged={q.reload} />}
          {tab === 'events' && <EventsEditor data={q.data} onChanged={q.reload} />}
          {tab === 'export' && !isVendor && <Exports data={q.data} onChanged={q.reload} />}
        </>
      )}
    </div>
  );
}
