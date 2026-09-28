import path from 'node:path';
import type { StartupImpact, StartupItem, StartupLocation } from '../../shared/types';
import { IS_WINDOWS, runPowerShellJson, runPowerShell, toArray } from './shell';
import { logger } from './logger';
import { backups } from './restore';

/**
 * Windows rendszerfolyamatok, amelyeket SOHA nem tiltunk le.
 * Ezek letiltása instabilitást vagy funkcióvesztést okozna.
 */
const SYSTEM_CRITICAL = [
  'securityhealth',
  'windowsdefender',
  'msmpeng',
  'windows security',
  'onedrive setup',
  'ctfmon',
  'igfxtray',
  'rtkaudservice',
  'realtek audio',
  'synaptics',
  'nvdisplay.container',
  'audiodg',
  'sihost',
  'smartaudio',
  'dell support',
  'lenovo vantage service',
  'bitlocker',
  'eset',
  'kaspersky',
  'avast',
  'avg ',
  'bitdefender',
  'norton',
  'malwarebytes',
  'sophos',
  'trend micro',
];

function isSystemCritical(name: string, command: string): boolean {
  const hay = `${name} ${command}`.toLowerCase();
  if (hay.includes('\\windows\\system32\\')) return true;
  return SYSTEM_CRITICAL.some((k) => hay.includes(k));
}

/** Egyszerű heurisztika a startup impact becslésére, ha a Windows nem ad adatot. */
function estimateImpact(raw: unknown, command: string): StartupImpact {
  if (typeof raw === 'number') {
    if (raw === 0) return 'none';
    if (raw < 300) return 'low';
    if (raw < 1000) return 'medium';
    return 'high';
  }
  const c = command.toLowerCase();
  if (/(update|updater|helper|tray|notifier)/.test(c)) return 'low';
  if (/(teams|discord|steam|epic|spotify|adobe|skype|zoom|dropbox|slack)/.test(c)) return 'high';
  return 'unknown';
}

const PS_LIST = String.raw`
$results = New-Object System.Collections.ArrayList

function Add-Item($name, $command, $location, $enabled, $impactRaw) {
  [void]$results.Add([pscustomobject]@{
    Name = $name; Command = $command; Location = $location; Enabled = $enabled; ImpactRaw = $impactRaw
  })
}

$runKeys = @(
  @{ Path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; Loc = 'HKCU:Run'; Approved = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; Loc = 'HKLM:Run'; Approved = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ Path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; Loc = 'HKLM:Run(WOW6432)'; Approved = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' }
)

foreach ($k in $runKeys) {
  if (-not (Test-Path $k.Path)) { continue }
  $props = Get-ItemProperty -Path $k.Path -ErrorAction SilentlyContinue
  $approved = $null
  if (Test-Path $k.Approved) { $approved = Get-ItemProperty -Path $k.Approved -ErrorAction SilentlyContinue }
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    $enabled = $true
    if ($approved -and $approved.PSObject.Properties[$p.Name]) {
      $bytes = $approved.$($p.Name)
      if ($bytes -and $bytes.Length -ge 1 -and ($bytes[0] -band 1) -ne 0) { $enabled = $false }
    }
    Add-Item $p.Name ([string]$p.Value) $k.Loc $enabled $null
  }
}

$folders = @(
  @{ Path = [Environment]::GetFolderPath('Startup'); Loc = 'StartupFolder(User)' },
  @{ Path = [Environment]::GetFolderPath('CommonStartup'); Loc = 'StartupFolder(Common)' }
)
foreach ($f in $folders) {
  if (-not (Test-Path $f.Path)) { continue }
  Get-ChildItem -Path $f.Path -File -ErrorAction SilentlyContinue | ForEach-Object {
    $enabled = $_.Extension -ne '.disabled'
    Add-Item $_.BaseName $_.FullName $f.Loc $enabled $null
  }
}

$results
`;

async function resolvePublishers(items: StartupItem[]): Promise<void> {
  if (!IS_WINDOWS) return;
  const paths = items.map((i) => i.executablePath).filter((p): p is string => !!p);
  if (!paths.length) return;
  const list = paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
  try {
    const raw = await runPowerShellJson<any>(
      `@(${list}) | ForEach-Object {
         $p = $_
         $company = ''
         try { if (Test-Path -LiteralPath $p) { $company = (Get-Item -LiteralPath $p).VersionInfo.CompanyName } } catch {}
         [pscustomobject]@{ Path = $p; Company = $company }
       }`,
      [],
      { timeoutMs: 25000 },
    );
    const map = new Map<string, string>();
    toArray(raw).forEach((r: any) => map.set(String(r.Path).toLowerCase(), String(r.Company ?? '').trim()));
    items.forEach((i) => {
      if (i.executablePath) i.publisher = map.get(i.executablePath.toLowerCase()) || 'Ismeretlen';
    });
  } catch {
    /* best-effort */
  }
}

function extractExecutable(command: string): string | null {
  const trimmed = command.trim();
  const quoted = trimmed.match(/^"([^"]+)"/);
  if (quoted) return quoted[1];
  const match = trimmed.match(/^([a-zA-Z]:\\[^\s]+?\.(?:exe|bat|cmd|lnk))/i);
  return match ? match[1] : null;
}

export async function listStartupItems(): Promise<StartupItem[]> {
  if (!IS_WINDOWS) return [];
  const raw = await runPowerShellJson<any>(PS_LIST, [], { timeoutMs: 30_000 });
  const items: StartupItem[] = toArray(raw).map((r: any) => {
    const name = String(r?.Name ?? '');
    const command = String(r?.Command ?? '');
    const location = String(r?.Location ?? 'HKCU:Run') as StartupLocation;
    return {
      id: `${location}::${name}`,
      name,
      publisher: 'Ismeretlen',
      command,
      executablePath: extractExecutable(command),
      location,
      enabled: r?.Enabled !== false,
      impact: estimateImpact(r?.ImpactRaw, command),
      isSystemCritical: isSystemCritical(name, command),
      requiresAdmin: location.startsWith('HKLM') || location === 'StartupFolder(Common)',
    } satisfies StartupItem;
  });
  await resolvePublishers(items);
  return items.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
}

/**
 * Engedélyezés/letiltás. A Run kulcsok esetén a StartupApproved bejegyzést módosítjuk,
 * így az eredeti parancs megmarad, és a Task Manager is szinkronban lesz.
 * A Startup mappában a .disabled kiterjesztés hozzáadásával/elvételével oldjuk meg.
 */
export async function setStartupEnabled(id: string, enabled: boolean): Promise<StartupItem> {
  const all = await listStartupItems();
  const item = all.find((i) => i.id === id);
  if (!item) throw new Error('A megadott indítási elem nem található.');
  if (item.isSystemCritical && !enabled) {
    throw new Error(
      'Ez az elem Windows rendszer- vagy biztonsági komponensként lett azonosítva, ezért az alkalmazás nem tiltja le.',
    );
  }

  backups.create({
    kind: 'startup',
    label: `Startup: ${item.name}`,
    description: `${item.name} indítási állapota: ${item.enabled ? 'engedélyezve' : 'letiltva'} → ${
      enabled ? 'engedélyezve' : 'letiltva'
    }`,
    payload: { id: item.id, previousEnabled: item.enabled, location: item.location, name: item.name },
  });

  try {
    if (item.location.startsWith('StartupFolder')) {
      const current = item.command;
      const target = enabled ? current.replace(/\.disabled$/i, '') : `${current}.disabled`;
      await runPowerShell(
        `Rename-Item -LiteralPath '${current.replace(/'/g, "''")}' -NewName '${path
          .basename(target)
          .replace(/'/g, "''")}' -Force`,
      );
    } else {
      const hive = item.location.startsWith('HKLM') ? 'HKLM' : 'HKCU';
      const approvedPath =
        item.location === 'HKLM:Run(WOW6432)'
          ? `HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32`
          : `${hive}:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run`;
      const value = enabled
        ? '([byte[]](2,0,0,0,0,0,0,0,0,0,0,0))'
        : '([byte[]](3,0,0,0,0,0,0,0,0,0,0,0))';
      await runPowerShell(
        `if (-not (Test-Path '${approvedPath}')) { New-Item -Path '${approvedPath}' -Force | Out-Null }
         Set-ItemProperty -Path '${approvedPath}' -Name '${item.name.replace(/'/g, "''")}' -Value ${value} -Type Binary -Force`,
      );
    }
    logger.record({
      area: 'Startup',
      action: `${enabled ? 'Engedélyezés' : 'Letiltás'}: ${item.name}`,
      oldValue: item.enabled ? 'Enabled' : 'Disabled',
      newValue: enabled ? 'Enabled' : 'Disabled',
      success: true,
    });
    return { ...item, enabled };
  } catch (err) {
    logger.record({
      area: 'Startup',
      action: `${enabled ? 'Engedélyezés' : 'Letiltás'}: ${item.name}`,
      oldValue: item.enabled ? 'Enabled' : 'Disabled',
      newValue: enabled ? 'Enabled' : 'Disabled',
      success: false,
      message: (err as Error).message,
    });
    throw err;
  }
}
