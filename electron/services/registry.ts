import { runPowerShell } from './shell';

export type RegType = 'DWord' | 'String' | 'ExpandString' | 'QWord' | 'Binary';

function esc(v: string): string {
  return v.replace(/'/g, "''");
}

/**
 * Registry olvasás. Ha a kulcs vagy érték nem létezik, null-t ad vissza (nem dob hibát).
 * Ez fontos, mert sok tweak kulcs alapból hiányzik a rendszerből.
 */
export async function readValue(keyPath: string, name: string): Promise<string | null> {
  const out = await runPowerShell(
    `$ErrorActionPreference='SilentlyContinue'
     if (Test-Path '${esc(keyPath)}') {
       $p = Get-ItemProperty -Path '${esc(keyPath)}' -Name '${esc(name)}' -ErrorAction SilentlyContinue
       if ($null -ne $p -and $null -ne $p.'${esc(name)}') { Write-Output ([string]$p.'${esc(name)}') }
     }`,
    { timeoutMs: 12_000 },
  );
  const text = out.trim();
  return text.length ? text : null;
}

/** Registry írás, a kulcs létrehozásával, ha szükséges. */
export async function writeValue(keyPath: string, name: string, value: string | number, type: RegType = 'DWord'): Promise<void> {
  const literal = typeof value === 'number' ? String(value) : `'${esc(String(value))}'`;
  await runPowerShell(
    `if (-not (Test-Path '${esc(keyPath)}')) { New-Item -Path '${esc(keyPath)}' -Force | Out-Null }
     New-ItemProperty -Path '${esc(keyPath)}' -Name '${esc(name)}' -Value ${literal} -PropertyType ${type} -Force | Out-Null`,
    { timeoutMs: 15_000 },
  );
}

/** Registry érték törlése (visszaállításkor, ha eredetileg nem létezett). */
export async function deleteValue(keyPath: string, name: string): Promise<void> {
  await runPowerShell(
    `if (Test-Path '${esc(keyPath)}') {
       Remove-ItemProperty -Path '${esc(keyPath)}' -Name '${esc(name)}' -Force -ErrorAction SilentlyContinue
     }`,
    { timeoutMs: 12_000 },
  );
}

/** Kulcs exportálása .reg fájlba – biztonsági mentéshez. */
export async function exportKey(keyPath: string, destination: string): Promise<boolean> {
  const regPath = keyPath
    .replace(/^HKLM:\\?/i, 'HKEY_LOCAL_MACHINE\\')
    .replace(/^HKCU:\\?/i, 'HKEY_CURRENT_USER\\');
  try {
    await runPowerShell(
      `& reg.exe export "${regPath.replace(/"/g, '')}" "${destination.replace(/"/g, '')}" /y | Out-Null`,
      { timeoutMs: 20_000 },
    );
    return true;
  } catch {
    return false;
  }
}
