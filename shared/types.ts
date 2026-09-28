/**
 * Megosztott típusdefiníciók a main (Electron) és a renderer (React) között.
 * Ez a fájl nem tartalmazhat futásidejű Node.js függőséget.
 */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/* ---------------------------------- Rendszer ---------------------------------- */

export interface CpuInfo {
  model: string;
  cores: number;
  logicalProcessors: number;
  usagePercent: number;
  speedMhz: number;
}

export interface MemoryInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
}

export interface DiskInfo {
  drive: string;
  label: string;
  fileSystem: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface GpuInfo {
  name: string;
  driverVersion: string;
  vramBytes: number;
  usagePercent: number | null;
}

export interface NetworkActivity {
  interfaceName: string;
  downloadBytesPerSec: number;
  uploadBytesPerSec: number;
  totalReceivedBytes: number;
  totalSentBytes: number;
}

export interface OsInfo {
  caption: string;
  version: string;
  build: string;
  displayVersion: string;
  architecture: string;
  installDate: string | null;
  computerName: string;
  userName: string;
  isWindows11: boolean;
}

export interface SystemSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  gpus: GpuInfo[];
  network: NetworkActivity[];
  os: OsInfo;
  uptimeSeconds: number;
  isElevated: boolean;
  platformSupported: boolean;
  timestamp: number;
}

/* ---------------------------------- Cleaner ---------------------------------- */

export type CleanerCategoryId =
  | 'windows-temp'
  | 'user-temp'
  | 'recycle-bin'
  | 'browser-cache'
  | 'thumbnail-cache'
  | 'delivery-optimization'
  | 'crash-dumps'
  | 'windows-update-cache'
  | 'windows-logs'
  | 'prefetch';

export interface CleanerTargetSummary {
  path: string;
  fileCount: number;
  sizeBytes: number;
  sampleFiles: string[];
}

export interface CleanerCategoryResult {
  id: CleanerCategoryId;
  name: string;
  description: string;
  /** Mit töröl pontosan – emberi nyelven, a confirmation dialoghoz. */
  whatWillBeDeleted: string;
  safe: boolean;
  requiresAdmin: boolean;
  recommended: boolean;
  fileCount: number;
  sizeBytes: number;
  targets: CleanerTargetSummary[];
  error?: string;
}

export interface CleanResultItem {
  id: CleanerCategoryId;
  name: string;
  deletedFiles: number;
  skippedFiles: number;
  freedBytes: number;
  success: boolean;
  error?: string;
}

export interface CleanResult {
  items: CleanResultItem[];
  totalFreedBytes: number;
  totalDeletedFiles: number;
  durationMs: number;
}

/* ---------------------------------- Startup ---------------------------------- */

export type StartupLocation =
  | 'HKCU:Run'
  | 'HKLM:Run'
  | 'HKLM:Run(WOW6432)'
  | 'HKCU:RunOnce'
  | 'HKLM:RunOnce'
  | 'StartupFolder(User)'
  | 'StartupFolder(Common)'
  | 'ScheduledTask';

export type StartupImpact = 'none' | 'low' | 'medium' | 'high' | 'unknown';

export interface StartupItem {
  id: string;
  name: string;
  publisher: string;
  command: string;
  executablePath: string | null;
  location: StartupLocation;
  enabled: boolean;
  impact: StartupImpact;
  /** Windows rendszerfolyamat – nem tiltható le az alkalmazásból. */
  isSystemCritical: boolean;
  requiresAdmin: boolean;
}

/* -------------------------------- Performance -------------------------------- */

export type TweakId =
  | 'power-plan-high'
  | 'visual-effects-performance'
  | 'game-mode'
  | 'storage-sense'
  | 'background-apps'
  | 'startup-delay'
  | 'hibernation'
  | 'transparency-effects'
  | 'search-indexing-throttle';

export type TweakRisk = 'safe' | 'moderate';

export interface Tweak {
  id: TweakId;
  category: 'performance' | 'privacy' | 'storage';
  name: string;
  description: string;
  /** Pontosan mit módosít – registry kulcs / parancs, a confirm dialoghoz. */
  technicalDetails: string;
  currentState: string;
  recommendedState: string;
  applied: boolean;
  risk: TweakRisk;
  requiresAdmin: boolean;
  reversible: boolean;
  error?: string;
}

/* ---------------------------------- Network ---------------------------------- */

export interface NetworkAdapter {
  name: string;
  description: string;
  macAddress: string;
  status: string;
  linkSpeed: string;
  ipv4: string[];
  ipv6: string[];
  gateway: string[];
  dnsServers: string[];
  dhcpEnabled: boolean;
}

export interface LatencyResult {
  host: string;
  reachable: boolean;
  averageMs: number | null;
  packetLossPercent: number;
}

export interface NetworkState {
  adapters: NetworkAdapter[];
  latency: LatencyResult[];
  internetConnected: boolean;
  publicDnsWorking: boolean;
}

export type NetworkActionId =
  | 'flush-dns'
  | 'release-renew-ip'
  | 'winsock-reset'
  | 'tcpip-reset'
  | 'restart-adapter';

/* ---------------------------------- Privacy ---------------------------------- */

export type PrivacyTweakId =
  | 'telemetry-level'
  | 'advertising-id'
  | 'activity-history'
  | 'location-access'
  | 'diagnostic-data-tailored'
  | 'feedback-frequency'
  | 'app-launch-tracking'
  | 'typing-personalization';

export interface PrivacyTweak extends Omit<Tweak, 'id' | 'category'> {
  id: PrivacyTweakId;
  category: 'privacy';
  /** Néhány beállítás csak a Windows Beállítások appban módosítható biztonságosan. */
  openSettingsUri?: string;
}

/* ----------------------------------- Tools ----------------------------------- */

export type ToolId =
  | 'disk-cleanup'
  | 'task-manager'
  | 'device-manager'
  | 'services'
  | 'event-viewer'
  | 'system-information'
  | 'cmd'
  | 'powershell'
  | 'windows-update'
  | 'defragment'
  | 'registry-editor'
  | 'resource-monitor';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  icon: string;
  requiresAdmin: boolean;
}

/* ------------------------------- Restore / Log ------------------------------- */

export interface RestorePoint {
  sequenceNumber: number;
  description: string;
  creationTime: string;
  type: string;
}

export type BackupKind = 'registry' | 'startup' | 'power-plan' | 'network' | 'settings';

export interface BackupEntry {
  id: string;
  kind: BackupKind;
  label: string;
  createdAt: string;
  /** Emberi nyelvű leírás a visszaállításról. */
  description: string;
  restorable: boolean;
  restored: boolean;
  payload: Record<string, unknown>;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  area: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  success: boolean;
  message?: string;
}

/* ----------------------------------- Scan ------------------------------------ */

export type ScanStepId =
  | 'temporary-files'
  | 'startup-apps'
  | 'background-processes'
  | 'windows-settings'
  | 'privacy-settings'
  | 'network-config'
  | 'storage';

export interface ScanStepResult {
  id: ScanStepId;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  findings: number;
  detail: string;
}

export interface ScanIssue {
  id: string;
  category:
    | 'Junk Files'
    | 'Temporary Files'
    | 'Startup Apps'
    | 'Background Processes'
    | 'Windows Settings'
    | 'Privacy'
    | 'Network'
    | 'Storage';
  title: string;
  detail: string;
  severity: 'info' | 'low' | 'medium' | 'high';
  /** Melyik oldalon oldható meg. */
  page: 'cleaner' | 'startup' | 'performance' | 'network' | 'privacy' | 'tools';
  sizeBytes?: number;
}

export interface ScanReport {
  startedAt: string;
  finishedAt: string;
  healthScore: number;
  steps: ScanStepResult[];
  issues: ScanIssue[];
  reclaimableBytes: number;
  startupAppCount: number;
  optionalOptimizations: number;
}

/* ---------------------------------- Settings --------------------------------- */

export interface AppSettings {
  startWithWindows: boolean;
  minimizeToTray: boolean;
  automaticScan: boolean;
  automaticScanIntervalHours: number;
  theme: 'dark' | 'midnight' | 'system';
  accent: 'blue' | 'purple';
  language: 'hu' | 'en';
  createRestorePointBeforeOptimization: boolean;
  confirmationDialogs: boolean;
  loggingEnabled: boolean;
  telemetry: false;
}

export const DEFAULT_SETTINGS: AppSettings = {
  startWithWindows: false,
  minimizeToTray: true,
  automaticScan: false,
  automaticScanIntervalHours: 24,
  theme: 'dark',
  accent: 'blue',
  language: 'hu',
  createRestorePointBeforeOptimization: true,
  confirmationDialogs: true,
  loggingEnabled: true,
  telemetry: false,
};

/* ----------------------------------- Bridge ---------------------------------- */

export interface OptimizerApi {
  app: {
    getInfo(): Promise<Result<{ version: string; electron: string; platform: string; isElevated: boolean; isMock: boolean }>>;
    relaunchAsAdmin(): Promise<Result<boolean>>;
    minimize(): void;
    maximizeToggle(): void;
    close(): void;
  };
  system: {
    snapshot(): Promise<Result<SystemSnapshot>>;
  };
  scan: {
    run(): Promise<Result<ScanReport>>;
    onProgress(cb: (step: ScanStepResult) => void): () => void;
  };
  cleaner: {
    analyze(categories?: CleanerCategoryId[]): Promise<Result<CleanerCategoryResult[]>>;
    clean(categories: CleanerCategoryId[]): Promise<Result<CleanResult>>;
  };
  startup: {
    list(): Promise<Result<StartupItem[]>>;
    setEnabled(id: string, enabled: boolean): Promise<Result<StartupItem>>;
  };
  performance: {
    list(): Promise<Result<Tweak[]>>;
    apply(id: TweakId): Promise<Result<Tweak>>;
    undo(id: TweakId): Promise<Result<Tweak>>;
  };
  network: {
    state(): Promise<Result<NetworkState>>;
    runAction(action: NetworkActionId, adapterName?: string): Promise<Result<{ output: string; rebootRecommended: boolean }>>;
  };
  privacy: {
    list(): Promise<Result<PrivacyTweak[]>>;
    apply(id: PrivacyTweakId): Promise<Result<PrivacyTweak>>;
    undo(id: PrivacyTweakId): Promise<Result<PrivacyTweak>>;
    openSettings(uri: string): Promise<Result<boolean>>;
  };
  tools: {
    list(): Promise<Result<ToolDefinition[]>>;
    launch(id: ToolId): Promise<Result<boolean>>;
  };
  restore: {
    listRestorePoints(): Promise<Result<RestorePoint[]>>;
    createRestorePoint(description: string): Promise<Result<boolean>>;
    listBackups(): Promise<Result<BackupEntry[]>>;
    restoreBackup(id: string): Promise<Result<BackupEntry>>;
    deleteBackup(id: string): Promise<Result<boolean>>;
  };
  logs: {
    list(limit?: number): Promise<Result<LogEntry[]>>;
    clear(): Promise<Result<boolean>>;
    export(): Promise<Result<{ path: string } | null>>;
  };
  settings: {
    get(): Promise<Result<AppSettings>>;
    set(patch: Partial<AppSettings>): Promise<Result<AppSettings>>;
  };
}
