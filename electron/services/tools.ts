import path from 'node:path';
import { shell } from 'electron';
import type { ToolDefinition, ToolId } from '../../shared/types';
import { IS_WINDOWS, isElevated, launchDetached } from './shell';
import { logger } from './logger';

const SYS32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

interface ToolSpec extends ToolDefinition {
  exec: { file: string; args?: string[] } | { uri: string };
}

const TOOLS: ToolSpec[] = [
  {
    id: 'disk-cleanup',
    name: 'Disk Cleanup',
    description: 'A Windows beépített lemezkarbantartója (cleanmgr.exe).',
    icon: 'broom',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'cleanmgr.exe') },
  },
  {
    id: 'task-manager',
    name: 'Task Manager',
    description: 'Folyamatok, teljesítmény és indítási appok kezelése.',
    icon: 'activity',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'taskmgr.exe') },
  },
  {
    id: 'device-manager',
    name: 'Device Manager',
    description: 'Hardvereszközök és illesztőprogramok kezelése.',
    icon: 'cpu',
    requiresAdmin: true,
    exec: { file: path.join(SYS32, 'mmc.exe'), args: [path.join(SYS32, 'devmgmt.msc')] },
  },
  {
    id: 'services',
    name: 'Services',
    description: 'Windows szolgáltatások indítása, leállítása, konfigurálása.',
    icon: 'server',
    requiresAdmin: true,
    exec: { file: path.join(SYS32, 'mmc.exe'), args: [path.join(SYS32, 'services.msc')] },
  },
  {
    id: 'event-viewer',
    name: 'Event Viewer',
    description: 'Rendszer- és alkalmazásnaplók megtekintése.',
    icon: 'list',
    requiresAdmin: true,
    exec: { file: path.join(SYS32, 'mmc.exe'), args: [path.join(SYS32, 'eventvwr.msc')] },
  },
  {
    id: 'system-information',
    name: 'System Information',
    description: 'Részletes hardver- és szoftverleltár (msinfo32).',
    icon: 'info',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'msinfo32.exe') },
  },
  {
    id: 'resource-monitor',
    name: 'Resource Monitor',
    description: 'Valós idejű CPU, memória, lemez és hálózati erőforrás-figyelő.',
    icon: 'gauge',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'perfmon.exe'), args: ['/res'] },
  },
  {
    id: 'defragment',
    name: 'Drive Optimization',
    description: 'Meghajtók optimalizálása / töredezettségmentesítése (dfrgui).',
    icon: 'disc',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'dfrgui.exe') },
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    description: 'Klasszikus parancssor megnyitása.',
    icon: 'terminal',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'cmd.exe') },
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    description: 'Windows PowerShell konzol megnyitása.',
    icon: 'terminal-square',
    requiresAdmin: false,
    exec: { file: path.join(SYS32, 'WindowsPowerShell', 'v1.0', 'powershell.exe') },
  },
  {
    id: 'registry-editor',
    name: 'Registry Editor',
    description: 'Rendszerleíró adatbázis szerkesztője. Csak tapasztalt felhasználóknak!',
    icon: 'database',
    requiresAdmin: true,
    exec: { file: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'regedit.exe') },
  },
  {
    id: 'windows-update',
    name: 'Windows Update',
    description: 'A Windows Update oldal megnyitása a Beállításokban.',
    icon: 'refresh',
    requiresAdmin: false,
    exec: { uri: 'ms-settings:windowsupdate' },
  },
];

export function listTools(): ToolDefinition[] {
  return TOOLS.map(({ exec, ...rest }) => rest);
}

/**
 * Natív Windows eszköz indítása. Az admin jogot igénylő eszközöket UAC promptot
 * kiváltó `RunAs`-szal indítjuk, ha az app maga nem emelt szintű.
 */
export async function launchTool(id: ToolId): Promise<boolean> {
  if (!IS_WINDOWS) throw new Error('Ezek az eszközök csak Windows rendszeren érhetők el.');
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error('Ismeretlen eszköz.');

  try {
    if ('uri' in tool.exec) {
      await shell.openExternal(tool.exec.uri);
    } else {
      const elevated = tool.requiresAdmin && !(await isElevated());
      await launchDetached(tool.exec.file, tool.exec.args ?? [], elevated);
    }
    logger.record({ area: 'Tools', action: `Indítva: ${tool.name}`, oldValue: null, newValue: null, success: true });
    return true;
  } catch (err) {
    const message = (err as Error).message;
    logger.record({ area: 'Tools', action: `Indítva: ${tool.name}`, oldValue: null, newValue: null, success: false, message });
    throw new Error(`Nem sikerült elindítani: ${tool.name}. ${message}`);
  }
}
