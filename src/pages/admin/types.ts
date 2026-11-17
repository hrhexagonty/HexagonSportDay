import type { EventEntry, Member, Organization, Settings, SportEvent, Team } from '../../lib/types';

export interface AdminData {
  settings: Settings;
  events: SportEvent[];
  orgs: Organization[];
  teams: Team[];
  members: Member[];
  entries: EventEntry[];
}
