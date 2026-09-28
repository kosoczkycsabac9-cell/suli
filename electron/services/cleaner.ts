import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {
  CleanResult,
  CleanResultItem,
  CleanerCategoryId,
  CleanerCategoryResult,
  CleanerTargetSummary,
} from '../../shared/types';
import { IS_WINDOWS, runPowerShell, toArray } from './shell';
import { logger } from './logger';

const WIN_DIR = process.env.SystemRoot ?? 'C:\\Windows';
const LOCAL_APPDATA = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
const USER_TEMP = process.env.TEMP ?? path.join(LOCAL_APPDATA, 'Temp');

/**
 * VÉDETT útvonalak. Bármely törlési kísérlet, ami ezekre (vagy fölé) mutat, blokkolva van.
 * Ez a védelem a takarító modul legfontosabb biztonsági rétege.
 */
const PROTECTED_PATHS = [
  WIN_DIR,
  path.join(WIN_DIR, 'System32'),
  path.join(WIN_DIR, 'SysWOW64'),
  path.join(WIN_DIR, 'WinSxS'),
  path.join(WIN_DIR, 'Boot'),
  path.join(WIN_DIR, 'Fonts'),
  process.env.ProgramFiles ?? 'C:\\Program Files',
  process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Pictures'),
  'C:\\',
].map((p) => path.resolve(p).toLowerCase());

/** Soha nem törölhető kiterjesztések (driverek, rendszerbináris, biztonsági komponensek). */
const BLOCKED_EXTENSIONS = new Set(['.sys', '.dll', '.exe', '.drv', '.msi', '.efi', '.ocx', '.cpl', '.scr']);

function isProtected(target: string): boolean {
  const resolved = path.resolve(target).toLowerCase().replace(/\\+$/, '');
  return PROTECTED_PATHS.some((p) => resolved === p.replace(/\\+$/, ''));
}

/** A törlendő fájl a megadott gyökér alatt van-e (path traversal védelem). */
function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

interface CategoryDefinition {
  id: CleanerCategoryId;
  name: string;
  description: string;
  whatWillBeDeleted: string;
  safe: boolean;
  requiresAdmin: boolean;
  recommended: boolean;
  /** Konkrét könyvtárak. */
  paths: string[];
  /** Csak ennél régebbi fájlok törlése (óra) – a használatban lévők védelme. */
  minAgeHours?: number;
  /** Speciális kezelés (nem fájlrendszeri bejárás). */
  special?: 'recycle-bin';
  extensionFilter?: string[];
}

function browserCachePaths(): string[] {
  const roaming = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  const chromiumProfiles = (base: string) => [
    path.join(base, 'Default', 'Cache'),
    path.join(base, 'Default', 'Code Cache'),
    path.join(base, 'Default', 'GPUCache'),
    path.join(base, 'Default', 'Service Worker', 'CacheStorage'),
  ];
  return [
    ...chromiumProfiles(path.join(LOCAL_APPDATA, 'Google', 'Chrome', 'User Data')),
    ...chromiumProfiles(path.join(LOCAL_APPDATA, 'Microsoft', 'Edge', 'User Data')),
    ...chromiumProfiles(path.join(LOCAL_APPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data')),
    path.join(roaming, 'Mozilla', 'Firefox', 'Profiles'),
    path.join(LOCAL_APPDATA, 'Mozilla', 'Firefox', 'Profiles'),
  ];
}

const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'windows-temp',
    name: 'Windows temporary files',
    description: 'A Windows ideiglenes könyvtárában maradt fájlok (C:\\Windows\\Temp).',
    whatWillBeDeleted:
      'A C:\\Windows\\Temp mappa tartalma (a 24 óránál régebbi fájlok). A mappa maga megmarad, rendszerfájlt nem törlünk.',
    safe: true,
    requiresAdmin: true,
    recommended: true,
    paths: [path.join(WIN_DIR, 'Temp')],
    minAgeHours: 24,
  },
  {
    id: 'user-temp',
    name: 'User temporary files',
    description: 'A felhasználói fiók ideiglenes fájljai (%TEMP%).',
    whatWillBeDeleted: 'A %TEMP% mappa 24 óránál régebbi fájljai. A futó alkalmazások zárolt fájljait kihagyjuk.',
    safe: true,
    requiresAdmin: false,
    recommended: true,
    paths: [USER_TEMP],
    minAgeHours: 24,
  },
  {
    id: 'recycle-bin',
    name: 'Recycle Bin',
    description: 'A Lomtárban lévő, korábban törölt elemek.',
    whatWillBeDeleted: 'A Lomtár teljes tartalma véglegesen törlődik. Ez a művelet nem vonható vissza.',
    safe: true,
    requiresAdmin: false,
    recommended: false,
    paths: [],
    special: 'recycle-bin',
  },
  {
    id: 'browser-cache',
    name: 'Browser cache',
    description: 'Chrome, Edge, Brave és Firefox gyorsítótár fájljai.',
    whatWillBeDeleted:
      'Csak a böngésző cache mappák tartalma. Jelszavak, előzmények, könyvjelzők és sütik NEM törlődnek.',
    safe: true,
    requiresAdmin: false,
    recommended: true,
    paths: browserCachePaths(),
  },
  {
    id: 'thumbnail-cache',
    name: 'Thumbnail cache',
    description: 'Az Explorer bélyegkép-gyorsítótára, a Windows automatikusan újragenerálja.',
    whatWillBeDeleted: 'A thumbcache_*.db és iconcache_*.db fájlok a Windows Explorer cache mappájából.',
    safe: true,
    requiresAdmin: false,
    recommended: true,
    paths: [path.join(LOCAL_APPDATA, 'Microsoft', 'Windows', 'Explorer')],
    extensionFilter: ['.db'],
  },
  {
    id: 'delivery-optimization',
    name: 'Delivery Optimization cache',
    description: 'A Windows Update peer-to-peer letöltési gyorsítótára.',
    whatWillBeDeleted: 'A DeliveryOptimization cache fájljai. A már telepített frissítések nem érintettek.',
    safe: true,
    requiresAdmin: true,
    recommended: true,
    paths: [path.join(WIN_DIR, 'SoftwareDistribution', 'DeliveryOptimization')],
  },
  {
    id: 'crash-dumps',
    name: 'Crash dumps',
    description: 'Alkalmazás- és rendszerösszeomlási memóriaképek.',
    whatWillBeDeleted: 'A .dmp kiterjesztésű összeomlási fájlok a WER és a CrashDumps mappákból.',
    safe: true,
    requiresAdmin: false,
    recommended: true,
    paths: [
      path.join(LOCAL_APPDATA, 'CrashDumps'),
      path.join(LOCAL_APPDATA, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
      path.join(LOCAL_APPDATA, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
    ],
  },
  {
    id: 'windows-update-cache',
    name: 'Windows Update cache (biztonságos)',
    description: 'A már letöltött frissítési csomagok gyorsítótára. Csak a 7 napnál régebbi elemek.',
    whatWillBeDeleted:
      'A C:\\Windows\\SoftwareDistribution\\Download 7 napnál régebbi tartalma. A Windows Update szolgáltatást NEM állítjuk le, telepített frissítést nem távolítunk el.',
    safe: true,
    requiresAdmin: true,
    recommended: false,
    paths: [path.join(WIN_DIR, 'SoftwareDistribution', 'Download')],
    minAgeHours: 24 * 7,
  },
  {
    id: 'windows-logs',
    name: 'Windows log files',
    description: 'Régi CBS és telepítési naplófájlok.',
    whatWillBeDeleted: 'A C:\\Windows\\Logs 30 napnál régebbi .log fájljai. Eseménynaplót nem törlünk.',
    safe: true,
    requiresAdmin: true,
    recommended: false,
    paths: [path.join(WIN_DIR, 'Logs', 'CBS'), path.join(WIN_DIR, 'Logs', 'DISM')],
    minAgeHours: 24 * 30,
    extensionFilter: ['.log', '.cab'],
  },
  {
    id: 'prefetch',
    name: 'Prefetch (opcionális)',
    description:
      'A Windows indítási gyorsítótára. Törlés után az első indítások lassabbak lehetnek, amíg újraépül – ezért nem ajánlott alapból.',
    whatWillBeDeleted: 'A C:\\Windows\\Prefetch 30 napnál régebbi .pf fájljai.',
    safe: true,
    requiresAdmin: true,
    recommended: false,
    paths: [path.join(WIN_DIR, 'Prefetch')],
    minAgeHours: 24 * 30,
    extensionFilter: ['.pf'],
  },
];

export function listCategories(): CategoryDefinition[] {
  return CATEGORIES;
}

interface WalkResult {
  files: { path: string; size: number }[];
  totalSize: number;
}

/** Biztonságos, mélységkorlátos könyvtárbejárás. Symlinkeket nem követünk. */
async function walk(dir: string, def: CategoryDefinition, depth = 0, acc: WalkResult = { files: [], totalSize: 0 }): Promise<WalkResult> {
  if (depth > 8 || acc.files.length > 200_000) return acc;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  const cutoff = def.minAgeHours ? Date.now() - def.minAgeHours * 3600_000 : null;

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(full, def, depth + 1, acc);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext) && def.id !== 'crash-dumps') continue;
    if (def.extensionFilter && !def.extensionFilter.includes(ext)) continue;
    if (def.id === 'crash-dumps' && ext !== '.dmp' && ext !== '.wer' && ext !== '.cab') continue;

    try {
      const stat = await fsp.stat(full);
      if (cutoff && stat.mtimeMs > cutoff) continue;
      acc.files.push({ path: full, size: stat.size });
      acc.totalSize += stat.size;
    } catch {
      /* zárolt vagy megszűnt fájl */
    }
  }
  return acc;
}

async function recycleBinSummary(): Promise<CleanerTargetSummary[]> {
  if (!IS_WINDOWS) return [];
  try {
    const out = await runPowerShell(
      `$shell = New-Object -ComObject Shell.Application
       $bin = $shell.Namespace(0xA)
       $items = @($bin.Items())
       $size = 0; foreach ($i in $items) { $size += [int64]$bin.GetDetailsOf($i, 3) }
       "$($items.Count)|$size"`,
      { timeoutMs: 20000 },
    );
    const [count, size] = out.trim().split('|');
    return [
      {
        path: 'Recycle Bin',
        fileCount: Number(count) || 0,
        sizeBytes: Number(size) || 0,
        sampleFiles: [],
      },
    ];
  } catch {
    return [{ path: 'Recycle Bin', fileCount: 0, sizeBytes: 0, sampleFiles: [] }];
  }
}

/** Elemzés: megmutatja, mit talált, mennyi hely szabadul fel, és pontosan mit törölne. */
export async function analyze(ids?: CleanerCategoryId[]): Promise<CleanerCategoryResult[]> {
  const defs = CATEGORIES.filter((c) => !ids || ids.includes(c.id));

  return Promise.all(
    defs.map(async (def): Promise<CleanerCategoryResult> => {
      const base = {
        id: def.id,
        name: def.name,
        description: def.description,
        whatWillBeDeleted: def.whatWillBeDeleted,
        safe: def.safe,
        requiresAdmin: def.requiresAdmin,
        recommended: def.recommended,
      };
      try {
        if (def.special === 'recycle-bin') {
          const targets = await recycleBinSummary();
          return {
            ...base,
            targets,
            fileCount: targets.reduce((s, t) => s + t.fileCount, 0),
            sizeBytes: targets.reduce((s, t) => s + t.sizeBytes, 0),
          };
        }

        const targets: CleanerTargetSummary[] = [];
        for (const p of def.paths) {
          if (!fs.existsSync(p)) continue;
          const res = await walk(p, def);
          if (!res.files.length) continue;
          targets.push({
            path: p,
            fileCount: res.files.length,
            sizeBytes: res.totalSize,
            sampleFiles: res.files.slice(0, 8).map((f) => f.path),
          });
        }
        return {
          ...base,
          targets,
          fileCount: targets.reduce((s, t) => s + t.fileCount, 0),
          sizeBytes: targets.reduce((s, t) => s + t.sizeBytes, 0),
        };
      } catch (err) {
        return { ...base, targets: [], fileCount: 0, sizeBytes: 0, error: (err as Error).message };
      }
    }),
  );
}

async function emptyRecycleBin(): Promise<{ freed: number; count: number }> {
  const before = await recycleBinSummary();
  await runPowerShell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', { timeoutMs: 60_000 });
  return { freed: before[0]?.sizeBytes ?? 0, count: before[0]?.fileCount ?? 0 };
}

/** Törlés. Minden fájlnál ellenőrizzük, hogy a definiált, engedélyezett gyökér alatt van-e. */
export async function clean(ids: CleanerCategoryId[]): Promise<CleanResult> {
  const started = Date.now();
  const items: CleanResultItem[] = [];

  for (const id of ids) {
    const def = CATEGORIES.find((c) => c.id === id);
    if (!def) continue;

    let deleted = 0;
    let skipped = 0;
    let freed = 0;
    let error: string | undefined;

    try {
      if (def.special === 'recycle-bin') {
        const res = await emptyRecycleBin();
        deleted = res.count;
        freed = res.freed;
      } else {
        for (const root of def.paths) {
          if (!fs.existsSync(root)) continue;
          if (isProtected(root)) {
            skipped += 1;
            continue;
          }
          const res = await walk(root, def);
          for (const file of res.files) {
            if (!isInside(root, file.path) || isProtected(file.path)) {
              skipped += 1;
              continue;
            }
            try {
              await fsp.unlink(file.path);
              deleted += 1;
              freed += file.size;
            } catch {
              skipped += 1; // zárolt / használatban lévő fájl – kihagyjuk
            }
          }
        }
      }
      items.push({ id, name: def.name, deletedFiles: deleted, skippedFiles: skipped, freedBytes: freed, success: true });
      logger.record({
        area: 'Cleaner',
        action: `Tisztítás: ${def.name}`,
        oldValue: `${(freed / 1024 / 1024).toFixed(1)} MB használatban`,
        newValue: `${deleted} fájl törölve, ${skipped} kihagyva`,
        success: true,
      });
    } catch (err) {
      error = (err as Error).message;
      items.push({ id, name: def.name, deletedFiles: deleted, skippedFiles: skipped, freedBytes: freed, success: false, error });
      logger.record({ area: 'Cleaner', action: `Tisztítás: ${def.name}`, oldValue: null, newValue: null, success: false, message: error });
    }
  }

  return {
    items,
    totalFreedBytes: items.reduce((s, i) => s + i.freedBytes, 0),
    totalDeletedFiles: items.reduce((s, i) => s + i.deletedFiles, 0),
    durationMs: Date.now() - started,
  };
}

export const QUICK_CLEAN_CATEGORIES: CleanerCategoryId[] = CATEGORIES.filter((c) => c.recommended).map((c) => c.id);
export { toArray };
