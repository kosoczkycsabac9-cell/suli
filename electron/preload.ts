import { contextBridge, ipcRenderer } from 'electron';
import type { OptimizerApi, ScanStepResult } from '../shared/types';

/**
 * Biztonságos bridge a renderer felé. A renderer SOHA nem kap közvetlen Node/Electron
 * hozzáférést – csak ezt a szigorúan tipizált, whitelistelt felületet.
 */
const api: OptimizerApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:info'),
    relaunchAsAdmin: () => ipcRenderer.invoke('app:relaunchAsAdmin'),
    minimize: () => ipcRenderer.send('app:minimize'),
    maximizeToggle: () => ipcRenderer.send('app:maximizeToggle'),
    close: () => ipcRenderer.send('app:close'),
  },
  system: {
    snapshot: () => ipcRenderer.invoke('system:snapshot'),
  },
  scan: {
    run: () => ipcRenderer.invoke('scan:run'),
    onProgress: (cb: (step: ScanStepResult) => void) => {
      const listener = (_e: unknown, step: ScanStepResult) => cb(step);
      ipcRenderer.on('scan:progress', listener);
      return () => ipcRenderer.removeListener('scan:progress', listener);
    },
  },
  cleaner: {
    analyze: (categories) => ipcRenderer.invoke('cleaner:analyze', categories),
    clean: (categories) => ipcRenderer.invoke('cleaner:clean', categories),
  },
  startup: {
    list: () => ipcRenderer.invoke('startup:list'),
    setEnabled: (id, enabled) => ipcRenderer.invoke('startup:setEnabled', id, enabled),
  },
  performance: {
    list: () => ipcRenderer.invoke('performance:list'),
    apply: (id) => ipcRenderer.invoke('performance:apply', id),
    undo: (id) => ipcRenderer.invoke('performance:undo', id),
  },
  network: {
    state: () => ipcRenderer.invoke('network:state'),
    runAction: (action, adapterName) => ipcRenderer.invoke('network:action', action, adapterName),
  },
  privacy: {
    list: () => ipcRenderer.invoke('privacy:list'),
    apply: (id) => ipcRenderer.invoke('privacy:apply', id),
    undo: (id) => ipcRenderer.invoke('privacy:undo', id),
    openSettings: (uri) => ipcRenderer.invoke('privacy:openSettings', uri),
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    launch: (id) => ipcRenderer.invoke('tools:launch', id),
  },
  restore: {
    listRestorePoints: () => ipcRenderer.invoke('restore:listPoints'),
    createRestorePoint: (description) => ipcRenderer.invoke('restore:createPoint', description),
    listBackups: () => ipcRenderer.invoke('restore:listBackups'),
    restoreBackup: (id) => ipcRenderer.invoke('restore:restoreBackup', id),
    deleteBackup: (id) => ipcRenderer.invoke('restore:deleteBackup', id),
  },
  logs: {
    list: (limit) => ipcRenderer.invoke('logs:list', limit),
    clear: () => ipcRenderer.invoke('logs:clear'),
    export: () => ipcRenderer.invoke('logs:export'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
};

contextBridge.exposeInMainWorld('optimizer', api);
