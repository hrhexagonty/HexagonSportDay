import type {
  EventEntry,
  Member,
  OrgSquad,
  Organization,
  Settings,
  SportEvent,
  Team,
  TeamContact,
  TeamInvite,
} from '../../lib/types';

export interface AdminData {
  settings: Settings;
  events: SportEvent[];
  orgs: Organization[];
  teams: Team[];
  invites: TeamInvite[];
  contacts: TeamContact[];
  members: Member[];
  entries: EventEntry[];
  /** 公司組隊（健力） */
  squads: OrgSquad[];
}
