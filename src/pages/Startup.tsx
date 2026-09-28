import { useMemo, useState } from 'react';
import type { StartupImpact, StartupItem } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, Switch, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

const IMPACT_LABEL: Record<StartupImpact, string> = {
  none: 'Nincs hatás',
  low: 'Alacsony',
  medium: 'Közepes',
  high: 'Magas',
  unknown: 'Ismeretlen',
};

const IMPACT_CLASS: Record<StartupImpact, string> = {
  none: '',
  low: 'success',
  medium: 'warning',
  high: 'danger',
  unknown: '',
};

export function Startup() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, reload, setData } = useAsyncData<StartupItem[]>(() => api.startup.list());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const items = data ?? [];
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          !filter ||
          i.name.toLowerCase().includes(filter.toLowerCase()) ||
          i.publisher.toLowerCase().includes(filter.toLowerCase()),
      ),
    [items, filter],
  );

  const enabledCount = items.filter((i) => i.enabled).length;
  const highImpact = items.filter((i) => i.enabled && i.impact === 'high').length;

  async function toggle(item: StartupItem, enabled: boolean) {
    if (item.isSystemCritical && !enabled) {
      toast({
        kind: 'error',
        title: 'Ez az elem védett',
        message: 'Windows rendszer- vagy biztonsági komponens – az alkalmazás szándékosan nem tiltja le.',
      });
      return;
    }

    const proceed = await confirm({
      title: enabled ? 'Indítás engedélyezése' : 'Indítás letiltása',
      message: `${item.name} ${enabled ? 'indulni fog' : 'nem fog elindulni'} a Windows bejelentkezéskor.`,
      confirmLabel: enabled ? 'Engedélyezés' : 'Letiltás',
      requiresAdmin: item.requiresAdmin,
      restorePointNotice: true,
      details: [
        {
          label: 'Amit módosítunk',
          items: [
            `Hely: ${item.location}`,
            item.location.startsWith('StartupFolder')
              ? 'A parancsikon átnevezése (.disabled utótag hozzáadása/eltávolítása).'
              : 'A StartupApproved registry bejegyzés módosítása – az eredeti Run parancs érintetlen marad.',
            `Parancs: ${item.command}`,
          ],
        },
      ],
    });
    if (!proceed) return;

    setBusyId(item.id);
    const result = await api.startup.setEnabled(item.id, enabled);
    setBusyId(null);

    if (!result.ok) {
      toast({ kind: 'error', title: 'A módosítás nem sikerült', message: result.error });
      return;
    }
    setData(items.map((i) => (i.id === item.id ? result.data : i)));
    toast({ kind: 'success', title: `${item.name} ${enabled ? 'engedélyezve' : 'letiltva'}` });
  }

  return (
    <div className="page">
      {node}

      <div className="banner info">
        <Icon name="shield" size={16} />
        <span>
          A Windows rendszerfolyamatait és a felismert biztonsági szoftverek komponenseit az alkalmazás{' '}
          <strong>nem tiltja le</strong>. A letiltás nem törli az elemet: bármikor visszakapcsolható itt vagy a Feladatkezelőben.
        </span>
      </div>

      <div className="grid cols-3">
        <Card>
          <div className="metric-label">Indítási elemek</div>
          <div className="metric-value" style={{ marginTop: 6 }}>
            {items.length}
          </div>
          <div className="metric-sub">{enabledCount} engedélyezve</div>
        </Card>
        <Card>
          <div className="metric-label">Magas hatású</div>
          <div className="metric-value" style={{ marginTop: 6, color: highImpact ? 'var(--warning)' : undefined }}>
            {highImpact}
          </div>
          <div className="metric-sub">Érdemes átnézni ezeket</div>
        </Card>
        <Card>
          <div className="metric-label">Védett elemek</div>
          <div className="metric-value" style={{ marginTop: 6 }}>
            {items.filter((i) => i.isSystemCritical).length}
          </div>
          <div className="metric-sub">Rendszer / biztonsági komponens</div>
        </Card>
      </div>

      <div className="section">
        <SectionTitle
          action={
            <div className="row gap-8">
              <input
                className="input"
                placeholder="Keresés…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ width: 180 }}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
                <Icon name="refresh" size={14} />
              </button>
            </div>
          }
        >
          Automatikusan induló alkalmazások
        </SectionTitle>

        {loading ? (
          <LoadingRows count={5} />
        ) : error ? (
          <EmptyState icon="alert" title="Nem sikerült beolvasni az indítási elemeket" message={error} />
        ) : visible.length === 0 ? (
          <EmptyState icon="rocket" title="Nincs találat" message="Nem található indítási elem a szűrőnek megfelelően." />
        ) : (
          <div className="list">
            {visible.map((item) => (
              <div className="list-row" key={item.id}>
                <div className="metric-icon" style={{ width: 34, height: 34 }}>
                  <Icon name="rocket" size={16} />
                </div>
                <div className="list-main">
                  <div className="list-title">
                    {item.name}
                    <span className={`chip ${IMPACT_CLASS[item.impact]}`}>{IMPACT_LABEL[item.impact]}</span>
                    {item.isSystemCritical && (
                      <span className="chip">
                        <Icon name="lock" size={10} /> Védett
                      </span>
                    )}
                    {item.requiresAdmin && <span className="chip warning">Admin</span>}
                  </div>
                  <div className="list-sub truncate">
                    {item.publisher} • <span className="mono">{item.location}</span>
                  </div>
                  <div className="list-sub mono truncate" title={item.command}>
                    {item.command}
                  </div>
                </div>
                <div className="list-actions">
                  <span className={`chip ${item.enabled ? 'success' : ''}`}>
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {busyId === item.id ? (
                    <span className="spinner sm" />
                  ) : (
                    <Switch
                      checked={item.enabled}
                      onChange={(v) => void toggle(item, v)}
                      disabled={item.isSystemCritical && item.enabled}
                      label={`${item.name} indítása`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
