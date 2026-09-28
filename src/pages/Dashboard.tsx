import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScanIssue, ScanReport, ScanStepResult, SystemSnapshot } from '@shared/types';
import { api } from '@/lib/api';
import { useAsyncData, useHistory, useInterval } from '@/lib/hooks';
import { formatBytes, formatSpeed, formatUptime } from '@/lib/format';
import { Card, EmptyState, ProgressBar, Ring, SectionTitle, Sparkline, useToast } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import type { PageId } from '@/App';

const CATEGORY_ICON: Record<ScanIssue['category'], IconName> = {
  'Junk Files': 'trash',
  'Temporary Files': 'file',
  'Startup Apps': 'rocket',
  'Background Processes': 'activity',
  'Windows Settings': 'windows',
  Privacy: 'shield',
  Network: 'network',
  Storage: 'disk',
};

function MetricCard({
  icon,
  label,
  value,
  unit,
  sub,
  percent,
  history,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  percent?: number;
  history?: number[];
}) {
  return (
    <Card className="metric-card" interactive>
      <div className="metric-top">
        <div className="metric-icon">
          <Icon name={icon} size={17} />
        </div>
        <div className="metric-label">{label}</div>
      </div>
      <div className="metric-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
      {percent != null && <ProgressBar value={percent} />}
      {history && history.length > 2 && <Sparkline data={history} />}
    </Card>
  );
}

export function Dashboard({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const toast = useToast();
  const { data: snapshot, reload } = useAsyncData<SystemSnapshot>(() => api.system.snapshot());
  const [scanning, setScanning] = useState(false);
  const [steps, setSteps] = useState<ScanStepResult[]>([]);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [showResults, setShowResults] = useState(false);
  const unsubscribe = useRef<(() => void) | null>(null);

  useInterval(() => void reload(), scanning ? null : 2000);

  const cpuHistory = useHistory(snapshot?.cpu.usagePercent);
  const ramHistory = useHistory(snapshot?.memory.usagePercent);
  const netHistory = useHistory(snapshot?.network[0]?.downloadBytesPerSec);

  useEffect(() => () => unsubscribe.current?.(), []);

  const primaryDisk = snapshot?.disks[0];
  const gpu = snapshot?.gpus[0];
  const net = snapshot?.network.find((n) => n.downloadBytesPerSec > 0) ?? snapshot?.network[0];

  const grouped = useMemo(() => {
    if (!report) return [];
    const map = new Map<ScanIssue['category'], ScanIssue[]>();
    report.issues.forEach((issue) => {
      map.set(issue.category, [...(map.get(issue.category) ?? []), issue]);
    });
    return [...map.entries()];
  }, [report]);

  async function runScan() {
    setScanning(true);
    setReport(null);
    setShowResults(false);
    setSteps([]);

    unsubscribe.current?.();
    unsubscribe.current = api.scan.onProgress((step) => {
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.id === step.id);
        if (idx === -1) return [...prev, step];
        const next = [...prev];
        next[idx] = step;
        return next;
      });
    });

    const result = await api.scan.run();
    unsubscribe.current?.();
    unsubscribe.current = null;
    setScanning(false);

    if (!result.ok) {
      toast({ kind: 'error', title: 'A vizsgálat nem fejeződött be', message: result.error });
      return;
    }
    setReport(result.data);
    setSteps(result.data.steps);
    toast({
      kind: 'success',
      title: `Vizsgálat kész – ${result.data.healthScore}/100`,
      message: `${result.data.issues.length} találat, ${formatBytes(result.data.reclaimableBytes)} felszabadítható.`,
    });
  }

  const progressPercent = steps.length ? (steps.filter((s) => s.status === 'done' || s.status === 'error').length / 7) * 100 : 0;

  return (
    <div className="page">
      {snapshot && !snapshot.platformSupported && (
        <div className="banner warning">
          <Icon name="alert" size={16} />
          <span>
            <strong>Demó mód.</strong> Nem Windows rendszeren futsz, ezért bemutató adatokat látsz, és a rendszert
            módosító műveletek le vannak tiltva. Windows 10/11 alatt az alkalmazás valós adatokkal dolgozik.
          </span>
        </div>
      )}

      <div className="grid cols-4">
        <MetricCard
          icon="cpu"
          label="CPU"
          value={snapshot ? snapshot.cpu.usagePercent.toFixed(0) : '–'}
          unit="%"
          sub={snapshot?.cpu.model}
          percent={snapshot?.cpu.usagePercent ?? 0}
          history={cpuHistory}
        />
        <MetricCard
          icon="memory"
          label="Memória"
          value={snapshot ? snapshot.memory.usagePercent.toFixed(0) : '–'}
          unit="%"
          sub={snapshot ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(snapshot.memory.totalBytes)}` : ''}
          percent={snapshot?.memory.usagePercent ?? 0}
          history={ramHistory}
        />
        <MetricCard
          icon="disk"
          label={`Lemez ${primaryDisk?.drive ?? ''}`}
          value={primaryDisk ? primaryDisk.usagePercent.toFixed(0) : '–'}
          unit="%"
          sub={primaryDisk ? `${formatBytes(primaryDisk.freeBytes)} szabad / ${formatBytes(primaryDisk.totalBytes)}` : ''}
          percent={primaryDisk?.usagePercent ?? 0}
        />
        {gpu ? (
          <MetricCard
            icon="gpu"
            label="GPU"
            value={gpu.usagePercent != null ? gpu.usagePercent.toFixed(0) : '–'}
            unit={gpu.usagePercent != null ? '%' : ''}
            sub={`${gpu.name}${gpu.vramBytes ? ` • ${formatBytes(gpu.vramBytes)} VRAM` : ''}`}
            percent={gpu.usagePercent ?? undefined}
          />
        ) : (
          <MetricCard icon="gpu" label="GPU" value="N/A" sub="Nem érhető el GPU-metrika" />
        )}
      </div>

      <div className="grid cols-3 section">
        <MetricCard
          icon="network"
          label="Hálózat"
          value={net ? formatSpeed(net.downloadBytesPerSec).split(' ')[0] : '–'}
          unit={net ? ` ${formatSpeed(net.downloadBytesPerSec).split(' ')[1]}` : ''}
          sub={net ? `${net.interfaceName} • ↑ ${formatSpeed(net.uploadBytesPerSec)}` : 'Nincs aktív adapter'}
          history={netHistory.map((v) => Math.min(100, v / 50000))}
        />
        <MetricCard
          icon="windows"
          label="Windows"
          value={snapshot?.os.isWindows11 ? '11' : snapshot ? '10' : '–'}
          sub={snapshot ? `${snapshot.os.caption} • ${snapshot.os.displayVersion || snapshot.os.version} (build ${snapshot.os.build})` : ''}
        />
        <MetricCard
          icon="clock"
          label="Uptime"
          value={snapshot ? formatUptime(snapshot.uptimeSeconds).split(' ')[0] : '–'}
          unit={snapshot ? ` ${formatUptime(snapshot.uptimeSeconds).split(' ').slice(1).join(' ')}` : ''}
          sub={snapshot ? `${snapshot.os.computerName} • ${snapshot.os.architecture}` : ''}
        />
      </div>

      {/* Scan & Optimize */}
      <div className="section">
        <Card>
          <div className="health-card">
            <Ring value={report?.healthScore ?? (snapshot ? 100 - (snapshot.disks[0]?.usagePercent ?? 0) / 4 : 0)} />
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="card-title" style={{ fontSize: 16 }}>
                Rendszer állapota
              </div>
              <p className="card-desc" style={{ marginBottom: 14 }}>
                {report
                  ? `A vizsgálat ${report.issues.length} elemet talált. A pontszám a takarítható adatmennyiség, az indítási elemek száma és a nyitott javaslatok alapján számolódik.`
                  : 'Futtass egy vizsgálatot a pontos állapotfelméréshez. A vizsgálat csak olvas – semmit nem módosít a rendszeren.'}
              </p>

              <button className="btn-scan" onClick={runScan} disabled={scanning}>
                {scanning ? (
                  <>
                    <span className="spinner" style={{ borderTopColor: '#05070c' }} /> Scanning system…
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={18} /> Scan &amp; Optimize
                  </>
                )}
              </button>

              {(scanning || steps.length > 0) && (
                <>
                  <div className="scan-bar">
                    <div className="scan-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="scan-steps">
                    {steps.map((step) => (
                      <div key={step.id} className={`scan-step ${step.status}`}>
                        {step.status === 'running' ? (
                          <span className="spinner" />
                        ) : step.status === 'error' ? (
                          <Icon name="x" size={15} />
                        ) : (
                          <Icon name="check" size={15} strokeWidth={2.6} />
                        )}
                        {step.label}
                        <span className="scan-step-detail">{step.detail}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Összefoglaló */}
      {report && (
        <div className="section">
          <SectionTitle>Vizsgálati összefoglaló</SectionTitle>
          <Card>
            <div className="row wrap gap-16" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 15, fontWeight: 620, marginBottom: 10 }}>
                  System Health: {report.healthScore}/100
                </div>
                <div className="col gap-8">
                  <div className="row gap-8 text-sm">
                    <Icon name="file" size={15} className="text-dim" />
                    <strong>{formatBytes(report.reclaimableBytes)}</strong> ideiglenes és felesleges fájl
                  </div>
                  <div className="row gap-8 text-sm">
                    <Icon name="rocket" size={15} className="text-dim" />
                    <strong>{report.startupAppCount}</strong> indítási alkalmazás
                  </div>
                  <div className="row gap-8 text-sm">
                    <Icon name="zap" size={15} className="text-dim" />
                    <strong>{report.optionalOptimizations}</strong> opcionális optimalizáció
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setShowResults((v) => !v)}>
                <Icon name="list" size={15} />
                {showResults ? 'Összecsukás' : 'Review Results'}
              </button>
            </div>

            {showResults && (
              <div style={{ marginTop: 18 }}>
                {grouped.length === 0 ? (
                  <EmptyState icon="check" title="Nem találtunk problémát" message="A rendszer jó állapotban van." />
                ) : (
                  <div className="grid cols-2">
                    {grouped.map(([category, issues]) => (
                      <div key={category} className="detail-box" style={{ marginTop: 0 }}>
                        <div className="row gap-8" style={{ marginBottom: 8 }}>
                          <Icon name={CATEGORY_ICON[category]} size={15} />
                          <strong style={{ fontSize: 13 }}>{category}</strong>
                          <span className="chip">{issues.length}</span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => onNavigate(issues[0].page as PageId)}
                          >
                            Megnyitás <Icon name="chevron" size={13} />
                          </button>
                        </div>
                        <div className="col gap-8">
                          {issues.map((issue) => (
                            <div key={issue.id}>
                              <div className="text-sm" style={{ fontWeight: 550 }}>
                                {issue.title}
                              </div>
                              <div className="text-xs text-dim">{issue.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="banner info" style={{ marginTop: 16, marginBottom: 0 }}>
                  <Icon name="info" size={16} />
                  <span>
                    Az itt felsorolt optimalizációk mérhető, de jellemzően szerény javulást hoznak – főleg a tárhely és
                    az indítási idő terén. Az alkalmazás szándékosan nem ígér irreális gyorsulást, és minden módosítás
                    visszavonható a Restore Centerből.
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Lemezek */}
      {snapshot && snapshot.disks.length > 0 && (
        <div className="section">
          <SectionTitle>Meghajtók</SectionTitle>
          <div className="list">
            {snapshot.disks.map((disk) => (
              <div className="list-row" key={disk.drive}>
                <Icon name="disk" size={18} className="text-dim" />
                <div className="list-main">
                  <div className="list-title">
                    {disk.drive} {disk.label && <span className="text-dim">• {disk.label}</span>}
                    <span className="chip">{disk.fileSystem}</span>
                  </div>
                  <div className="list-sub">
                    {formatBytes(disk.usedBytes)} használatban • {formatBytes(disk.freeBytes)} szabad
                  </div>
                  <div style={{ maxWidth: 420 }}>
                    <ProgressBar value={disk.usagePercent} />
                  </div>
                </div>
                <div className="list-actions tabular" style={{ fontWeight: 600 }}>
                  {disk.usagePercent.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
