import { createContext, useContext } from 'react';

export type Tab = 'home' | 'events' | 'team' | 'stats' | 'scorers' | 'cards' | 'cash' | 'jerseys' | 'settings';
export interface Route {
  tab: Tab;
  eventId?: string;
  playerId?: string;
}

interface NavApi {
  route: Route;
  go: (r: Route) => void;
  back: () => void;
}

export const NavCtx = createContext<NavApi>({ route: { tab: 'home' }, go: () => {}, back: () => {} });
export const useNav = () => useContext(NavCtx);

export const TABS: { tab: Tab; label: string; icon: string; mobile?: boolean }[] = [
  { tab: 'home', label: 'Übersicht', icon: 'home', mobile: true },
  { tab: 'events', label: 'Termine', icon: 'calendar', mobile: true },
  { tab: 'team', label: 'Kader', icon: 'users', mobile: true },
  { tab: 'cash', label: 'Kasse', icon: 'wallet', mobile: true },
  { tab: 'stats', label: 'Auswertung', icon: 'chart' },
  { tab: 'scorers', label: 'Torschützen', icon: 'trophy' },
  { tab: 'cards', label: 'Karten', icon: 'cards' },
  { tab: 'jerseys', label: 'Trikots', icon: 'shirt' },
  { tab: 'settings', label: 'Einstellungen', icon: 'settings' },
];
