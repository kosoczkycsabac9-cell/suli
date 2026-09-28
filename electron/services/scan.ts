import { randomUUID } from 'node:crypto';
import type { ScanIssue, ScanReport, ScanStepResult } from '../../shared/types';
import { analyze } from './cleaner';
import { listStartupItems } from './startup';
import { listTweaks } from './performance';
import { listPrivacyTweaks } from './privacy';
import { getNetworkState } from './network';
import { getBackgroundProcessStats, getSystemSnapshot } from './system';
import { logger } from './logger';

const STEPS: { id: ScanStepResult['id']; label: string }[] = [
  { id: 'temporary-files', label: 'Temporary files' },
  { id: 'storage', label: 'Storage' },
  { id: 'startup-apps', label: 'Startup applications' },
  { id: 'background-processes', label: 'Background processes' },
  { id: 'network-config', label: 'Network configuration' },
  { id: 'windows-settings', label: 'Windows settings' },
  { id: 'privacy-settings', label: 'Privacy settings' },
];

function bytesToGb(bytes: number): number {
  return bytes / 1024 ** 3;
}

/**
 * Teljes rendszervizsgálat. Nem módosít semmit – csak olvas.
 * A lépésenkénti eredményeket az onStep callbackkel streameljük a UI felé.
 */
export async function runScan(onStep: (step: ScanStepResult) => void): Promise<ScanReport> {
  const startedAt = new Date().toISOString();
  const steps: ScanStepResult[] = STEPS.map((s) => ({ ...s, status: 'pending', findings: 0, detail: '' }));
  const issues: ScanIssue[] = [];

  const emit = (index: number, patch: Partial<ScanStepResult>) => {
    steps[index] = { ...steps[index], ...patch };
    onStep(steps[index]);
  };

  /* 1) Ideiglenes fájlok + junk */
  emit(0, { status: 'running' });
  let reclaimable = 0;
  try {
    const categories = await analyze();
    reclaimable = categories.reduce((s, c) => s + c.sizeBytes, 0);
    categories
      .filter((c) => c.sizeBytes > 50 * 1024 * 1024)
      .forEach((c) =>
        issues.push({
          id: randomUUID(),
          category: c.id === 'recycle-bin' || c.id === 'browser-cache' ? 'Junk Files' : 'Temporary Files',
          title: c.name,
          detail: `${(c.sizeBytes / 1024 ** 2).toFixed(0)} MB felszabadítható, ${c.fileCount} fájl.`,
          severity: c.sizeBytes > 2 * 1024 ** 3 ? 'medium' : 'low',
          page: 'cleaner',
          sizeBytes: c.sizeBytes,
        }),
      );
    emit(0, {
      status: 'done',
      findings: categories.filter((c) => c.sizeBytes > 0).length,
      detail: `${bytesToGb(reclaimable).toFixed(2)} GB felszabadítható`,
    });
  } catch (err) {
    emit(0, { status: 'error', detail: (err as Error).message });
  }

  /* 2) Tárhely */
  emit(1, { status: 'running' });
  try {
    const snapshot = await getSystemSnapshot();
    const lowDisks = snapshot.disks.filter((d) => d.usagePercent > 85);
    lowDisks.forEach((d) =>
      issues.push({
        id: randomUUID(),
        category: 'Storage',
        title: `${d.drive} meghajtó majdnem tele (${d.usagePercent.toFixed(0)}%)`,
        detail: `Csak ${bytesToGb(d.freeBytes).toFixed(1)} GB szabad hely maradt. 10% alatt a Windows teljesítménye romolhat.`,
        severity: d.usagePercent > 95 ? 'high' : 'medium',
        page: 'cleaner',
      }),
    );
    emit(1, {
      status: 'done',
      findings: lowDisks.length,
      detail: lowDisks.length ? `${lowDisks.length} meghajtón kevés a hely` : 'Elegendő szabad hely',
    });
  } catch (err) {
    emit(1, { status: 'error', detail: (err as Error).message });
  }

  /* 3) Indítási appok */
  emit(2, { status: 'running' });
  let startupCount = 0;
  try {
    const items = await listStartupItems();
    const enabled = items.filter((i) => i.enabled && !i.isSystemCritical);
    startupCount = enabled.length;
    if (enabled.length > 4) {
      issues.push({
        id: randomUUID(),
        category: 'Startup Apps',
        title: `${enabled.length} alkalmazás indul a Windowsszal`,
        detail: `Ebből ${enabled.filter((i) => i.impact === 'high').length} jelentős indítási hatással. A nem szükségesek letilthatók.`,
        severity: enabled.length > 10 ? 'medium' : 'low',
        page: 'startup',
      });
    }
    emit(2, { status: 'done', findings: enabled.length, detail: `${enabled.length} letiltható indítási elem` });
  } catch (err) {
    emit(2, { status: 'error', detail: (err as Error).message });
  }

  /* 4) Háttérfolyamatok */
  emit(3, { status: 'running' });
  try {
    const stats = await getBackgroundProcessStats();
    const heavy = stats.heavy.filter((h) => h.memoryMb > 500);
    heavy.forEach((h) =>
      issues.push({
        id: randomUUID(),
        category: 'Background Processes',
        title: `${h.name} – ${h.memoryMb} MB memória`,
        detail: 'Nagy memóriafogyasztó folyamat. Ellenőrizd a Task Managerben, hogy szükséges-e.',
        severity: 'info',
        page: 'tools',
      }),
    );
    emit(3, { status: 'done', findings: heavy.length, detail: `${stats.count} felhasználói folyamat fut` });
  } catch (err) {
    emit(3, { status: 'error', detail: (err as Error).message });
  }

  /* 5) Hálózat */
  emit(4, { status: 'running' });
  try {
    const net = await getNetworkState();
    const slow = net.latency.filter((l) => l.reachable && (l.averageMs ?? 0) > 100);
    if (!net.internetConnected) {
      issues.push({
        id: randomUUID(),
        category: 'Network',
        title: 'Nincs internetkapcsolat',
        detail: 'Egyik tesztcím sem válaszolt. A Network oldalon elérhető diagnosztikai eszközök segíthetnek.',
        severity: 'high',
        page: 'network',
      });
    } else if (slow.length) {
      issues.push({
        id: randomUUID(),
        category: 'Network',
        title: 'Magas válaszidő',
        detail: `Átlagos latency: ${slow.map((s) => `${s.host}: ${s.averageMs} ms`).join(', ')}.`,
        severity: 'low',
        page: 'network',
      });
    }
    emit(4, {
      status: 'done',
      findings: slow.length + (net.internetConnected ? 0 : 1),
      detail: net.internetConnected ? 'Kapcsolat rendben' : 'Nincs kapcsolat',
    });
  } catch (err) {
    emit(4, { status: 'error', detail: (err as Error).message });
  }

  /* 6) Windows beállítások (performance tweakek) */
  emit(5, { status: 'running' });
  let optional = 0;
  try {
    const tweaks = await listTweaks();
    const pending = tweaks.filter((t) => !t.applied && t.risk === 'safe');
    optional += pending.length;
    pending.forEach((t) =>
      issues.push({
        id: randomUUID(),
        category: 'Windows Settings',
        title: t.name,
        detail: `Jelenleg: ${t.currentState} → Ajánlott: ${t.recommendedState}`,
        severity: 'info',
        page: 'performance',
      }),
    );
    emit(5, { status: 'done', findings: pending.length, detail: `${pending.length} opcionális optimalizáció` });
  } catch (err) {
    emit(5, { status: 'error', detail: (err as Error).message });
  }

  /* 7) Adatvédelem */
  emit(6, { status: 'running' });
  try {
    const privacy = await listPrivacyTweaks();
    const pending = privacy.filter((t) => !t.applied && !t.openSettingsUri);
    optional += pending.length;
    pending.forEach((t) =>
      issues.push({
        id: randomUUID(),
        category: 'Privacy',
        title: t.name,
        detail: `Jelenleg: ${t.currentState} → Ajánlott: ${t.recommendedState}`,
        severity: 'low',
        page: 'privacy',
      }),
    );
    emit(6, { status: 'done', findings: pending.length, detail: `${pending.length} adatvédelmi javaslat` });
  } catch (err) {
    emit(6, { status: 'error', detail: (err as Error).message });
  }

  /* Health score – átlátható, indokolható pontozás. */
  let score = 100;
  score -= Math.min(20, bytesToGb(reclaimable) * 2); // takarítható szemét
  score -= Math.min(15, Math.max(0, startupCount - 4) * 1.5); // sok indítási app
  score -= Math.min(20, issues.filter((i) => i.severity === 'high').length * 10);
  score -= Math.min(10, issues.filter((i) => i.severity === 'medium').length * 3);
  score -= Math.min(10, optional * 0.8);
  const healthScore = Math.max(35, Math.round(score));

  const report: ScanReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    healthScore,
    steps,
    issues,
    reclaimableBytes: reclaimable,
    startupAppCount: startupCount,
    optionalOptimizations: optional,
  };

  logger.record({
    area: 'Scan',
    action: 'Rendszervizsgálat lefutott',
    oldValue: null,
    newValue: `Health score: ${healthScore}/100, ${issues.length} találat`,
    success: true,
    level: 'info',
  });

  return report;
}
