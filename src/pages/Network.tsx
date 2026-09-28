import { useState } from 'react';
import type { NetworkActionId, NetworkState } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData } from '@/lib/hooks';
import { Card, EmptyState, LoadingRows, SectionTitle, useConfirmDialog, useToast } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface ActionMeta {
  id: NetworkActionId;
  name: string;
  description: string;
  details: string[];
  requiresAdmin: boolean;
  danger: boolean;
  needsAdapter?: boolean;
}

const ACTIONS: ActionMeta[] = [
  {
    id: 'flush-dns',
    name: 'DNS cache ürítése',
    description: 'Törli a helyi DNS feloldó gyorsítótárát. Gyakori megoldás elavult domain-feloldásra.',
    details: ['Parancs: ipconfig /flushdns', 'Nincs hatása a hálózati beállításokra, a kapcsolat nem szakad meg.'],
    requiresAdmin: false,
    danger: false,
  },
  {
    id: 'release-renew-ip',
    name: 'IP cím megújítása',
    description: 'Felszabadítja és újra elkéri a DHCP címet. A kapcsolat néhány másodpercre megszakadhat.',
    details: ['Parancs: ipconfig /release majd ipconfig /renew', 'Statikus IP esetén nincs hatása.'],
    requiresAdmin: true,
    danger: false,
  },
  {
    id: 'restart-adapter',
    name: 'Hálózati adapter újraindítása',
    description: 'A kiválasztott adapter le-, majd visszakapcsolása. A kapcsolat rövid időre megszakad.',
    details: ['Parancs: Restart-NetAdapter', 'Csak a kiválasztott adaptert érinti, konfigurációt nem módosít.'],
    requiresAdmin: true,
    danger: false,
    needsAdapter: true,
  },
  {
    id: 'winsock-reset',
    name: 'Winsock reset',
    description: 'Visszaállítja a Winsock katalógust alapállapotba. Sérült hálózati stack esetén segít.',
    details: [
      'Parancs: netsh winsock reset',
      'A harmadik féltől származó hálózati szűrők (VPN, proxy, egyes antivírusok) LSP bejegyzései eltávolításra kerülnek – ezek újratelepítést igényelhetnek.',
      'A művelet után újraindítás szükséges.',
    ],
    requiresAdmin: true,
    danger: true,
  },
  {
    id: 'tcpip-reset',
    name: 'TCP/IP reset',
    description: 'A TCP/IP verem visszaállítása gyári alapértelmezésre.',
    details: [
      'Parancs: netsh int ip reset',
      'A manuálisan beállított IP/DNS címek elveszhetnek, és DHCP-re válthat a rendszer.',
      'A művelet után újraindítás szükséges.',
    ],
    requiresAdmin: true,
    danger: true,
  },
];

export function Network() {
  const toast = useToast();
  const { confirm, node } = useConfirmDialog();
  const { data, loading, error, reload } = useAsyncData<NetworkState>(() => api.network.state());
  const [busy, setBusy] = useState<NetworkActionId | null>(null);
  const [adapter, setAdapter] = useState<string>('');

  const state = data;
  const activeAdapters = state?.adapters.filter((a) => a.status === 'Up') ?? [];
  const selectedAdapter = adapter || activeAdapters[0]?.name || state?.adapters[0]?.name || '';

  async function run(action: ActionMeta) {
    const proceed = await confirm({
      title: `${action.name} – megerősítés`,
      message: action.description,
      confirmLabel: 'Végrehajtás',
      danger: action.danger,
      requiresAdmin: action.requiresAdmin,
      details: [
        { label: 'Amit végrehajtunk', items: action.details },
        ...(action.needsAdapter ? [{ label: 'Érintett adapter', items: [selectedAdapter || '(nincs kiválasztva)'] }] : []),
      ],
    });
    if (!proceed) return;

    setBusy(action.id);
    const result = await api.network.runAction(action.id, action.needsAdapter ? selectedAdapter : undefined);
    setBusy(null);

    if (!result.ok) {
      toast({ kind: 'error', title: 'A művelet nem sikerült', message: result.error });
      return;
    }
    toast({
      kind: 'success',
      title: `${action.name} kész`,
      message: result.data.rebootRecommended ? 'A változások érvényesítéséhez indítsd újra a számítógépet.' : result.data.output.slice(0, 160),
    });
    void reload();
  }

  return (
    <div className="page">
      {node}

      <div className="grid cols-3">
        <Card>
          <div className="metric-label">Kapcsolat</div>
          <div className="metric-value" style={{ marginTop: 6, color: state?.internetConnected ? 'var(--success)' : 'var(--danger)' }}>
            {loading ? '…' : state?.internetConnected ? 'Online' : 'Offline'}
          </div>
          <div className="metric-sub">{activeAdapters.length} aktív adapter</div>
        </Card>
        {(state?.latency ?? []).slice(0, 2).map((l) => (
          <Card key={l.host}>
            <div className="metric-label">Latency – {l.host}</div>
            <div
              className="metric-value"
              style={{ marginTop: 6, color: (l.averageMs ?? 0) > 100 ? 'var(--warning)' : undefined }}
            >
              {l.averageMs != null ? l.averageMs.toFixed(0) : '–'}
              <small>ms</small>
            </div>
            <div className="metric-sub">{l.reachable ? `Csomagvesztés: ${l.packetLossPercent}%` : 'Nem elérhető'}</div>
          </Card>
        ))}
      </div>

      <div className="section">
        <SectionTitle
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
              <Icon name="refresh" size={14} /> Frissítés
            </button>
          }
        >
          Hálózati adapterek
        </SectionTitle>

        {loading ? (
          <LoadingRows count={2} />
        ) : error ? (
          <EmptyState icon="alert" title="Nem sikerült beolvasni a hálózati állapotot" message={error} />
        ) : (
          <div className="list">
            {(state?.adapters ?? []).map((a) => (
              <div className="list-row" key={a.name + a.macAddress}>
                <div className="metric-icon" style={{ width: 34, height: 34 }}>
                  <Icon name={a.status === 'Up' ? 'network' : 'wifi'} size={16} />
                </div>
                <div className="list-main">
                  <div className="list-title">
                    {a.name}
                    <span className={`chip ${a.status === 'Up' ? 'success' : ''}`}>{a.status}</span>
                    {a.dhcpEnabled && <span className="chip">DHCP</span>}
                  </div>
                  <div className="list-sub truncate">{a.description} • {a.linkSpeed}</div>
                  <div className="list-sub mono">
                    IPv4: {a.ipv4.join(', ') || '–'} • GW: {a.gateway.join(', ') || '–'} • DNS: {a.dnsServers.join(', ') || '–'}
                  </div>
                  <div className="list-sub mono text-xs">MAC: {a.macAddress || '–'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <SectionTitle>Diagnosztika és javítás</SectionTitle>
        <div className="banner warning">
          <Icon name="alert" size={16} />
          <span>
            Minden hálózati módosítás előtt megerősítést kérünk, és pontosan leírjuk, mi történik. A Winsock és TCP/IP
            reset komolyabb beavatkozás – csak akkor használd, ha a kapcsolat ténylegesen hibás.
          </span>
        </div>

        <div className="grid cols-2">
          {ACTIONS.map((action) => (
            <Card key={action.id} interactive>
              <div className="card-header" style={{ marginBottom: 8 }}>
                <div className="metric-icon">
                  <Icon name={action.danger ? 'alert' : 'globe'} size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="card-title">{action.name}</div>
                  <div className="row gap-8" style={{ marginTop: 4 }}>
                    {action.requiresAdmin && (
                      <span className="chip warning">
                        <Icon name="lock" size={10} /> Admin
                      </span>
                    )}
                    {action.danger && <span className="chip danger">Újraindítás szükséges</span>}
                  </div>
                </div>
              </div>
              <p className="text-sm text-dim">{action.description}</p>

              {action.needsAdapter && (
                <select
                  className="input"
                  style={{ marginTop: 12, width: '100%' }}
                  value={selectedAdapter}
                  onChange={(e) => setAdapter(e.target.value)}
                >
                  {(state?.adapters ?? []).map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name} ({a.status})
                    </option>
                  ))}
                </select>
              )}

              <button
                className={`btn ${action.danger ? 'btn-danger' : 'btn-secondary'} btn-sm`}
                style={{ marginTop: 14 }}
                onClick={() => void run(action)}
                disabled={busy !== null}
              >
                {busy === action.id ? <span className="spinner sm" /> : <Icon name="play" size={13} />} Futtatás
              </button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
