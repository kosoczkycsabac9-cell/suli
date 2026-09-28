import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, shell } from 'electron';
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types';
import { IS_WINDOWS, isElevated, runPowerShell } from './services/shell';
import { JsonStore } from './services/store';
import { logger } from './services/logger';
import { getSystemSnapshot } from './services/system';
import { analyze, clean } from './services/cleaner';
import { listStartupItems, setStartupEnabled } from './services/startup';
import { applyTweak, listTweaks, undoTweak } from './services/performance';
import { getNetworkState, runNetworkAction } from './services/network';
import { applyPrivacyTweak, listPrivacyTweaks, openWindowsSettings, undoPrivacyTweak } from './services/privacy';
import { launchTool, listTools } from './services/tools';
import { backups, createRestorePoint, listRestorePoints } from './services/restore';
import { runScan } from './services/scan';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: JsonStore<AppSettings>;
let isQuitting = false;

/* Egypéldányos futás – ne fusson feleslegesen több példány a háttérben. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0d12',
    title: 'WinOptimizer',
    frame: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  // Szigorú Content Security Policy – a renderer nem tölthet be külső kódot.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' data: ws: http://localhost:5173; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Külső linkek a rendszer böngészőjében nyílnak, nem az appban.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && settingsStore.get().minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'build', 'tray.png');
  const image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('WinOptimizer');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Megnyitás', click: () => mainWindow?.show() },
      { type: 'separator' },
      {
        label: 'Kilépés',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('double-click', () => mainWindow?.show());
}

/** Start with Windows – a hivatalos Electron API-n keresztül (HKCU Run kulcs). */
function applyAutoLaunch(enabled: boolean): void {
  if (!IS_WINDOWS) return;
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--autostart'] });
}

/* ------------------------------ IPC segédek ------------------------------ */

type Handler<T> = (...args: any[]) => Promise<T> | T;

/** Egységes hibakezelés: minden IPC hívás Result<T>-t ad vissza, sosem dob a rendererbe. */
function handle<T>(channel: string, fn: Handler<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      const data = await fn(...args);
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.record({ area: 'IPC', action: channel, oldValue: null, newValue: null, success: false, message, level: 'error' });
      return { ok: false, error: message };
    }
  });
}

function registerIpc(): void {
  /* App */
  handle('app:info', async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    isElevated: await isElevated(),
    isMock: false,
  }));

  handle('app:relaunchAsAdmin', async () => {
    if (!IS_WINDOWS) throw new Error('Csak Windows rendszeren támogatott.');
    if (await isElevated()) return true;
    await runPowerShell(`Start-Process -FilePath '${process.execPath.replace(/'/g, "''")}' -Verb RunAs`);
    isQuitting = true;
    setTimeout(() => app.quit(), 400);
    return true;
  });

  ipcMain.on('app:minimize', () => mainWindow?.minimize());
  ipcMain.on('app:maximizeToggle', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('app:close', () => mainWindow?.close());

  /* System */
  handle('system:snapshot', () => getSystemSnapshot());

  /* Scan */
  handle('scan:run', () =>
    runScan((step) => {
      if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('scan:progress', step);
    }),
  );

  /* Cleaner */
  handle('cleaner:analyze', (categories?: any) => analyze(categories));
  handle('cleaner:clean', (categories: any) => clean(categories ?? []));

  /* Startup */
  handle('startup:list', () => listStartupItems());
  handle('startup:setEnabled', (id: any, enabled: any) => setStartupEnabled(String(id), Boolean(enabled)));

  /* Performance */
  handle('performance:list', () => listTweaks());
  handle('performance:apply', async (id: any) => {
    await maybeCreateRestorePoint(`WinOptimizer – ${id}`);
    return applyTweak(id);
  });
  handle('performance:undo', (id: any) => undoTweak(id));

  /* Network */
  handle('network:state', () => getNetworkState());
  handle('network:action', (action: any, adapter?: any) => runNetworkAction(action, adapter));

  /* Privacy */
  handle('privacy:list', () => listPrivacyTweaks());
  handle('privacy:apply', async (id: any) => {
    await maybeCreateRestorePoint(`WinOptimizer – privacy: ${id}`);
    return applyPrivacyTweak(id);
  });
  handle('privacy:undo', (id: any) => undoPrivacyTweak(id));
  handle('privacy:openSettings', (uri: any) => openWindowsSettings(String(uri)));

  /* Tools */
  handle('tools:list', () => listTools());
  handle('tools:launch', (id: any) => launchTool(id));

  /* Restore */
  handle('restore:listPoints', () => listRestorePoints());
  handle('restore:createPoint', (description: any) => createRestorePoint(String(description || 'WinOptimizer')));
  handle('restore:listBackups', () => backups.list());
  handle('restore:restoreBackup', (id: any) => backups.restore(String(id)));
  handle('restore:deleteBackup', (id: any) => backups.delete(String(id)));

  /* Logs */
  handle('logs:list', (limit?: any) => logger.list(Number(limit) || 500));
  handle('logs:clear', () => {
    logger.clear();
    return true;
  });
  handle('logs:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Naplófájl exportálása',
      defaultPath: `winoptimizer-log-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    const content = result.filePath.endsWith('.json') ? JSON.stringify(logger.all(), null, 2) : logger.toCsv();
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { path: result.filePath };
  });

  /* Settings */
  handle('settings:get', () => settingsStore.get());
  handle('settings:set', (patch: any) => {
    const previous = settingsStore.get();
    const next = settingsStore.set(patch ?? {});
    if (previous.startWithWindows !== next.startWithWindows) applyAutoLaunch(next.startWithWindows);
    if (previous.minimizeToTray !== next.minimizeToTray) {
      if (next.minimizeToTray) createTray();
      else {
        tray?.destroy();
        tray = null;
      }
    }
    logger.setEnabled(next.loggingEnabled);
    logger.record({
      area: 'Settings',
      action: 'Beállítás módosítva',
      oldValue: JSON.stringify(Object.keys(patch ?? {}).reduce((a, k) => ({ ...a, [k]: (previous as any)[k] }), {})),
      newValue: JSON.stringify(patch ?? {}),
      success: true,
    });
    return next;
  });
}

/** Ha a beállítás kéri és van jogosultság, restore pointot készítünk a módosítás előtt. */
async function maybeCreateRestorePoint(description: string): Promise<void> {
  if (!settingsStore.get().createRestorePointBeforeOptimization) return;
  if (!IS_WINDOWS) return;
  try {
    if (await isElevated()) await createRestorePoint(description);
  } catch {
    // Nem blokkoljuk a műveletet – a felhasználó a Restore Centerben látja, hogy nem sikerült.
  }
}

app.whenReady().then(() => {
  settingsStore = new JsonStore<AppSettings>('settings.json', DEFAULT_SETTINGS);
  logger.setEnabled(settingsStore.get().loggingEnabled);
  registerIpc();
  createWindow();
  if (settingsStore.get().minimizeToTray) createTray();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
