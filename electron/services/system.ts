import os from 'node:os';
import type {
  CpuInfo,
  DiskInfo,
  GpuInfo,
  MemoryInfo,
  NetworkActivity,
  OsInfo,
  SystemSnapshot,
} from '../../shared/types';
import { IS_WINDOWS, isElevated, runPowerShellJson, toArray } from './shell';

let lastCpuTimes = os.cpus().map((c) => c.times);
let lastNetSample: { at: number; counters: Record<string, { rx: number; tx: number }> } | null = null;

/** CPU terhelés az os.cpus() delta alapján – nem igényel WMI hívást, így olcsó. */
function sampleCpuUsage(): number {
  const cpus = os.cpus();
  let idleDelta = 0;
  let totalDelta = 0;
  cpus.forEach((cpu, i) => {
    const prev = lastCpuTimes[i];
    if (!prev) return;
    const t = cpu.times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    idleDelta += t.idle - prev.idle;
    totalDelta += total - prevTotal;
  });
  lastCpuTimes = cpus.map((c) => c.times);
  if (totalDelta <= 0) return 0;
  return Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100));
}

async function getDisks(): Promise<DiskInfo[]> {
  if (!IS_WINDOWS) return [];
  const raw = await runPowerShellJson<any>(
    `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace`,
    [],
    { timeoutMs: 15000 },
  );
  return toArray(raw)
    .filter((d: any) => Number(d?.Size) > 0)
    .map((d: any) => {
      const total = Number(d.Size) || 0;
      const free = Number(d.FreeSpace) || 0;
      const used = total - free;
      return {
        drive: String(d.DeviceID ?? ''),
        label: String(d.VolumeName ?? 'Helyi lemez'),
        fileSystem: String(d.FileSystem ?? ''),
        totalBytes: total,
        freeBytes: free,
        usedBytes: used,
        usagePercent: total ? (used / total) * 100 : 0,
      } satisfies DiskInfo;
    });
}

async function getGpus(): Promise<GpuInfo[]> {
  if (!IS_WINDOWS) return [];
  const raw = await runPowerShellJson<any>(
    `Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM`,
    [],
    { timeoutMs: 15000 },
  );
  const gpus = toArray(raw).map((g: any) => ({
    name: String(g?.Name ?? 'Ismeretlen GPU'),
    driverVersion: String(g?.DriverVersion ?? ''),
    vramBytes: Number(g?.AdapterRAM) || 0,
    usagePercent: null as number | null,
  }));

  // GPU Engine performance counter – nem minden gépen érhető el, ezért best-effort.
  try {
    const usage = await runPowerShellJson<any>(
      `$c = (Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction Stop).CounterSamples |
        Measure-Object -Property CookedValue -Sum; [math]::Round([math]::Min(100, $c.Sum), 1)`,
      null,
      { timeoutMs: 8000 },
    );
    if (typeof usage === 'number' && gpus[0]) gpus[0].usagePercent = usage;
  } catch {
    /* opcionális metrika */
  }
  return gpus;
}

async function getOsInfo(): Promise<OsInfo> {
  const fallback: OsInfo = {
    caption: `${os.type()} ${os.release()}`,
    version: os.release(),
    build: os.release().split('.')[2] ?? '',
    displayVersion: '',
    architecture: os.arch(),
    installDate: null,
    computerName: os.hostname(),
    userName: os.userInfo().username,
    isWindows11: false,
  };
  if (!IS_WINDOWS) return fallback;

  const raw = await runPowerShellJson<any>(
    `$o = Get-CimInstance Win32_OperatingSystem;
     $cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
     [pscustomobject]@{
       Caption=$o.Caption; Version=$o.Version; Build=$cv.CurrentBuildNumber;
       DisplayVersion=$cv.DisplayVersion; Arch=$o.OSArchitecture;
       InstallDate=$o.InstallDate; Computer=$env:COMPUTERNAME; User=$env:USERNAME }`,
    null,
    { timeoutMs: 15000 },
  );
  if (!raw) return fallback;
  const build = Number(raw.Build) || 0;
  return {
    caption: String(raw.Caption ?? fallback.caption).trim(),
    version: String(raw.Version ?? fallback.version),
    build: String(raw.Build ?? ''),
    displayVersion: String(raw.DisplayVersion ?? ''),
    architecture: String(raw.Arch ?? fallback.architecture),
    installDate: raw.InstallDate ? new Date(raw.InstallDate).toISOString() : null,
    computerName: String(raw.Computer ?? fallback.computerName),
    userName: String(raw.User ?? fallback.userName),
    isWindows11: build >= 22000,
  };
}

async function getNetworkActivity(): Promise<NetworkActivity[]> {
  if (!IS_WINDOWS) return [];
  const raw = await runPowerShellJson<any>(
    `Get-NetAdapterStatistics -ErrorAction SilentlyContinue |
     Select-Object Name,ReceivedBytes,SentBytes`,
    [],
    { timeoutMs: 10000 },
  );
  const now = Date.now();
  const counters: Record<string, { rx: number; tx: number }> = {};
  const list = toArray(raw).map((n: any) => {
    const name = String(n?.Name ?? '');
    const rx = Number(n?.ReceivedBytes) || 0;
    const tx = Number(n?.SentBytes) || 0;
    counters[name] = { rx, tx };
    let down = 0;
    let up = 0;
    if (lastNetSample) {
      const prev = lastNetSample.counters[name];
      const seconds = (now - lastNetSample.at) / 1000;
      if (prev && seconds > 0.2) {
        down = Math.max(0, (rx - prev.rx) / seconds);
        up = Math.max(0, (tx - prev.tx) / seconds);
      }
    }
    return {
      interfaceName: name,
      downloadBytesPerSec: down,
      uploadBytesPerSec: up,
      totalReceivedBytes: rx,
      totalSentBytes: tx,
    } satisfies NetworkActivity;
  });
  lastNetSample = { at: now, counters };
  return list;
}

function getMemory(): MemoryInfo {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return { totalBytes: total, usedBytes: used, freeBytes: free, usagePercent: total ? (used / total) * 100 : 0 };
}

function getCpu(): CpuInfo {
  const cpus = os.cpus();
  return {
    model: cpus[0]?.model?.trim() ?? 'Ismeretlen CPU',
    cores: Math.max(1, Math.round(cpus.length / 2)),
    logicalProcessors: cpus.length,
    usagePercent: sampleCpuUsage(),
    speedMhz: cpus[0]?.speed ?? 0,
  };
}

/** Teljes pillanatkép a rendszerről. A lassabb WMI hívások párhuzamosan futnak. */
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [disks, gpus, osInfo, network, elevated] = await Promise.all([
    getDisks().catch(() => []),
    getGpus().catch(() => []),
    getOsInfo().catch(
      async () =>
        ({
          caption: `${os.type()} ${os.release()}`,
          version: os.release(),
          build: '',
          displayVersion: '',
          architecture: os.arch(),
          installDate: null,
          computerName: os.hostname(),
          userName: os.userInfo().username,
          isWindows11: false,
        }) as OsInfo,
    ),
    getNetworkActivity().catch(() => []),
    isElevated().catch(() => false),
  ]);

  return {
    cpu: getCpu(),
    memory: getMemory(),
    disks,
    gpus,
    network,
    os: osInfo,
    uptimeSeconds: os.uptime(),
    isElevated: elevated,
    platformSupported: IS_WINDOWS,
    timestamp: Date.now(),
  };
}

/** Háttérfolyamatok száma és a legnagyobb memóriafogyasztók (scan-hez). */
export async function getBackgroundProcessStats(): Promise<{ count: number; heavy: { name: string; memoryMb: number }[] }> {
  if (!IS_WINDOWS) return { count: 0, heavy: [] };
  const raw = await runPowerShellJson<any>(
    `$p = Get-Process | Where-Object { $_.SessionId -ne 0 };
     [pscustomobject]@{
       Count = ($p | Measure-Object).Count
       Heavy = @($p | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 @{n='name';e={$_.ProcessName}}, @{n='memoryMb';e={[math]::Round($_.WorkingSet64/1MB,1)}})
     }`,
    null,
    { timeoutMs: 15000 },
  );
  if (!raw) return { count: 0, heavy: [] };
  return { count: Number(raw.Count) || 0, heavy: toArray(raw.Heavy) as { name: string; memoryMb: number }[] };
}
