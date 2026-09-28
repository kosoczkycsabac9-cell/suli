import type { AppSettings } from '@shared/types';
import { api, IS_DEMO } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, Switch, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface ToggleRow {
  key: keyof AppSettings;
  title: string;
  description: string;
}

const TOGGLES: ToggleRow[] = [
  { key: 'startWithWindows', title: 'Start with Windows', description: 'Az alkalmazás automatikusan elindul bejelentkezéskor (HKCU Run bejegyzés).' },
  { key: 'minimizeToTray', title: 'Minimize to tray', description: 'Bezáráskor a tálcaikonra kicsinyít, nem lép ki teljesen.' },
  { key: 'automaticScan', title: 'Automatic scan', description: 'Időzített, csak olvasó rendszervizsgálat. Semmit nem módosít automatikusan.' },
  { key: 'createRestorePointBeforeOptimization', title: 'Restore point optimalizáció előtt', description: 'Rendszer-visszaállítási pont létrehozása minden rendszerbeállítást módosító művelet előtt (ha van jogosultság).' },
  { key: 'confirmationDialogs', title: 'Confirmation dialogs', description: 'Megerősítés kérése minden módosító művelet előtt. Erősen ajánlott bekapcsolva hagyni.' },
  { key: 'loggingEnabled', title: 'Logging', description: 'Minden művelet naplózása (időbélyeg, régi és új érték, eredmény).' },
];

export function Settings({ onSettingsChange }: { onSettingsChange?: (s: AppSettings) => void }) {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, setData } = useAsyncData<AppSettings>(() => api.settings.get());

  const settings = data;

  async function update(patch: Partial<AppSettings>) {
    if (!settings) return;
    if (patch.confirmationDialogs === false) {
      const proceed = await confirm({
        title: 'Megerősítő párbeszédek kikapcsolása',
        message: 'Kikapcsolva a rendszert módosító műveletek azonnal végrehajtódnak, külön rákérdezés nélkül.',
        danger: true,
        confirmLabel: 'Kikapcsolom',
        details: [{ label: 'Figyelem', items: ['A törlési műveleteknél a megerősítés ettől függetlenül megmarad.'] }],
      });
      if (!proceed) return;
    }

    const result = await api.settings.set(patch);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Nem sikerült menteni', message: result.error });
      return;
    }
    setData(result.data);
    onSettingsChange?.(result.data);
  }

  async function clearLogs() {
    const proceed = await confirm({
      title: 'Napló törlése',
      message: 'Az összes naplóbejegyzés véglegesen törlődik. Ez nem érinti a visszaállítható backupokat.',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!proceed) return;
    await api.logs.clear();
    toast({ kind: 'success', title: 'A napló törölve' });
  }

  if (loading) return <div className="page"><LoadingRows count={6} /></div>;
  if (error || !settings) return <div className="page"><EmptyState icon="alert" title="Nem sikerült betölteni a beállításokat" message={error ?? undefined} /></div>;

  return (
    <div className="page">
      {node}

      <SectionTitle>Általános</SectionTitle>
      <div className="list">
        {TOGGLES.map((row) => (
          <div className="list-row" key={row.key}>
            <div className="list-main">
              <div className="list-title">{row.title}</div>
              <div className="list-sub">{row.description}</div>
            </div>
            <div className="list-actions">
              <Switch
                checked={Boolean(settings[row.key])}
                onChange={(v) => void update({ [row.key]: v } as Partial<AppSettings>)}
                label={row.title}
                disabled={IS_DEMO && row.key === 'startWithWindows'}
              />
            </div>
          </div>
        ))}

        {settings.automaticScan && (
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Vizsgálat gyakorisága</div>
              <div className="list-sub">Milyen gyakran fusson le az automatikus vizsgálat.</div>
            </div>
            <div className="list-actions">
              <select
                className="input"
                value={settings.automaticScanIntervalHours}
                onChange={(e) => void update({ automaticScanIntervalHours: Number(e.target.value) })}
              >
                <option value={6}>6 óránként</option>
                <option value={12}>12 óránként</option>
                <option value={24}>Naponta</option>
                <option value={168}>Hetente</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <SectionTitle>Megjelenés</SectionTitle>
        <div className="list">
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Theme</div>
              <div className="list-sub">Az alkalmazás sötét témájának változata.</div>
            </div>
            <div className="list-actions">
              <select className="input" value={settings.theme} onChange={(e) => void update({ theme: e.target.value as AppSettings['theme'] })}>
                <option value="dark">Dark</option>
                <option value="midnight">Midnight (mélyebb fekete)</option>
                <option value="system">Rendszer szerint</option>
              </select>
            </div>
          </div>
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Accent szín</div>
              <div className="list-sub">A kiemelő szín az egész felületen.</div>
            </div>
            <div className="list-actions">
              <select className="input" value={settings.accent} onChange={(e) => void update({ accent: e.target.value as AppSettings['accent'] })}>
                <option value="blue">Kék</option>
                <option value="purple">Lila</option>
              </select>
            </div>
          </div>
          <div className="list-row">
            <div className="list-main">
              <div className="list-title">Language</div>
              <div className="list-sub">A felület nyelve.</div>
            </div>
            <div className="list-actions">
              <select className="input" value={settings.language} onChange={(e) => void update({ language: e.target.value as AppSettings['language'] })}>
                <option value="hu">Magyar</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <SectionTitle>Napló</SectionTitle>
        <Card>
          <div className="row gap-12 wrap">
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="card-title">Naplóbejegyzések kezelése</div>
              <div className="card-desc">
                A napló minden módosítást rögzít: időbélyeg, művelet, régi és új érték, siker/hiba. Exportálható CSV
                vagy JSON formátumban.
              </div>
            </div>
            <div className="row gap-8">
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const result = await api.logs.export();
                  if (!result.ok) toast({ kind: 'error', title: 'Export sikertelen', message: result.error });
                  else if (result.data) toast({ kind: 'success', title: 'Napló exportálva', message: result.data.path });
                }}
              >
                <Icon name="download" size={13} /> Export
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => void clearLogs()}>
                <Icon name="trash" size={13} /> Napló törlése
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="section">
        <SectionTitle>Az alkalmazásról</SectionTitle>
        <Card>
          <div className="col gap-8 text-sm">
            <div className="row gap-8">
              <Icon name="check" size={15} /> Nem tartalmaz reklámot, bloatware-t és nem gyűjt telemetriát.
            </div>
            <div className="row gap-8">
              <Icon name="check" size={15} /> Rendszergazdai jogot csak akkor kér, amikor ténylegesen szükséges.
            </div>
            <div className="row gap-8">
              <Icon name="check" size={15} /> Nem fut feleslegesen a háttérben; a mérések csak aktív ablaknál frissülnek.
            </div>
            <div className="row gap-8">
              <Icon name="check" size={15} /> Nem ígér irreális gyorsulást – minden optimalizáció indokolt és visszavonható.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
