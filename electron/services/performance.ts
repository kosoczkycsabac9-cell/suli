import type { Tweak, TweakId } from '../../shared/types';
import { IS_WINDOWS, runPowerShell } from './shell';
import { deleteValue, readValue, writeValue } from './registry';
import { logger } from './logger';
import { backups } from './restore';

interface TweakDefinition {
  id: TweakId;
  category: Tweak['category'];
  name: string;
  description: string;
  technicalDetails: string;
  recommendedState: string;
  risk: Tweak['risk'];
  requiresAdmin: boolean;
  reversible: boolean;
  read(): Promise<{ state: string; applied: boolean }>;
  apply(): Promise<{ oldValue: string; newValue: string }>;
  undo(previous: Record<string, unknown>): Promise<void>;
}

const REG = {
  visualFx: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects',
  desktopPref: 'HKCU:\\Control Panel\\Desktop',
  gameBar: 'HKCU:\\Software\\Microsoft\\GameBar',
  gameDvr: 'HKCU:\\System\\GameConfigStore',
  personalize: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
  backgroundApps: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications',
  storageSense: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy',
  serialize: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize',
};

const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const BALANCED_GUID = '381b4222-f694-41f0-9685-ff5bb260df2e';

async function getActivePowerPlan(): Promise<{ guid: string; name: string }> {
  const out = await runPowerShell(
    `$p = powercfg /getactivescheme; $p`,
    { timeoutMs: 12_000 },
  );
  const match = out.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\(([^)]*)\)/i);
  return { guid: match?.[1] ?? '', name: match?.[2]?.trim() ?? 'Ismeretlen' };
}

const DEFINITIONS: TweakDefinition[] = [
  {
    id: 'power-plan-high',
    category: 'performance',
    name: 'Energiaséma: Nagy teljesítmény',
    description:
      'Asztali gépeken megakadályozza a CPU agresszív visszaszabályozását. Laptopon rövidebb üzemidőt jelenthet, ezért csak hálózati tápellátás mellett ajánlott.',
    technicalDetails: `powercfg /setactive ${HIGH_PERF_GUID} (High performance séma aktiválása). Az eredeti séma GUID-ja mentésre kerül.`,
    recommendedState: 'High performance',
    risk: 'safe',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const plan = await getActivePowerPlan();
      return { state: plan.name, applied: plan.guid.toLowerCase() === HIGH_PERF_GUID };
    },
    async apply() {
      const before = await getActivePowerPlan();
      await runPowerShell(
        `powercfg -duplicatescheme ${HIGH_PERF_GUID} 2>$null | Out-Null; powercfg /setactive ${HIGH_PERF_GUID}`,
      );
      return { oldValue: before.name || before.guid, newValue: 'High performance' };
    },
    async undo(previous) {
      const guid = String(previous.guid || BALANCED_GUID);
      await runPowerShell(`powercfg /setactive ${guid}`);
    },
  },
  {
    id: 'visual-effects-performance',
    category: 'performance',
    name: 'Vizuális effektek: teljesítményre optimalizálva',
    description:
      'Csökkenti az animációkat és árnyékokat. Gyengébb GPU-val érezhetően gyorsabb ablakkezelést eredményez; a betűsimítás bekapcsolva marad.',
    technicalDetails:
      'HKCU\\...\\Explorer\\VisualEffects\\VisualFXSetting = 2 és HKCU\\Control Panel\\Desktop\\UserPreferencesMask animációs bitjeinek módosítása.',
    recommendedState: 'Teljesítmény',
    risk: 'safe',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.visualFx, 'VisualFXSetting');
      const map: Record<string, string> = { '0': 'Automatikus', '1': 'Megjelenés', '2': 'Teljesítmény', '3': 'Egyéni' };
      return { state: map[v ?? '0'] ?? 'Automatikus', applied: v === '2' };
    },
    async apply() {
      const before = (await readValue(REG.visualFx, 'VisualFXSetting')) ?? '0';
      await writeValue(REG.visualFx, 'VisualFXSetting', 2, 'DWord');
      await writeValue(REG.desktopPref, 'MenuShowDelay', '0', 'String');
      return { oldValue: `VisualFXSetting=${before}`, newValue: 'VisualFXSetting=2' };
    },
    async undo(previous) {
      const prev = previous.visualFx;
      if (prev == null) await deleteValue(REG.visualFx, 'VisualFXSetting');
      else await writeValue(REG.visualFx, 'VisualFXSetting', Number(prev), 'DWord');
      const delay = previous.menuShowDelay;
      if (delay != null) await writeValue(REG.desktopPref, 'MenuShowDelay', String(delay), 'String');
    },
  },
  {
    id: 'transparency-effects',
    category: 'performance',
    name: 'Átlátszósági effektek kikapcsolása',
    description: 'Az akril/mica átlátszóság kikapcsolása némileg csökkenti a GPU-terhelést, főleg integrált grafikán.',
    technicalDetails: 'HKCU\\...\\Themes\\Personalize\\EnableTransparency = 0',
    recommendedState: 'Kikapcsolva',
    risk: 'safe',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.personalize, 'EnableTransparency');
      return { state: v === '0' ? 'Kikapcsolva' : 'Bekapcsolva', applied: v === '0' };
    },
    async apply() {
      const before = (await readValue(REG.personalize, 'EnableTransparency')) ?? '1';
      await writeValue(REG.personalize, 'EnableTransparency', 0, 'DWord');
      return { oldValue: `EnableTransparency=${before}`, newValue: 'EnableTransparency=0' };
    },
    async undo(previous) {
      const prev = previous.value;
      if (prev == null) await deleteValue(REG.personalize, 'EnableTransparency');
      else await writeValue(REG.personalize, 'EnableTransparency', Number(prev), 'DWord');
    },
  },
  {
    id: 'game-mode',
    category: 'performance',
    name: 'Windows Game Mode',
    description:
      'Játék közben prioritást ad a játéknak és visszafogja a háttérben futó frissítéseket. Kizárólag a Microsoft által támogatott, hivatalos beállítás.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\GameBar\\AutoGameModeEnabled = 1',
    recommendedState: 'Bekapcsolva',
    risk: 'safe',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.gameBar, 'AutoGameModeEnabled');
      return { state: v === '1' ? 'Bekapcsolva' : 'Kikapcsolva', applied: v === '1' };
    },
    async apply() {
      const before = (await readValue(REG.gameBar, 'AutoGameModeEnabled')) ?? '0';
      await writeValue(REG.gameBar, 'AutoGameModeEnabled', 1, 'DWord');
      return { oldValue: `AutoGameModeEnabled=${before}`, newValue: 'AutoGameModeEnabled=1' };
    },
    async undo(previous) {
      const prev = previous.value;
      if (prev == null) await deleteValue(REG.gameBar, 'AutoGameModeEnabled');
      else await writeValue(REG.gameBar, 'AutoGameModeEnabled', Number(prev), 'DWord');
    },
  },
  {
    id: 'storage-sense',
    category: 'storage',
    name: 'Storage Sense (Tárhelyérzék)',
    description:
      'A Windows beépített automatikus takarítása: rendszeresen üríti a Lomtárat és a régi ideiglenes fájlokat. Biztonságos, natív megoldás.',
    technicalDetails: 'HKCU\\...\\StorageSense\\Parameters\\StoragePolicy\\01 = 1 (Storage Sense bekapcsolása)',
    recommendedState: 'Bekapcsolva',
    risk: 'safe',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.storageSense, '01');
      return { state: v === '1' ? 'Bekapcsolva' : 'Kikapcsolva', applied: v === '1' };
    },
    async apply() {
      const before = (await readValue(REG.storageSense, '01')) ?? '0';
      await writeValue(REG.storageSense, '01', 1, 'DWord');
      return { oldValue: `StoragePolicy 01=${before}`, newValue: 'StoragePolicy 01=1' };
    },
    async undo(previous) {
      const prev = previous.value;
      if (prev == null) await deleteValue(REG.storageSense, '01');
      else await writeValue(REG.storageSense, '01', Number(prev), 'DWord');
    },
  },
  {
    id: 'background-apps',
    category: 'performance',
    name: 'Háttérben futó Microsoft Store appok korlátozása',
    description:
      'A Store-alkalmazások háttérfutásának letiltása felszabadít némi RAM-ot és CPU-t. A klasszikus asztali programokat nem érinti, az értesítések a legtöbb appnál megszűnhetnek.',
    technicalDetails:
      'HKCU\\...\\BackgroundAccessApplications\\GlobalUserDisabled = 1 és HKCU\\...\\Search\\BackgroundAppGlobalToggle = 0',
    recommendedState: 'Korlátozva',
    risk: 'moderate',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.backgroundApps, 'GlobalUserDisabled');
      return { state: v === '1' ? 'Korlátozva' : 'Engedélyezve', applied: v === '1' };
    },
    async apply() {
      const before = (await readValue(REG.backgroundApps, 'GlobalUserDisabled')) ?? '0';
      await writeValue(REG.backgroundApps, 'GlobalUserDisabled', 1, 'DWord');
      return { oldValue: `GlobalUserDisabled=${before}`, newValue: 'GlobalUserDisabled=1' };
    },
    async undo(previous) {
      const prev = previous.value;
      if (prev == null) await deleteValue(REG.backgroundApps, 'GlobalUserDisabled');
      else await writeValue(REG.backgroundApps, 'GlobalUserDisabled', Number(prev), 'DWord');
    },
  },
  {
    id: 'startup-delay',
    category: 'performance',
    name: 'Indítási appok késleltetésének kikapcsolása',
    description:
      'A Windows alapból ~10 másodperccel késlelteti az indítópult appjait. Kikapcsolva hamarabb elérhetők, cserébe az asztal megjelenése lassabb lehet.',
    technicalDetails: 'HKCU\\...\\Explorer\\Serialize\\StartupDelayInMSec = 0',
    recommendedState: 'Késleltetés nélkül',
    risk: 'moderate',
    requiresAdmin: false,
    reversible: true,
    async read() {
      const v = await readValue(REG.serialize, 'StartupDelayInMSec');
      return { state: v === '0' ? 'Késleltetés nélkül' : 'Alapértelmezett (~10 mp)', applied: v === '0' };
    },
    async apply() {
      const before = await readValue(REG.serialize, 'StartupDelayInMSec');
      await writeValue(REG.serialize, 'StartupDelayInMSec', 0, 'DWord');
      return { oldValue: `StartupDelayInMSec=${before ?? '(nincs)'}`, newValue: 'StartupDelayInMSec=0' };
    },
    async undo(previous) {
      const prev = previous.value;
      if (prev == null) await deleteValue(REG.serialize, 'StartupDelayInMSec');
      else await writeValue(REG.serialize, 'StartupDelayInMSec', Number(prev), 'DWord');
    },
  },
  {
    id: 'hibernation',
    category: 'storage',
    name: 'Hibernálás kikapcsolása (hely felszabadítása)',
    description:
      'A hiberfil.sys mérete a RAM jelentős része. Kikapcsolásával helyet nyersz, viszont elveszik a hibernálás és a gyorsindítás. Csak akkor ajánlott, ha nem használod ezeket.',
    technicalDetails: 'powercfg /hibernate off — a C:\\hiberfil.sys fájl megszűnik. Visszakapcsolás: powercfg /hibernate on',
    recommendedState: 'Igény szerint',
    risk: 'moderate',
    requiresAdmin: true,
    reversible: true,
    async read() {
      try {
        const out = await runPowerShell(
          `(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' -Name HibernateEnabled -ErrorAction SilentlyContinue).HibernateEnabled`,
        );
        const enabled = out.trim() === '1';
        return { state: enabled ? 'Bekapcsolva' : 'Kikapcsolva', applied: !enabled };
      } catch {
        return { state: 'Ismeretlen', applied: false };
      }
    },
    async apply() {
      await runPowerShell('powercfg /hibernate off');
      return { oldValue: 'HibernateEnabled=1', newValue: 'HibernateEnabled=0' };
    },
    async undo() {
      await runPowerShell('powercfg /hibernate on');
    },
  },
  {
    id: 'search-indexing-throttle',
    category: 'performance',
    name: 'Keresési indexelés visszafogása akkumulátoron',
    description:
      'Az indexelő szolgáltatás akkumulátoros üzemben kevesebb erőforrást használ. A keresés továbbra is működik, csak lassabban frissül.',
    technicalDetails:
      'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search\\PreventIndexOnBattery = 1',
    recommendedState: 'Visszafogva',
    risk: 'safe',
    requiresAdmin: true,
    reversible: true,
    async read() {
      const v = await readValue('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'PreventIndexOnBattery');
      return { state: v === '1' ? 'Visszafogva' : 'Alapértelmezett', applied: v === '1' };
    },
    async apply() {
      const key = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search';
      const before = await readValue(key, 'PreventIndexOnBattery');
      await writeValue(key, 'PreventIndexOnBattery', 1, 'DWord');
      return { oldValue: `PreventIndexOnBattery=${before ?? '(nincs)'}`, newValue: 'PreventIndexOnBattery=1' };
    },
    async undo(previous) {
      const key = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search';
      const prev = previous.value;
      if (prev == null) await deleteValue(key, 'PreventIndexOnBattery');
      else await writeValue(key, 'PreventIndexOnBattery', Number(prev), 'DWord');
    },
  },
];

function findDefinition(id: TweakId): TweakDefinition {
  const def = DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Ismeretlen optimalizáció: ${id}`);
  return def;
}

export async function listTweaks(): Promise<Tweak[]> {
  if (!IS_WINDOWS) return [];
  return Promise.all(
    DEFINITIONS.map(async (def): Promise<Tweak> => {
      const base: Tweak = {
        id: def.id,
        category: def.category,
        name: def.name,
        description: def.description,
        technicalDetails: def.technicalDetails,
        currentState: 'Ismeretlen',
        recommendedState: def.recommendedState,
        applied: false,
        risk: def.risk,
        requiresAdmin: def.requiresAdmin,
        reversible: def.reversible,
      };
      try {
        const { state, applied } = await def.read();
        return { ...base, currentState: state, applied };
      } catch (err) {
        return { ...base, error: (err as Error).message };
      }
    }),
  );
}

async function refresh(id: TweakId): Promise<Tweak> {
  const all = await listTweaks();
  return all.find((t) => t.id === id)!;
}

/** Tweak alkalmazása: előtte backup készül az eredeti értékről. */
export async function applyTweak(id: TweakId): Promise<Tweak> {
  const def = findDefinition(id);
  const before = await def.read();

  // Az eredeti nyers érték mentése a pontos visszaállításhoz.
  const payload: Record<string, unknown> = { state: before.state };
  if (id === 'power-plan-high') payload.guid = (await runPowerShell('powercfg /getactivescheme')).match(/[0-9a-f-]{36}/i)?.[0];
  if (id === 'visual-effects-performance') {
    payload.visualFx = await readValue(REG.visualFx, 'VisualFXSetting');
    payload.menuShowDelay = await readValue(REG.desktopPref, 'MenuShowDelay');
  }
  if (id === 'transparency-effects') payload.value = await readValue(REG.personalize, 'EnableTransparency');
  if (id === 'game-mode') payload.value = await readValue(REG.gameBar, 'AutoGameModeEnabled');
  if (id === 'storage-sense') payload.value = await readValue(REG.storageSense, '01');
  if (id === 'background-apps') payload.value = await readValue(REG.backgroundApps, 'GlobalUserDisabled');
  if (id === 'startup-delay') payload.value = await readValue(REG.serialize, 'StartupDelayInMSec');
  if (id === 'search-indexing-throttle')
    payload.value = await readValue('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'PreventIndexOnBattery');

  backups.create({
    kind: def.category === 'performance' || def.category === 'storage' ? 'registry' : 'settings',
    label: def.name,
    description: `Eredeti állapot: ${before.state}. Visszaállítás esetén ez az érték kerül vissza.`,
    payload: { tweakId: id, ...payload },
  });

  try {
    const { oldValue, newValue } = await def.apply();
    logger.record({ area: 'Performance', action: `Alkalmazva: ${def.name}`, oldValue, newValue, success: true });
    return refresh(id);
  } catch (err) {
    logger.record({
      area: 'Performance',
      action: `Alkalmazva: ${def.name}`,
      oldValue: before.state,
      newValue: def.recommendedState,
      success: false,
      message: (err as Error).message,
    });
    throw err;
  }
}

/** Tweak visszavonása a legutóbbi backup alapján. */
export async function undoTweak(id: TweakId): Promise<Tweak> {
  const def = findDefinition(id);
  const entry = backups.list().find((b) => b.payload?.tweakId === id && !b.restored);
  try {
    await def.undo((entry?.payload ?? {}) as Record<string, unknown>);
    if (entry) backups.update(entry.id, { restored: true, restorable: false });
    logger.record({
      area: 'Performance',
      action: `Visszavonva: ${def.name}`,
      oldValue: def.recommendedState,
      newValue: String(entry?.payload?.state ?? 'alapértelmezett'),
      success: true,
    });
    return refresh(id);
  } catch (err) {
    logger.record({
      area: 'Performance',
      action: `Visszavonva: ${def.name}`,
      oldValue: def.recommendedState,
      newValue: null,
      success: false,
      message: (err as Error).message,
    });
    throw err;
  }
}

// A Restore Center „registry” típusú bejegyzéseit ugyanez a logika állítja vissza.
backups.registerHandler('registry', async (entry) => {
  const id = entry.payload?.tweakId as TweakId | undefined;
  if (!id) throw new Error('A bejegyzés nem tartalmaz visszaállítható tweak azonosítót.');
  await findDefinition(id).undo(entry.payload as Record<string, unknown>);
});
