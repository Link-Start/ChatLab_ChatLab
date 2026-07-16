import { ipcRenderer } from 'electron'
import type { SecurityApi } from '../../shared/types'

export const securityApi: SecurityApi = {
  getConfig: () => ipcRenderer.invoke('app-lock:getConfig'),
  getState: () => ipcRenderer.invoke('app-lock:getState'),
  lock: () => ipcRenderer.invoke('app-lock:lock'),
  unlock: (password) => ipcRenderer.invoke('app-lock:unlock', password),
  setPassword: (password) => ipcRenderer.invoke('app-lock:setPassword', password),
  changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('app-lock:changePassword', oldPassword, newPassword),
  resetPassword: () => ipcRenderer.invoke('app-lock:resetPassword'),
  updateConfig: (updates) => ipcRenderer.invoke('app-lock:updateConfig', updates),
  onLockStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, locked: boolean) => callback(locked)
    ipcRenderer.on('app-lock-state-changed', handler)
    return () => ipcRenderer.removeListener('app-lock-state-changed', handler)
  },
}
