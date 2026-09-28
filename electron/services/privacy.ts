import { shell } from 'electron';
import type { PrivacyTweak, PrivacyTweakId } from '../../shared/types';
import { IS_WINDOWS, isElevated } from './shell';
import { deleteValue, readValue, writeValue } from './registry';
import { logger } from './logger';
import { backups } from './restore';

interface PrivacyDefinition {
  id: PrivacyTweakId;
  name: string;
  description: string;
  technicalDetails: string;
  recommendedState: string;
  key: string;
  value: string;
  onValue: number | string;
  type: 'DWord' | 'String';
  /** A beállítás „bekapcsolt” (adatvédelmi szempontból javasolt) állapotát jelentő érték. */
  desired: string;
  requiresAdmin: boolean;
  risk: 'safe' | 'moderate';
  labels: Record<string, string>;
  openSettingsUri?: string;
}

const DEFINITIONS: PrivacyDefinition[] = [
  {
    id: 'telemetry-level',
    name: 'Telemetria minimalizálása',
    description:
      'A diagnosztikai adatküldést a legalacsonyabb, a kiadásod által támogatott szintre állítja (Security/Basic). A biztonsági frissítések továbbra is működnek.',
    technicalDetails: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection\\AllowTelemetry = 0',
    recommendedState: 'Minimális',
    key: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    value: 'AllowTelemetry',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: true,
    risk: 'safe',
    labels: { '0': 'Security (minimális)', '1': 'Basic', '2': 'Enhanced', '3': 'Full' },
  },
  {
    id: 'advertising-id',
    name: 'Hirdetési azonosító kikapcsolása',
    description: 'Megakadályozza, hogy az appok egy egyedi hirdetési ID-val kövessenek a személyre szabott reklámokhoz.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo\\Enabled = 0',
    recommendedState: 'Kikapcsolva',
    key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
    value: 'Enabled',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: false,
    risk: 'safe',
    labels: { '0': 'Kikapcsolva', '1': 'Bekapcsolva' },
  },
  {
    id: 'activity-history',
    name: 'Tevékenységelőzmények küldésének letiltása',
    description: 'A Windows nem küldi el a Microsoftnak a tevékenységelőzményeket (Timeline). Helyben minden működik.',
    technicalDetails: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System\\UploadUserActivities = 0',
    recommendedState: 'Letiltva',
    key: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
    value: 'UploadUserActivities',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: true,
    risk: 'safe',
    labels: { '0': 'Letiltva', '1': 'Engedélyezve' },
  },
  {
    id: 'diagnostic-data-tailored',
    name: 'Személyre szabott élmények kikapcsolása',
    description: 'A diagnosztikai adatok alapján megjelenő tippek, hirdetések és ajánlások kikapcsolása.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy\\TailoredExperiencesWithDiagnosticDataEnabled = 0',
    recommendedState: 'Kikapcsolva',
    key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy',
    value: 'TailoredExperiencesWithDiagnosticDataEnabled',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: false,
    risk: 'safe',
    labels: { '0': 'Kikapcsolva', '1': 'Bekapcsolva' },
  },
  {
    id: 'feedback-frequency',
    name: 'Visszajelzés-kérések kikapcsolása',
    description: 'A Windows nem kér időnként visszajelzést. Semmilyen funkcióra nincs hatással.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\Siuf\\Rules\\NumberOfSIUFInPeriod = 0',
    recommendedState: 'Soha',
    key: 'HKCU:\\Software\\Microsoft\\Siuf\\Rules',
    value: 'NumberOfSIUFInPeriod',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: false,
    risk: 'safe',
    labels: { '0': 'Soha' },
  },
  {
    id: 'app-launch-tracking',
    name: 'Alkalmazásindítás-követés kikapcsolása',
    description: 'A Start menü nem követi, mely appokat indítod a találatok rangsorolásához.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\Start_TrackProgs = 0',
    recommendedState: 'Kikapcsolva',
    key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
    value: 'Start_TrackProgs',
    onValue: 0,
    type: 'DWord',
    desired: '0',
    requiresAdmin: false,
    risk: 'safe',
    labels: { '0': 'Kikapcsolva', '1': 'Bekapcsolva' },
  },
  {
    id: 'typing-personalization',
    name: 'Gépelési és kézírás-adatok gyűjtésének letiltása',
    description: 'A Windows nem gyűjt gépelési mintákat a szótár személyre szabásához.',
    technicalDetails: 'HKCU\\Software\\Microsoft\\InputPersonalization\\RestrictImplicitTextCollection = 1',
    recommendedState: 'Letiltva',
    key: 'HKCU:\\Software\\Microsoft\\InputPersonalization',
    value: 'RestrictImplicitTextCollection',
    onValue: 1,
    type: 'DWord',
    desired: '1',
    requiresAdmin: false,
    risk: 'safe',
    labels: { '1': 'Letiltva', '0': 'Engedélyezve' },
  },
  {
    id: 'location-access',
    name: 'Helyadat-hozzáférés',
    description:
      'A helyadat-engedélyek appokra lebontva a Windows Beállításokban kezelhetők. Ezt a rendszerszintű kapcsolót szándékosan nem írjuk felül automatikusan, mert pl. a „Find my device” is függhet tőle.',
    technicalDetails: 'Csak olvasás: HKCU\\...\\CapabilityAccessManager\\ConsentStore\\location\\Value. A módosítás a Beállításokban történik.',
    recommendedState: 'Felhasználói döntés',
    key: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location',
    value: 'Value',
    onValue: 'Deny',
    type: 'String',
    desired: 'Deny',
    requiresAdmin: false,
    risk: 'moderate',
    labels: { Allow: 'Engedélyezve', Deny: 'Letiltva' },
    openSettingsUri: 'ms-settings:privacy-location',
  },
];

function findDef(id: PrivacyTweakId): PrivacyDefinition {
  const def = DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Ismeretlen adatvédelmi beállítás: ${id}`);
  return def;
}

export async function listPrivacyTweaks(): Promise<PrivacyTweak[]> {
  if (!IS_WINDOWS) return [];
  return Promise.all(
    DEFINITIONS.map(async (def): Promise<PrivacyTweak> => {
      const base: PrivacyTweak = {
        id: def.id,
        category: 'privacy',
        name: def.name,
        description: def.description,
        technicalDetails: def.technicalDetails,
        currentState: 'Alapértelmezett',
        recommendedState: def.recommendedState,
        applied: false,
        risk: def.risk,
        requiresAdmin: def.requiresAdmin,
        reversible: true,
        openSettingsUri: def.openSettingsUri,
      };
      try {
        const raw = await readValue(def.key, def.value);
        return {
          ...base,
          currentState: raw == null ? 'Alapértelmezett (nincs beállítva)' : (def.labels[raw] ?? raw),
          applied: raw === def.desired,
        };
      } catch (err) {
        return { ...base, error: (err as Error).message };
      }
    }),
  );
}

async function refresh(id: PrivacyTweakId): Promise<PrivacyTweak> {
  return (await listPrivacyTweaks()).find((t) => t.id === id)!;
}

export async function applyPrivacyTweak(id: PrivacyTweakId): Promise<PrivacyTweak> {
  const def = findDef(id);
  if (def.openSettingsUri) {
    throw new Error(
      'Ez a beállítás biztonsági okból csak a Windows Beállításokban módosítható. Nyisd meg a „Beállítások megnyitása” gombbal.',
    );
  }
  if (def.requiresAdmin && !(await isElevated())) {
    throw new Error(`A(z) „${def.name}” beállításhoz rendszergazdai jogosultság szükséges.`);
  }

  const before = await readValue(def.key, def.value);
  backups.create({
    kind: 'settings',
    label: def.name,
    description: `Eredeti érték: ${before ?? '(nincs beállítva)'} → ${def.desired}`,
    payload: { privacyId: id, previous: before, key: def.key, value: def.value, type: def.type },
  });

  try {
    await writeValue(def.key, def.value, def.onValue, def.type);
    logger.record({
      area: 'Privacy',
      action: `Alkalmazva: ${def.name}`,
      oldValue: before ?? '(nincs beállítva)',
      newValue: String(def.onValue),
      success: true,
    });
    return refresh(id);
  } catch (err) {
    logger.record({
      area: 'Privacy',
      action: `Alkalmazva: ${def.name}`,
      oldValue: before ?? '(nincs beállítva)',
      newValue: String(def.onValue),
      success: false,
      message: (err as Error).message,
    });
    throw err;
  }
}

export async function undoPrivacyTweak(id: PrivacyTweakId): Promise<PrivacyTweak> {
  const def = findDef(id);
  const entry = backups.list().find((b) => b.payload?.privacyId === id && !b.restored);
  const previous = entry?.payload?.previous as string | null | undefined;

  if (previous == null) await deleteValue(def.key, def.value);
  else await writeValue(def.key, def.value, def.type === 'DWord' ? Number(previous) : previous, def.type);

  if (entry) backups.update(entry.id, { restored: true, restorable: false });
  logger.record({
    area: 'Privacy',
    action: `Visszavonva: ${def.name}`,
    oldValue: String(def.onValue),
    newValue: previous ?? '(érték törölve)',
    success: true,
  });
  return refresh(id);
}

/** ms-settings: URI megnyitása – az app-, hely- és kameraengedélyekhez. */
export async function openWindowsSettings(uri: string): Promise<boolean> {
  if (!/^ms-settings:[a-z0-9-]+$/i.test(uri)) throw new Error('Érvénytelen Beállítások URI.');
  await shell.openExternal(uri);
  logger.record({ area: 'Privacy', action: `Windows Beállítások megnyitása: ${uri}`, success: true, oldValue: null, newValue: null });
  return true;
}

backups.registerHandler('settings', async (entry) => {
  const key = entry.payload?.key as string | undefined;
  const value = entry.payload?.value as string | undefined;
  if (!key || !value) throw new Error('Hiányos backup bejegyzés.');
  const previous = entry.payload?.previous as string | null;
  const type = (entry.payload?.type as 'DWord' | 'String') ?? 'DWord';
  if (previous == null) await deleteValue(key, value);
  else await writeValue(key, value, type === 'DWord' ? Number(previous) : previous, type);
});
