import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BackupEntry,
  type CleanResult,
  type CleanerCategoryId,
  type CleanerCategoryResult,
  type LogEntry,
  type NetworkState,
  type OptimizerApi,
  type PrivacyTweak,
  type PrivacyTweakId,
  type Result,
  type ScanReport,
  type ScanStepResult,
  type StartupItem,
  type SystemSnapshot,
  type ToolDefinition,
  type Tweak,
  type TweakId,
} from '@shared/types';

/**
 * Demó backend. Kizárólag akkor aktiválódik, ha az alkalmazás NEM Electron alatt fut
 * (pl. böngészős UI-előnézet fejlesztés közben). Éles Windows buildben soha nem hívódik.
 */

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GB = 1024 ** 3;

let cpuPhase = 0;

function snapshot(): SystemSnapshot {
  cpuPhase += 0.35;
  const cpu = 22 + Math.sin(cpuPhase) * 12 + Math.random() * 8;
  const mem = 58 + Math.sin(cpuPhase / 3) * 6;
  return {
    cpu: {
      model: 'AMD Ryzen 7 5800X 8-Core Processor',
      cores: 8,
      logicalProcessors: 16,
      usagePercent: Math.max(2, Math.min(98, cpu)),
      speedMhz: 3800,
    },
    memory: {
      totalBytes: 32 * GB,
      usedBytes: (mem / 100) * 32 * GB,
      freeBytes: (1 - mem / 100) * 32 * GB,
      usagePercent: mem,
    },
    disks: [
      { drive: 'C:', label: 'System', fileSystem: 'NTFS', totalBytes: 931 * GB, freeBytes: 214 * GB, usedBytes: 717 * GB, usagePercent: 77 },
      { drive: 'D:', label: 'Data', fileSystem: 'NTFS', totalBytes: 1863 * GB, freeBytes: 1102 * GB, usedBytes: 761 * GB, usagePercent: 40.8 },
    ],
    gpus: [
      { name: 'NVIDIA GeForce RTX 4070', driverVersion: '32.0.15.6094', vramBytes: 12 * GB, usagePercent: Math.max(0, 14 + Math.sin(cpuPhase / 2) * 12) },
    ],
    network: [
      {
        interfaceName: 'Ethernet',
        downloadBytesPerSec: Math.max(0, 1.6e6 + Math.sin(cpuPhase) * 1.2e6),
        uploadBytesPerSec: Math.max(0, 2.1e5 + Math.cos(cpuPhase) * 1.4e5),
        totalReceivedBytes: 184 * GB,
        totalSentBytes: 22 * GB,
      },
    ],
    os: {
      caption: 'Microsoft Windows 11 Pro',
      version: '10.0.26100',
      build: '26100',
      displayVersion: '24H2',
      architecture: '64 bites',
      installDate: '2024-03-11T08:12:00.000Z',
      computerName: 'DESKTOP-DEMO',
      userName: 'demo',
      isWindows11: true,
    },
    uptimeSeconds: 3600 * 52 + 1841,
    isElevated: false,
    platformSupported: false,
    timestamp: Date.now(),
  };
}

const cleanerCategories: CleanerCategoryResult[] = [
  {
    id: 'windows-temp', name: 'Windows temporary files',
    description: 'A Windows ideiglenes könyvtárában maradt fájlok (C:\\Windows\\Temp).',
    whatWillBeDeleted: 'A C:\\Windows\\Temp mappa 24 óránál régebbi fájljai. Rendszerfájlt nem törlünk.',
    safe: true, requiresAdmin: true, recommended: true, fileCount: 1842, sizeBytes: 1.24 * GB,
    targets: [{ path: 'C:\\Windows\\Temp', fileCount: 1842, sizeBytes: 1.24 * GB, sampleFiles: ['C:\\Windows\\Temp\\dd_setup.log', 'C:\\Windows\\Temp\\chrome_installer.tmp'] }],
  },
  {
    id: 'user-temp', name: 'User temporary files',
    description: 'A felhasználói fiók ideiglenes fájljai (%TEMP%).',
    whatWillBeDeleted: 'A %TEMP% 24 óránál régebbi fájljai; a zárolt fájlokat kihagyjuk.',
    safe: true, requiresAdmin: false, recommended: true, fileCount: 3120, sizeBytes: 0.86 * GB,
    targets: [{ path: 'C:\\Users\\demo\\AppData\\Local\\Temp', fileCount: 3120, sizeBytes: 0.86 * GB, sampleFiles: ['...\\Temp\\vscode-x1.tmp'] }],
  },
  {
    id: 'recycle-bin', name: 'Recycle Bin', description: 'A Lomtárban lévő elemek.',
    whatWillBeDeleted: 'A Lomtár teljes tartalma véglegesen törlődik. Ez nem vonható vissza.',
    safe: true, requiresAdmin: false, recommended: false, fileCount: 64, sizeBytes: 2.9 * GB,
    targets: [{ path: 'Recycle Bin', fileCount: 64, sizeBytes: 2.9 * GB, sampleFiles: [] }],
  },
  {
    id: 'browser-cache', name: 'Browser cache', description: 'Chrome, Edge, Brave és Firefox gyorsítótár.',
    whatWillBeDeleted: 'Csak cache fájlok. Jelszó, előzmény, könyvjelző, süti NEM törlődik.',
    safe: true, requiresAdmin: false, recommended: true, fileCount: 9871, sizeBytes: 1.7 * GB,
    targets: [{ path: '...\\Google\\Chrome\\User Data\\Default\\Cache', fileCount: 6112, sizeBytes: 1.1 * GB, sampleFiles: [] }],
  },
  {
    id: 'thumbnail-cache', name: 'Thumbnail cache', description: 'Az Explorer bélyegkép-gyorsítótára.',
    whatWillBeDeleted: 'thumbcache_*.db és iconcache_*.db fájlok.',
    safe: true, requiresAdmin: false, recommended: true, fileCount: 22, sizeBytes: 0.31 * GB,
    targets: [{ path: '...\\Microsoft\\Windows\\Explorer', fileCount: 22, sizeBytes: 0.31 * GB, sampleFiles: [] }],
  },
  {
    id: 'delivery-optimization', name: 'Delivery Optimization cache', description: 'Windows Update P2P gyorsítótár.',
    whatWillBeDeleted: 'A DeliveryOptimization cache fájljai.',
    safe: true, requiresAdmin: true, recommended: true, fileCount: 41, sizeBytes: 0.74 * GB, targets: [],
  },
  {
    id: 'crash-dumps', name: 'Crash dumps', description: 'Összeomlási memóriaképek.',
    whatWillBeDeleted: '.dmp fájlok a WER és CrashDumps mappákból.',
    safe: true, requiresAdmin: false, recommended: true, fileCount: 12, sizeBytes: 0.42 * GB, targets: [],
  },
  {
    id: 'windows-update-cache', name: 'Windows Update cache (biztonságos)', description: 'Már letöltött frissítési csomagok.',
    whatWillBeDeleted: 'A SoftwareDistribution\\Download 7 napnál régebbi tartalma.',
    safe: true, requiresAdmin: true, recommended: false, fileCount: 87, sizeBytes: 2.1 * GB, targets: [],
  },
  {
    id: 'windows-logs', name: 'Windows log files', description: 'Régi CBS és DISM naplók.',
    whatWillBeDeleted: 'A C:\\Windows\\Logs 30 napnál régebbi .log fájljai.',
    safe: true, requiresAdmin: true, recommended: false, fileCount: 54, sizeBytes: 0.18 * GB, targets: [],
  },
  {
    id: 'prefetch', name: 'Prefetch (opcionális)', description: 'Indítási gyorsítótár – törlés után átmenetileg lassabb indulás.',
    whatWillBeDeleted: 'A C:\\Windows\\Prefetch 30 napnál régebbi .pf fájljai.',
    safe: true, requiresAdmin: true, recommended: false, fileCount: 132, sizeBytes: 0.06 * GB, targets: [],
  },
];

let startupItems: StartupItem[] = [
  { id: 'HKCU:Run::Discord', name: 'Discord', publisher: 'Discord Inc.', command: '"C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe', executablePath: 'C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe', location: 'HKCU:Run', enabled: true, impact: 'high', isSystemCritical: false, requiresAdmin: false },
  { id: 'HKCU:Run::Spotify', name: 'Spotify', publisher: 'Spotify AB', command: '"C:\\Users\\demo\\AppData\\Roaming\\Spotify\\Spotify.exe" /minimized', executablePath: 'C:\\...\\Spotify.exe', location: 'HKCU:Run', enabled: true, impact: 'high', isSystemCritical: false, requiresAdmin: false },
  { id: 'HKLM:Run::SecurityHealth', name: 'SecurityHealth', publisher: 'Microsoft Corporation', command: '%windir%\\system32\\SecurityHealthSystray.exe', executablePath: 'C:\\Windows\\System32\\SecurityHealthSystray.exe', location: 'HKLM:Run', enabled: true, impact: 'low', isSystemCritical: true, requiresAdmin: true },
  { id: 'HKCU:Run::OneDrive', name: 'OneDrive', publisher: 'Microsoft Corporation', command: '"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe" /background', executablePath: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe', location: 'HKCU:Run', enabled: true, impact: 'medium', isSystemCritical: false, requiresAdmin: false },
  { id: 'HKLM:Run::NVIDIA', name: 'NVIDIA App', publisher: 'NVIDIA Corporation', command: '"C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\CEF\\NVIDIA app.exe" -s', executablePath: 'C:\\...\\NVIDIA app.exe', location: 'HKLM:Run', enabled: true, impact: 'medium', isSystemCritical: false, requiresAdmin: true },
  { id: 'StartupFolder(User)::Steam', name: 'Steam', publisher: 'Valve Corporation', command: 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Steam.lnk', executablePath: null, location: 'StartupFolder(User)', enabled: false, impact: 'high', isSystemCritical: false, requiresAdmin: false },
  { id: 'HKCU:Run::Teams', name: 'Microsoft Teams', publisher: 'Microsoft Corporation', command: '"C:\\...\\ms-teams.exe" --system-initiated', executablePath: 'C:\\...\\ms-teams.exe', location: 'HKCU:Run', enabled: true, impact: 'high', isSystemCritical: false, requiresAdmin: false },
];

let tweaks: Tweak[] = [
  { id: 'power-plan-high', category: 'performance', name: 'Energiaséma: Nagy teljesítmény', description: 'Asztali gépeken megakadályozza a CPU agresszív visszaszabályozását. Laptopon rövidebb üzemidőt jelenthet.', technicalDetails: 'powercfg /setactive 8c5e7fda-…', currentState: 'Kiegyensúlyozott', recommendedState: 'High performance', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'visual-effects-performance', category: 'performance', name: 'Vizuális effektek: teljesítményre optimalizálva', description: 'Csökkenti az animációkat és árnyékokat; a betűsimítás bekapcsolva marad.', technicalDetails: 'HKCU\\…\\VisualEffects\\VisualFXSetting = 2', currentState: 'Automatikus', recommendedState: 'Teljesítmény', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'transparency-effects', category: 'performance', name: 'Átlátszósági effektek kikapcsolása', description: 'Kicsit csökkenti a GPU-terhelést, főleg integrált grafikán.', technicalDetails: 'HKCU\\…\\Personalize\\EnableTransparency = 0', currentState: 'Bekapcsolva', recommendedState: 'Kikapcsolva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'game-mode', category: 'performance', name: 'Windows Game Mode', description: 'Játék közben prioritást ad a játéknak. Hivatalos Microsoft beállítás.', technicalDetails: 'HKCU\\Software\\Microsoft\\GameBar\\AutoGameModeEnabled = 1', currentState: 'Bekapcsolva', recommendedState: 'Bekapcsolva', applied: true, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'storage-sense', category: 'storage', name: 'Storage Sense (Tárhelyérzék)', description: 'A Windows beépített automatikus takarítása.', technicalDetails: 'HKCU\\…\\StorageSense\\…\\01 = 1', currentState: 'Kikapcsolva', recommendedState: 'Bekapcsolva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'background-apps', category: 'performance', name: 'Háttérben futó Store appok korlátozása', description: 'Felszabadít némi RAM-ot; egyes értesítések megszűnhetnek.', technicalDetails: 'HKCU\\…\\BackgroundAccessApplications\\GlobalUserDisabled = 1', currentState: 'Engedélyezve', recommendedState: 'Korlátozva', applied: false, risk: 'moderate', requiresAdmin: false, reversible: true },
  { id: 'startup-delay', category: 'performance', name: 'Indítási appok késleltetésének kikapcsolása', description: 'Az appok hamarabb elérhetők, az asztal viszont lassabban jelenhet meg.', technicalDetails: 'HKCU\\…\\Serialize\\StartupDelayInMSec = 0', currentState: 'Alapértelmezett (~10 mp)', recommendedState: 'Késleltetés nélkül', applied: false, risk: 'moderate', requiresAdmin: false, reversible: true },
  { id: 'hibernation', category: 'storage', name: 'Hibernálás kikapcsolása', description: 'Helyet nyersz, de elveszik a hibernálás és a gyorsindítás.', technicalDetails: 'powercfg /hibernate off', currentState: 'Bekapcsolva', recommendedState: 'Igény szerint', applied: false, risk: 'moderate', requiresAdmin: true, reversible: true },
  { id: 'search-indexing-throttle', category: 'performance', name: 'Keresési indexelés visszafogása akkumulátoron', description: 'Akkumulátoros üzemben kevesebb erőforrást használ az indexelő.', technicalDetails: 'HKLM\\…\\Windows Search\\PreventIndexOnBattery = 1', currentState: 'Alapértelmezett', recommendedState: 'Visszafogva', applied: false, risk: 'safe', requiresAdmin: true, reversible: true },
];

let privacyTweaks: PrivacyTweak[] = [
  { id: 'telemetry-level', category: 'privacy', name: 'Telemetria minimalizálása', description: 'A diagnosztikai adatküldést a legalacsonyabb támogatott szintre állítja.', technicalDetails: 'HKLM\\…\\DataCollection\\AllowTelemetry = 0', currentState: 'Full', recommendedState: 'Minimális', applied: false, risk: 'safe', requiresAdmin: true, reversible: true },
  { id: 'advertising-id', category: 'privacy', name: 'Hirdetési azonosító kikapcsolása', description: 'Megakadályozza az egyedi hirdetési ID alapú követést.', technicalDetails: 'HKCU\\…\\AdvertisingInfo\\Enabled = 0', currentState: 'Bekapcsolva', recommendedState: 'Kikapcsolva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'activity-history', category: 'privacy', name: 'Tevékenységelőzmények küldésének letiltása', description: 'A Timeline adatok nem kerülnek fel a felhőbe.', technicalDetails: 'HKLM\\…\\System\\UploadUserActivities = 0', currentState: 'Engedélyezve', recommendedState: 'Letiltva', applied: false, risk: 'safe', requiresAdmin: true, reversible: true },
  { id: 'diagnostic-data-tailored', category: 'privacy', name: 'Személyre szabott élmények kikapcsolása', description: 'Nem kapsz diagnosztikai adatokra épülő tippeket és ajánlásokat.', technicalDetails: 'HKCU\\…\\Privacy\\TailoredExperiences… = 0', currentState: 'Bekapcsolva', recommendedState: 'Kikapcsolva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'app-launch-tracking', category: 'privacy', name: 'Alkalmazásindítás-követés kikapcsolása', description: 'A Start menü nem követi az appindításokat.', technicalDetails: 'HKCU\\…\\Advanced\\Start_TrackProgs = 0', currentState: 'Bekapcsolva', recommendedState: 'Kikapcsolva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'typing-personalization', category: 'privacy', name: 'Gépelési adatok gyűjtésének letiltása', description: 'Nem gyűjt gépelési mintákat a rendszer.', technicalDetails: 'HKCU\\…\\InputPersonalization\\RestrictImplicitTextCollection = 1', currentState: 'Engedélyezve', recommendedState: 'Letiltva', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'feedback-frequency', category: 'privacy', name: 'Visszajelzés-kérések kikapcsolása', description: 'A Windows nem kér időnként visszajelzést.', technicalDetails: 'HKCU\\Software\\Microsoft\\Siuf\\Rules\\NumberOfSIUFInPeriod = 0', currentState: 'Automatikus', recommendedState: 'Soha', applied: false, risk: 'safe', requiresAdmin: false, reversible: true },
  { id: 'location-access', category: 'privacy', name: 'Helyadat-hozzáférés', description: 'Appokra bontva a Windows Beállításokban kezelhető – szándékosan nem írjuk felül.', technicalDetails: 'Csak olvasás. Módosítás: Beállítások → Adatvédelem → Hely.', currentState: 'Engedélyezve', recommendedState: 'Felhasználói döntés', applied: false, risk: 'moderate', requiresAdmin: false, reversible: true, openSettingsUri: 'ms-settings:privacy-location' },
];

const tools: ToolDefinition[] = [
  { id: 'disk-cleanup', name: 'Disk Cleanup', description: 'A Windows beépített lemezkarbantartója (cleanmgr.exe).', icon: 'broom', requiresAdmin: false },
  { id: 'task-manager', name: 'Task Manager', description: 'Folyamatok, teljesítmény és indítási appok kezelése.', icon: 'activity', requiresAdmin: false },
  { id: 'device-manager', name: 'Device Manager', description: 'Hardvereszközök és illesztőprogramok kezelése.', icon: 'cpu', requiresAdmin: true },
  { id: 'services', name: 'Services', description: 'Windows szolgáltatások kezelése.', icon: 'server', requiresAdmin: true },
  { id: 'event-viewer', name: 'Event Viewer', description: 'Rendszer- és alkalmazásnaplók.', icon: 'list', requiresAdmin: true },
  { id: 'system-information', name: 'System Information', description: 'Részletes hardver- és szoftverleltár.', icon: 'info', requiresAdmin: false },
  { id: 'resource-monitor', name: 'Resource Monitor', description: 'Valós idejű erőforrás-figyelő.', icon: 'gauge', requiresAdmin: false },
  { id: 'defragment', name: 'Drive Optimization', description: 'Meghajtók optimalizálása.', icon: 'disc', requiresAdmin: false },
  { id: 'cmd', name: 'Command Prompt', description: 'Klasszikus parancssor.', icon: 'terminal', requiresAdmin: false },
  { id: 'powershell', name: 'PowerShell', description: 'Windows PowerShell konzol.', icon: 'terminal-square', requiresAdmin: false },
  { id: 'registry-editor', name: 'Registry Editor', description: 'Rendszerleíró szerkesztő. Csak tapasztalt felhasználóknak!', icon: 'database', requiresAdmin: true },
  { id: 'windows-update', name: 'Windows Update', description: 'A Windows Update oldal megnyitása.', icon: 'refresh', requiresAdmin: false },
];

let logs: LogEntry[] = [
  { id: '1', timestamp: new Date(Date.now() - 3600_000).toISOString(), level: 'success', area: 'Cleaner', action: 'Tisztítás: User temporary files', oldValue: '0.86 GB használatban', newValue: '3120 fájl törölve, 12 kihagyva', success: true },
  { id: '2', timestamp: new Date(Date.now() - 7200_000).toISOString(), level: 'success', area: 'Performance', action: 'Alkalmazva: Windows Game Mode', oldValue: 'AutoGameModeEnabled=0', newValue: 'AutoGameModeEnabled=1', success: true },
  { id: '3', timestamp: new Date(Date.now() - 9000_000).toISOString(), level: 'info', area: 'Scan', action: 'Rendszervizsgálat lefutott', oldValue: null, newValue: 'Health score: 84/100, 9 találat', success: true },
];

let backupEntries: BackupEntry[] = [
  { id: 'b1', kind: 'registry', label: 'Windows Game Mode', createdAt: new Date(Date.now() - 7200_000).toISOString(), description: 'Eredeti állapot: Kikapcsolva. Visszaállítás esetén ez az érték kerül vissza.', restorable: true, restored: false, payload: { tweakId: 'game-mode', value: '0' } },
  { id: 'b2', kind: 'startup', label: 'Startup: Steam', createdAt: new Date(Date.now() - 86_400_000).toISOString(), description: 'Steam indítási állapota: engedélyezve → letiltva', restorable: true, restored: false, payload: {} },
];

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let progressCallbacks: ((s: ScanStepResult) => void)[] = [];

const SCAN_STEPS: { id: ScanStepResult['id']; label: string; detail: string; findings: number }[] = [
  { id: 'temporary-files', label: 'Temporary files', detail: '10.52 GB felszabadítható', findings: 8 },
  { id: 'storage', label: 'Storage', detail: '1 meghajtón kevés a hely', findings: 1 },
  { id: 'startup-apps', label: 'Startup applications', detail: '5 letiltható indítási elem', findings: 5 },
  { id: 'background-processes', label: 'Background processes', detail: '148 felhasználói folyamat fut', findings: 2 },
  { id: 'network-config', label: 'Network configuration', detail: 'Kapcsolat rendben', findings: 0 },
  { id: 'windows-settings', label: 'Windows settings', detail: '5 opcionális optimalizáció', findings: 5 },
  { id: 'privacy-settings', label: 'Privacy settings', detail: '6 adatvédelmi javaslat', findings: 6 },
];

export function createMockApi(): OptimizerApi {
  return {
    app: {
      getInfo: async () => ok({ version: '1.0.0', electron: 'demo', platform: 'browser-preview', isElevated: false, isMock: true }),
      relaunchAsAdmin: async () => ({ ok: false, error: 'Demó módban nem érhető el.' }),
      minimize: () => {},
      maximizeToggle: () => {},
      close: () => {},
    },
    system: { snapshot: async () => ok(snapshot()) },
    scan: {
      run: async () => {
        const startedAt = new Date().toISOString();
        for (const step of SCAN_STEPS) {
          progressCallbacks.forEach((cb) => cb({ ...step, status: 'running', findings: 0, detail: '' }));
          await delay(520);
          progressCallbacks.forEach((cb) => cb({ ...step, status: 'done' }));
        }
        const report: ScanReport = {
          startedAt,
          finishedAt: new Date().toISOString(),
          healthScore: 87,
          steps: SCAN_STEPS.map((s) => ({ ...s, status: 'done' as const })),
          issues: [
            { id: 'i1', category: 'Temporary Files', title: 'Windows temporary files', detail: '1270 MB felszabadítható, 1842 fájl.', severity: 'low', page: 'cleaner', sizeBytes: 1.24 * GB },
            { id: 'i2', category: 'Junk Files', title: 'Recycle Bin', detail: '2969 MB felszabadítható, 64 fájl.', severity: 'medium', page: 'cleaner', sizeBytes: 2.9 * GB },
            { id: 'i3', category: 'Junk Files', title: 'Browser cache', detail: '1740 MB felszabadítható, 9871 fájl.', severity: 'low', page: 'cleaner', sizeBytes: 1.7 * GB },
            { id: 'i4', category: 'Startup Apps', title: '5 alkalmazás indul a Windowsszal', detail: 'Ebből 3 jelentős indítási hatással.', severity: 'low', page: 'startup' },
            { id: 'i5', category: 'Background Processes', title: 'chrome – 1420 MB memória', detail: 'Nagy memóriafogyasztó folyamat.', severity: 'info', page: 'tools' },
            { id: 'i6', category: 'Windows Settings', title: 'Storage Sense (Tárhelyérzék)', detail: 'Jelenleg: Kikapcsolva → Ajánlott: Bekapcsolva', severity: 'info', page: 'performance' },
            { id: 'i7', category: 'Privacy', title: 'Hirdetési azonosító kikapcsolása', detail: 'Jelenleg: Bekapcsolva → Ajánlott: Kikapcsolva', severity: 'low', page: 'privacy' },
            { id: 'i8', category: 'Storage', title: 'C: meghajtó majdnem tele (77%)', detail: '214 GB szabad hely maradt.', severity: 'medium', page: 'cleaner' },
            { id: 'i9', category: 'Network', title: 'Magas válaszidő', detail: 'Átlagos latency: 8.8.8.8: 118 ms.', severity: 'low', page: 'network' },
          ],
          reclaimableBytes: 10.52 * GB,
          startupAppCount: 5,
          optionalOptimizations: 11,
        };
        return ok(report);
      },
      onProgress: (cb) => {
        progressCallbacks.push(cb);
        return () => {
          progressCallbacks = progressCallbacks.filter((c) => c !== cb);
        };
      },
    },
    cleaner: {
      analyze: async (ids?: CleanerCategoryId[]) => {
        await delay(900);
        return ok(cleanerCategories.filter((c) => !ids || ids.includes(c.id)));
      },
      clean: async (ids: CleanerCategoryId[]) => {
        await delay(1400);
        const items = cleanerCategories
          .filter((c) => ids.includes(c.id))
          .map((c) => ({ id: c.id, name: c.name, deletedFiles: c.fileCount, skippedFiles: Math.round(c.fileCount * 0.02), freedBytes: c.sizeBytes, success: true }));
        items.forEach((i) => {
          const cat = cleanerCategories.find((c) => c.id === i.id)!;
          cat.sizeBytes = 0;
          cat.fileCount = 0;
        });
        const result: CleanResult = {
          items,
          totalFreedBytes: items.reduce((s, i) => s + i.freedBytes, 0),
          totalDeletedFiles: items.reduce((s, i) => s + i.deletedFiles, 0),
          durationMs: 1400,
        };
        return ok(result);
      },
    },
    startup: {
      list: async () => { await delay(500); return ok(startupItems); },
      setEnabled: async (id, enabled) => {
        const item = startupItems.find((i) => i.id === id);
        if (!item) return { ok: false, error: 'Nem található.' };
        if (item.isSystemCritical && !enabled) return { ok: false, error: 'Windows rendszerkomponens – nem tiltható le.' };
        await delay(350);
        startupItems = startupItems.map((i) => (i.id === id ? { ...i, enabled } : i));
        return ok({ ...item, enabled });
      },
    },
    performance: {
      list: async () => { await delay(450); return ok(tweaks); },
      apply: async (id: TweakId) => {
        await delay(700);
        tweaks = tweaks.map((t) => (t.id === id ? { ...t, applied: true, currentState: t.recommendedState } : t));
        return ok(tweaks.find((t) => t.id === id)!);
      },
      undo: async (id: TweakId) => {
        await delay(600);
        tweaks = tweaks.map((t) => (t.id === id ? { ...t, applied: false, currentState: 'Eredeti érték visszaállítva' } : t));
        return ok(tweaks.find((t) => t.id === id)!);
      },
    },
    network: {
      state: async () => {
        await delay(800);
        const state: NetworkState = {
          adapters: [
            { name: 'Ethernet', description: 'Realtek Gaming 2.5GbE Family Controller', macAddress: '9C-6B-00-11-22-33', status: 'Up', linkSpeed: '2.5 Gbps', ipv4: ['192.168.0.24'], ipv6: ['fe80::a1b2:c3d4:e5f6:7788'], gateway: ['192.168.0.1'], dnsServers: ['192.168.0.1', '1.1.1.1'], dhcpEnabled: true },
            { name: 'Wi-Fi', description: 'Intel(R) Wi-Fi 6E AX211 160MHz', macAddress: 'A4-BB-6D-44-55-66', status: 'Disconnected', linkSpeed: '0 bps', ipv4: [], ipv6: [], gateway: [], dnsServers: [], dhcpEnabled: true },
          ],
          latency: [
            { host: '1.1.1.1', reachable: true, averageMs: 11.4, packetLossPercent: 0 },
            { host: '8.8.8.8', reachable: true, averageMs: 118, packetLossPercent: 0 },
            { host: 'www.microsoft.com', reachable: true, averageMs: 24.7, packetLossPercent: 0 },
          ],
          internetConnected: true,
          publicDnsWorking: true,
        };
        return ok(state);
      },
      runAction: async (action) => {
        await delay(1200);
        return ok({ output: `Demó mód: a(z) "${action}" művelet valós rendszeren futna le.`, rebootRecommended: action === 'winsock-reset' || action === 'tcpip-reset' });
      },
    },
    privacy: {
      list: async () => { await delay(450); return ok(privacyTweaks); },
      apply: async (id: PrivacyTweakId) => {
        const def = privacyTweaks.find((t) => t.id === id)!;
        if (def.openSettingsUri) return { ok: false, error: 'Ez a beállítás csak a Windows Beállításokban módosítható.' };
        await delay(600);
        privacyTweaks = privacyTweaks.map((t) => (t.id === id ? { ...t, applied: true, currentState: t.recommendedState } : t));
        return ok(privacyTweaks.find((t) => t.id === id)!);
      },
      undo: async (id: PrivacyTweakId) => {
        await delay(500);
        privacyTweaks = privacyTweaks.map((t) => (t.id === id ? { ...t, applied: false, currentState: 'Eredeti érték visszaállítva' } : t));
        return ok(privacyTweaks.find((t) => t.id === id)!);
      },
      openSettings: async () => ok(true),
    },
    tools: {
      list: async () => ok(tools),
      launch: async () => ({ ok: false, error: 'Demó mód: a natív Windows eszközök csak Windows alatt indíthatók.' }),
    },
    restore: {
      listRestorePoints: async () => {
        await delay(700);
        return ok([
          { sequenceNumber: 42, description: 'WinOptimizer – storage-sense', creationTime: new Date(Date.now() - 86_400_000).toISOString(), type: 'MODIFY_SETTINGS' },
          { sequenceNumber: 41, description: 'Windows Update', creationTime: new Date(Date.now() - 5 * 86_400_000).toISOString(), type: 'CRITICAL_UPDATE' },
        ]);
      },
      createRestorePoint: async () => ({ ok: false, error: 'Demó mód: visszaállítási pont csak Windows alatt, rendszergazdaként hozható létre.' }),
      listBackups: async () => ok(backupEntries),
      restoreBackup: async (id) => {
        await delay(600);
        backupEntries = backupEntries.map((b) => (b.id === id ? { ...b, restored: true, restorable: false } : b));
        return ok(backupEntries.find((b) => b.id === id)!);
      },
      deleteBackup: async (id) => {
        backupEntries = backupEntries.filter((b) => b.id !== id);
        return ok(true);
      },
    },
    logs: {
      list: async () => ok(logs),
      clear: async () => { logs = []; return ok(true); },
      export: async () => ({ ok: false, error: 'Demó mód: az exportálás az asztali alkalmazásban érhető el.' }),
    },
    settings: {
      get: async () => ok(settings),
      set: async (patch) => { settings = { ...settings, ...patch }; return ok(settings); },
    },
  };
}
