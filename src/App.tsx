import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from './data/store';
import { NavCtx, Route, TABS, Tab } from './nav';
import { Icon } from './components/Icon';
import { handleBack, Sheet } from './components/ui';
import { hideSplash, onAndroidBack, styleStatusBar } from './lib/native';
import { onReminderTap, scheduleReminders } from './lib/reminders';
import { Login } from './views/Login';
import { Dashboard } from './views/Dashboard';
import { EventsView } from './views/Events';
import { EventDetail } from './views/EventDetail';
import { TeamView } from './views/Team';
import { PlayerDetail } from './views/PlayerDetail';
import { StatsView } from './views/Stats';
import { CashView } from './views/Cash';
import { JerseysView } from './views/Jerseys';
import { SettingsView } from './views/Settings';

function useTheme(theme?: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
    else delete root.dataset.theme;
    const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const color = dark ? '#13231b' : '#0a6b3a';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
    styleStatusBar(dark, color);
  }, [theme]);
}

export function App() {
  const store = useStore();
  const { phase, club } = store;
  useTheme(club.theme);

  const [stack, setStack] = useState<Route[]>([{ tab: 'home' }]);
  const route = stack[stack.length - 1];
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (phase !== 'booting') hideSplash();
  }, [phase]);

  // Erinnerungen bei jeder Änderung an Terminen oder Zusagen neu planen (nur in der App)
  useEffect(() => {
    if (phase !== 'ready' || store.backend?.kind !== 'cloud') return;
    const t = setTimeout(() => scheduleReminders(store.events, store.players).catch(console.warn), 1500);
    return () => clearTimeout(t);
  }, [phase, store.events, store.players, store.backend]);

  const go = useCallback((r: Route) => {
    setStack((s) => {
      const top = s[s.length - 1];
      // Wechsel des Hauptbereichs beginnt einen neuen Verlauf, Detailseiten stapeln
      if (!r.eventId && !r.playerId) {
        if (top.tab === r.tab && !top.eventId && !top.playerId) return s;
        return r.tab === 'home' ? [r] : [{ tab: 'home' }, r];
      }
      return [...s, r];
    });
    setMoreOpen(false);
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  // Tippen auf eine Erinnerung öffnet den Termin
  useEffect(() => {
    let off = () => {};
    onReminderTap((id) => go({ tab: 'events', eventId: id }))
      .then((f) => (off = f))
      .catch(() => {});
    return () => off();
  }, [go]);

  // Android-Zurück-Taste: erst Fenster schließen, dann eine Seite zurück, sonst App minimieren
  useEffect(() => {
    let off = () => {};
    onAndroidBack(() => {
      if (handleBack()) return true;
      if (stackRef.current.length > 1) {
        setStack((s) => s.slice(0, -1));
        return true;
      }
      return false;
    })
      .then((f) => (off = f))
      .catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && handleBack();
    window.addEventListener('keydown', esc);
    return () => {
      off();
      window.removeEventListener('keydown', esc);
    };
  }, []);

  if (phase === 'booting')
    return (
      <div className="boot" role="status" aria-label="TeamTime wird geladen">
        <img src={club.clubLogoUrl || './wappen.png'} alt="" />
        <strong>TeamTime</strong>
        <span className="boot-bar" />
      </div>
    );
  if (phase === 'login' || !store.backend) return <Login />;

  const page = (() => {
    if (route.eventId) return <EventDetail id={route.eventId} />;
    if (route.playerId) return <PlayerDetail id={route.playerId} />;
    switch (route.tab) {
      case 'events':
        return <EventsView />;
      case 'team':
        return <TeamView />;
      case 'stats':
        return <StatsView />;
      case 'cash':
        return <CashView />;
      case 'jerseys':
        return <JerseysView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  })();

  const isActive = (t: Tab) => route.tab === t;
  const moreActive = !TABS.find((t) => t.tab === route.tab)?.mobile;

  return (
    <NavCtx.Provider value={{ route, go, back }}>
      <div className="shell">
        <aside className="sidebar">
          <button className="brand" onClick={() => go({ tab: 'home' })}>
            <img src={club.clubLogoUrl || './wappen.png'} alt="" />
            <span>
              <strong>{club.clubName}</strong>
              {club.teamName && <small>{club.teamName}</small>}
            </span>
          </button>
          <nav aria-label="Hauptnavigation">
            {TABS.map((t) => (
              <button key={t.tab} className={'side-link' + (isActive(t.tab) ? ' on' : '')} onClick={() => go({ tab: t.tab })} aria-current={isActive(t.tab) ? 'page' : undefined}>
                <Icon name={t.icon} />
                {t.label}
              </button>
            ))}
          </nav>
          <SyncBadge />
        </aside>

        <header className="topbar">
          <img src={club.clubLogoUrl || './wappen.png'} alt="" />
          <div className="topbar-name">
            <strong>{club.clubName}</strong>
            {club.teamName && <small>{club.teamName}</small>}
          </div>
          <SyncBadge compact />
        </header>

        <main className="main" ref={mainRef}>
          {store.error && (
            <div className="banner banner-warn">
              <Icon name="alert" />
              {store.error}
            </div>
          )}
          <div className="page" key={JSON.stringify(route)}>
            {page}
          </div>
        </main>

        <nav className="bottomnav" aria-label="Hauptnavigation">
          {TABS.filter((t) => t.mobile).map((t) => (
            <button key={t.tab} className={isActive(t.tab) ? 'on' : ''} onClick={() => go({ tab: t.tab })} aria-current={isActive(t.tab) ? 'page' : undefined}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
          <button className={moreActive ? 'on' : ''} onClick={() => setMoreOpen(true)}>
            <Icon name="more" />
            <span>Mehr</span>
          </button>
        </nav>

        {moreOpen && (
          <Sheet title="Mehr" onClose={() => setMoreOpen(false)}>
            <div className="more-list">
              {TABS.filter((t) => !t.mobile).map((t) => (
                <button key={t.tab} className="list-row" onClick={() => go({ tab: t.tab })}>
                  <Icon name={t.icon} />
                  <span className="grow">{t.label}</span>
                  <Icon name="chevronRight" size={18} />
                </button>
              ))}
            </div>
          </Sheet>
        )}
      </div>
    </NavCtx.Provider>
  );
}

function SyncBadge({ compact }: { compact?: boolean }) {
  const { backend, meta, online } = useStore();
  let icon = 'cloud';
  let text = 'Gespeichert';
  let tone = 'ok';
  if (backend?.kind === 'demo') {
    icon = 'info';
    text = 'Demo';
    tone = 'info';
  } else if (!online) {
    icon = 'cloudOff';
    text = 'Offline – wird später abgeglichen';
    tone = 'warn';
  } else if (meta.pending) {
    icon = 'repeat';
    text = 'Wird abgeglichen …';
    tone = 'busy';
  }
  return (
    <span className={`sync sync-${tone}` + (compact ? ' sync-compact' : '')} title={text}>
      <Icon name={icon} size={16} />
      <span className="sync-text">{text}</span>
    </span>
  );
}
