import { randomUUID } from 'node:crypto';
import type { BackupEntry, BackupKind, RestorePoint } from '../../shared/types';
import { IS_WINDOWS, isElevated, runPowerShell, runPowerShellJson, toArray } from './shell';
import { JsonStore } from './store';
import { logger } from './logger';

interface BackupFile {
  entries: BackupEntry[];
}

type RestoreHandler = (entry: BackupEntry) => Promise<void>;

/**
 * Backup nyilvántartás. Minden rendszerbeállítást módosító művelet előtt
 * rögzítjük az eredeti értéket, hogy a Restore Centerből visszaállítható legyen.
 */
class BackupRegistry {
  private store = new JsonStore<BackupFile>('backups.json', { entries: [] });
  private handlers = new Map<BackupKind, RestoreHandler>();

  registerHandler(kind: BackupKind, handler: RestoreHandler): void {
    this.handlers.set(kind, handler);
  }

  create(input: { kind: BackupKind; label: string; description: string; payload: Record<string, unknown> }): BackupEntry {
    const entry: BackupEntry = {
      id: randomUUID(),
      kind: input.kind,
      label: input.label,
      description: input.description,
      createdAt: new Date().toISOString(),
      restorable: true,
      restored: false,
      payload: input.payload,
    };
    this.store.replace({ entries: [entry, ...this.store.get().entries].slice(0, 1000) });
    return entry;
  }

  list(): BackupEntry[] {
    return this.store.get().entries;
  }

  find(id: string): BackupEntry | undefined {
    return this.list().find((e) => e.id === id);
  }

  update(id: string, patch: Partial<BackupEntry>): BackupEntry | undefined {
    const entries = this.list().map((e) => (e.id === id ? { ...e, ...patch } : e));
    this.store.replace({ entries });
    return entries.find((e) => e.id === id);
  }

  delete(id: string): boolean {
    const entries = this.list().filter((e) => e.id !== id);
    this.store.replace({ entries });
    return true;
  }

  async restore(id: string): Promise<BackupEntry> {
    const entry = this.find(id);
    if (!entry) throw new Error('A visszaállítási bejegyzés nem található.');
    if (!entry.restorable || entry.restored) throw new Error('Ez a bejegyzés már nem állítható vissza.');
    const handler = this.handlers.get(entry.kind);
    if (!handler) throw new Error(`Ehhez a típushoz (${entry.kind}) nincs visszaállító kezelő.`);

    try {
      await handler(entry);
      logger.record({
        area: 'Restore Center',
        action: `Visszaállítás: ${entry.label}`,
        oldValue: entry.description,
        newValue: 'Eredeti érték visszaállítva',
        success: true,
      });
      return this.update(id, { restored: true, restorable: false })!;
    } catch (err) {
      logger.record({
        area: 'Restore Center',
        action: `Visszaállítás: ${entry.label}`,
        oldValue: entry.description,
        newValue: null,
        success: false,
        message: (err as Error).message,
      });
      throw err;
    }
  }
}

export const backups = new BackupRegistry();

/* ------------------------- Windows System Restore ------------------------- */

export async function listRestorePoints(): Promise<RestorePoint[]> {
  if (!IS_WINDOWS) return [];
  try {
    const raw = await runPowerShellJson<any>(
      `Get-ComputerRestorePoint -ErrorAction SilentlyContinue |
       Select-Object SequenceNumber, Description, CreationTime, RestorePointType`,
      [],
      { timeoutMs: 40_000 },
    );
    return toArray(raw).map((r: any) => ({
      sequenceNumber: Number(r?.SequenceNumber) || 0,
      description: String(r?.Description ?? ''),
      creationTime: r?.CreationTime ? new Date(r.CreationTime).toISOString() : '',
      type: String(r?.RestorePointType ?? ''),
    }));
  } catch {
    return [];
  }
}

/**
 * Rendszer-visszaállítási pont létrehozása. Admin jog szükséges, és a System Protection
 * funkciónak engedélyezve kell lennie – ha nem, érthető hibaüzenetet adunk vissza.
 */
export async function createRestorePoint(description: string): Promise<boolean> {
  if (!IS_WINDOWS) throw new Error('Rendszer-visszaállítási pont csak Windows rendszeren hozható létre.');
  if (!(await isElevated())) {
    throw new Error('A visszaállítási pont létrehozásához rendszergazdai jogosultság szükséges.');
  }
  try {
    // A Windows alapból 24 óránként engedélyez egy restore pontot; ezt ideiglenesen feloldjuk.
    await runPowerShell(
      `try {
         New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' ` +
        `-Name 'SystemRestorePointCreationFrequency' -Value 0 -PropertyType DWord -Force | Out-Null
       } catch {}
       Checkpoint-Computer -Description '${description.replace(/'/g, "''")}' -RestorePointType 'MODIFY_SETTINGS'`,
      { timeoutMs: 180_000 },
    );
    logger.record({
      area: 'Restore Center',
      action: 'Rendszer-visszaállítási pont létrehozása',
      oldValue: null,
      newValue: description,
      success: true,
    });
    return true;
  } catch (err) {
    const message = (err as Error).message;
    logger.record({
      area: 'Restore Center',
      action: 'Rendszer-visszaállítási pont létrehozása',
      oldValue: null,
      newValue: description,
      success: false,
      message,
    });
    throw new Error(
      `Nem sikerült visszaállítási pontot létrehozni. Ellenőrizd, hogy a Rendszervédelem be van-e kapcsolva a C: meghajtón. (${message})`,
    );
  }
}
