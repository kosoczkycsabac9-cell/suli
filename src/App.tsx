import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { api, IS_DEMO } from '@/lib/api';
import { Icon, type IconName } from '@/components/Icon';
import { ToastProvider } from '@/components/ui';
import { Dashboard } from '@/pages/Dashboard';
import { Cleaner } from '@/pages/Cleaner';
import { Startup } from '@/pages/Startup';
import { Performance } from '@/pages/Performance';
import { Network } from '@/pages/Network';
import { Privacy } from '@/pages/Privacy';
import { Tools } from '@/pages/Tools';
import { RestoreCenter } from '@/pages/RestoreCenter';
import { Settings } from '@/pages/Settings';

export type PageId =
  | 'dashboard'
  | 'cleaner'
  | 'startup'
  | 'performance'
  | 'network'
  | 'privacy'
  | 'tools'
  | 'restore'
  | 'settings';

const NAV: { id: PageId; label: string; icon: IconName; title: string; subtitle: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', title: 'Dashboard', subtitle: 'Rendszerállapot valós időben' },
  { id: 'cleaner', label: 'Cleaner', icon: 'broom', title: 'Cleaner', subtitle: 'Ideiglenes és felesleges fájlok biztonságos eltávolítása' },
  { id: 'startup', label: 'Startup', icon: 'rocket', title: 'Startup Manager', subtitle: 'A Windowszal induló alkalmazások kezelése' },
  { id: 'performance', label: 'Performance', icon: 'gauge', title: 'Performance Optimizer', subtitle: 'Biztonságos, visszavonható teljesítménybeállítások' },
  { id: 'network', label: 'Network', icon: 'network', title: 'Network Optimizer', subtitle: 'Adapterek, IP/DNS konfiguráció és diagnosztika' },
  { id: 'privacy', label: 'Privacy', icon: 'shield', title: 'Privacy', subtitle: 'Telemetria és adatgyűjtés kézben tartása' },
  { id: 'tools', label: 'Tools', icon: 'tools', title: 'Windows Tools', subtitle: 'Natív Windows karbantartó eszközök' },
  { id: 'restore', label: 'Restore Center', icon: 'history', title: 'Restore Center', subtitle: 'Backupok, visszaállítási pontok és műveleti napló' },
  { id: 'settings', label: 'Settings', icon: 'settings', title: 'Settings', subtitle: 'Az alkalmazás beállításai' },
];

export default function App() {
  const [page, setPage] = useState<PageId>('dashboard');
  const [elevated, setElevated] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void api.app.getInfo().then((r) => r.ok && setElevated(r.data.isElevated));
    void api.settings.get().then((r) => r.ok && setSettings(r.data));
  }, []);

  // Téma és accent szín alkalmazása a :root-ra.
  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.theme = settings.theme === 'system' ? 'dark' : settings.theme;
  }, [settings]);

  const current = NAV.find((n) => n.id === page)!;

  async function requestAdmin() {
    const result = await api.app.relaunchAsAdmin();
    if (!result.ok) console.warn(result.error);
  }

  function renderPage() {
    switch (page) {
      case 'dashboard':
        return <Dashboard onNavigate={setPage} />;
      case 'cleaner':
        return <Cleaner />;
      case 'startup':
        return <Startup />;
      case 'performance':
        return <Performance />;
      case 'network':
        return <Network />;
      case 'privacy':
        return <Privacy />;
      case 'tools':
        return <Tools />;
      case 'restore':
        return <RestoreCenter />;
      case 'settings':
        return <Settings onSettingsChange={setSettings} />;
    }
  }

  return (
    <ToastProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="zap" size={19} strokeWidth={2.2} />
            </div>
            <div className="brand-text">
              <div className="brand-name">WinOptimizer</div>
              <div className="brand-sub">Windows 10 / 11</div>
            </div>
          </div>

          <nav className="nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
                aria-current={page === item.id}
                title={item.label}
              >
                <Icon name={item.icon} size={17} />
                <span className="label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className={`privilege-chip ${elevated ? 'elevated' : ''}`} title={elevated ? 'Rendszergazdai módban fut' : 'Normál felhasználói jogosultság'}>
              <Icon name={elevated ? 'shield' : 'lock'} size={15} />
              <span className="label">{elevated ? 'Rendszergazda' : 'Normál jogosultság'}</span>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h1>{current.title}</h1>
              <p>{current.subtitle}</p>
            </div>
            <div className="topbar-actions">
              {IS_DEMO && <span className="chip warning">Demó mód</span>}
              {!elevated && !IS_DEMO && (
                <button className="btn btn-secondary btn-sm" onClick={() => void requestAdmin()}>
                  <Icon name="lock" size={13} /> Újraindítás rendszergazdaként
                </button>
              )}
            </div>
          </header>

          {renderPage()}
        </main>
      </div>
    </ToastProvider>
  );
}
