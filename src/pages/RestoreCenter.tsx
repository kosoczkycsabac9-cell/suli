import { useState } from 'react';
import type { BackupEntry, LogEntry, RestorePoint } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import { Card, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

const KIND_LABEL: Record<BackupEntry['kind'], string> = {
  registry: 'Registry',
  startup: 'Startup',
  'power-plan': 'Energiaséma',
  network: 'Hálózat',
  settings: 'Beállítás',
};

export function RestoreCenter() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const backups = useAsyncData<BackupEntry[]>(() => api.restore.listBackups());
  const points = useAsyncData<RestorePoint[]>(() => api.restore.listRestorePoints());
  const logs = useAsyncData<LogEntry[]>(() => api.logs.list(200));
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function restore(entry: BackupEntry) {
    const proceed = await confirm({
      title: 'Módosítás visszaállítása',
      message: `Az alkalmazás visszaírja a(z) „${entry.label}” művelet előtti eredeti értéket.`,
      confirmLabel: 'Visszaállítás',
      details: [{ label: 'Részletek', items: [entry.description, `Típus: ${KIND_LABEL[entry.kind]}`, `Létrehozva: ${formatDateTime(entry.createdAt)}`] }],
    });
    if (!proceed) return;

    setBusy(entry.id);
    const result = await api.restore.restoreBackup(entry.id);
    setBusy(null);
    if (!result.ok) {
      toast({ kind: 'error', title: 'A visszaállítás nem sikerült', message: result.error });
      return;
    }
    toast({ kind: 'success', title: 'Visszaállítva', message: entry.label });
    void backups.reload();
    void logs.reload();
  }

  async function removeEntry(entry: BackupEntry) {
    const proceed = await confirm({
      title: 'Bejegyzés törlése',
      message: 'A backup bejegyzés törlése után ez a módosítás már nem állítható vissza az alkalmazásból.',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!proceed) return;
    await api.restore.deleteBackup(entry.id);
    void backups.reload();
  }

  async function createPoint() {
    const proceed = await confirm({
      title: 'Rendszer-visszaállítási pont létrehozása',
      message: 'A Windows készít egy visszaállítási pontot, amelyre szükség esetén a rendszer visszaállítható.',
      confirmLabel: 'Létrehozás',
      requiresAdmin: true,
      details: [
        {
          label: 'Tudnivalók',
          items: [
            'Parancs: Checkpoint-Computer -RestorePointType MODIFY_SETTINGS',
            'A Rendszervédelemnek engedélyezve kell lennie a C: meghajtón.',
            'A művelet 1–3 percig is eltarthat.',
          ],
        },
      ],
    });
    if (!proceed) return;

    setCreating(true);
    const result = await api.restore.createRestorePoint(`WinOptimizer – ${new Date().toLocaleString('hu-HU')}`);
    setCreating(false);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Nem sikerült létrehozni', message: result.error });
      return;
    }
    toast({ kind: 'success', title: 'Visszaállítási pont létrehozva' });
    void points.reload();
  }

  const entries = backups.data ?? [];

  return (
    <div className="page">
      {node}

      <div className="banner info">
        <Icon name="history" size={16} />
        <span>
          Minden rendszerbeállítást módosító művelet előtt az alkalmazás elmenti az eredeti értéket. Itt láthatod az
          összes korábbi optimalizációt, és egy kattintással visszaállíthatod őket.
        </span>
      </div>

      <div className="grid cols-3">
        <Card>
          <div className="metric-label">Visszaállítható módosítás</div>
          <div className="metric-value" style={{ marginTop: 6 }}>
            {entries.filter((e) => e.restorable && !e.restored).length}
          </div>
          <div className="metric-sub">{entries.length} bejegyzés összesen</div>
        </Card>
        <Card>
          <div className="metric-label">Rendszer-visszaállítási pont</div>
          <div className="metric-value" style={{ marginTop: 6 }}>
            {points.data?.length ?? 0}
          </div>
          <div className="metric-sub">Windows System Restore</div>
        </Card>
        <Card>
          <div className="metric-label">Művelet</div>
          <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={() => void createPoint()} disabled={creating}>
            {creating ? <span className="spinner sm" /> : <Icon name="save" size={15} />} Restore point létrehozása
          </button>
        </Card>
      </div>

      <div className="section">
        <SectionTitle
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => void backups.reload()}>
              <Icon name="refresh" size={14} />
            </button>
          }
        >
          Módosítások és biztonsági mentések
        </SectionTitle>

        {backups.loading ? (
          <LoadingRows count={3} />
        ) : entries.length === 0 ? (
          <EmptyState icon="history" title="Még nincs mentett módosítás" message="Amint alkalmazol egy optimalizációt, itt megjelenik." />
        ) : (
          <div className="list">
            {entries.map((entry) => (
              <div className="list-row" key={entry.id}>
                <div className="metric-icon" style={{ width: 34, height: 34 }}>
                  <Icon name={entry.kind === 'startup' ? 'rocket' : entry.kind === 'network' ? 'network' : 'save'} size={16} />
                </div>
                <div className="list-main">
                  <div className="list-title">
                    {entry.label}
                    <span className="chip">{KIND_LABEL[entry.kind]}</span>
                    {entry.restored && <span className="chip success">Visszaállítva</span>}
                  </div>
                  <div className="list-sub">{entry.description}</div>
                  <div className="list-sub text-xs">{formatDateTime(entry.createdAt)}</div>
                </div>
                <div className="list-actions">
                  {busy === entry.id ? (
                    <span className="spinner sm" />
                  ) : (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void restore(entry)}
                        disabled={!entry.restorable || entry.restored}
                      >
                        <Icon name="undo" size={13} /> Visszaállítás
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => void removeEntry(entry)} aria-label="Törlés">
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <SectionTitle
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => void points.reload()}>
              <Icon name="refresh" size={14} />
            </button>
          }
        >
          Windows visszaállítási pontok
        </SectionTitle>

        {points.loading ? (
          <LoadingRows count={2} />
        ) : (points.data ?? []).length === 0 ? (
          <EmptyState
            icon="shield"
            title="Nincs elérhető visszaállítási pont"
            message="Lehet, hogy a Rendszervédelem ki van kapcsolva, vagy nincs rendszergazdai jogosultság."
          />
        ) : (
          <div className="list">
            {(points.data ?? []).map((p) => (
              <div className="list-row" key={p.sequenceNumber}>
                <Icon name="shield" size={17} className="text-dim" />
                <div className="list-main">
                  <div className="list-title">{p.description}</div>
                  <div className="list-sub">
                    #{p.sequenceNumber} • {formatDateTime(p.creationTime)} • {p.type}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
          <Icon name="info" size={16} />
          <span>
            A teljes rendszer-visszaállítást a Windows natív eszközével (<span className="mono">rstrui.exe</span>)
            végezheted el – ezt szándékosan nem automatizáljuk, mert újraindítással jár.
          </span>
        </div>
      </div>

      <div className="section">
        <SectionTitle
          action={
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
              <button className="btn btn-ghost btn-sm" onClick={() => void logs.reload()}>
                <Icon name="refresh" size={14} />
              </button>
            </div>
          }
        >
          Műveleti napló
        </SectionTitle>

        {logs.loading ? (
          <LoadingRows count={3} />
        ) : (logs.data ?? []).length === 0 ? (
          <EmptyState icon="list" title="A napló üres" />
        ) : (
          <div className="list">
            {(logs.data ?? []).slice(0, 60).map((log) => (
              <div className="list-row" key={log.id}>
                <Icon
                  name={log.success ? 'check' : 'alert'}
                  size={16}
                  className={log.success ? '' : 'text-dim'}
                  strokeWidth={2.2}
                />
                <div className="list-main">
                  <div className="list-title">
                    {log.action}
                    <span className="chip">{log.area}</span>
                    {!log.success && <span className="chip danger">Sikertelen</span>}
                  </div>
                  <div className="list-sub mono text-xs">
                    {log.oldValue != null && <>régi: {log.oldValue} </>}
                    {log.newValue != null && <>→ új: {log.newValue}</>}
                    {log.message && <> • {log.message}</>}
                  </div>
                </div>
                <div className="list-actions text-xs text-dim tabular">{formatDateTime(log.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
