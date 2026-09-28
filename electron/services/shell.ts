import { execFile, spawn } from 'node:child_process';
import os from 'node:os';

export const IS_WINDOWS = process.platform === 'win32';

export class ShellError extends Error {
  constructor(message: string, public readonly stderr = '', public readonly code: number | null = null) {
    super(message);
    this.name = 'ShellError';
  }
}

const PS_EXE = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

interface RunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

/**
 * PowerShell script futtatása. A script mindig `-NoProfile -NonInteractive` módban fut,
 * ExecutionPolicy Bypass-szal (csak az adott folyamatra), így nem módosít rendszerbeállítást.
 */
export function runPowerShell(script: string, opts: RunOptions = {}): Promise<string> {
  if (!IS_WINDOWS) return Promise.reject(new ShellError('A művelet csak Windows rendszeren érhető el.'));
  const encoded = Buffer.from(
    `$ProgressPreference='SilentlyContinue';$ErrorActionPreference='Stop';${script}`,
    'utf16le',
  ).toString('base64');

  return new Promise((resolve, reject) => {
    execFile(
      PS_EXE,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: opts.timeoutMs ?? 30_000, maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new ShellError(stderr?.trim() || error.message, stderr ?? '', error.code == null ? null : Number(error.code)));
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}

/** PowerShell futtatása, ahol a kimenet JSON. Üres kimenet esetén a fallback jön vissza. */
export async function runPowerShellJson<T>(script: string, fallback: T, opts?: RunOptions): Promise<T> {
  const raw = await runPowerShell(`${script} | ConvertTo-Json -Depth 6 -Compress`, opts);
  const text = raw.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Natív Windows futtatható indítása (nem vár a befejezésre). */
export function launchDetached(command: string, args: string[] = [], elevated = false): Promise<void> {
  if (!IS_WINDOWS) return Promise.reject(new ShellError('A művelet csak Windows rendszeren érhető el.'));
  if (elevated) {
    const argList = args.length ? `-ArgumentList @(${args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})` : '';
    return runPowerShell(`Start-Process -FilePath '${command.replace(/'/g, "''")}' ${argList} -Verb RunAs`).then(() => undefined);
  }
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false });
      child.on('error', (err) => reject(new ShellError(err.message)));
      child.unref();
      resolve();
    } catch (err) {
      reject(new ShellError((err as Error).message));
    }
  });
}

/** Van-e adminisztrátori (emelt szintű) jogosultságunk. */
export async function isElevated(): Promise<boolean> {
  if (!IS_WINDOWS) return false;
  try {
    const out = await runPowerShell(
      "[bool](([System.Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator))",
      { timeoutMs: 8000 },
    );
    return out.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export const HOSTNAME = os.hostname();
