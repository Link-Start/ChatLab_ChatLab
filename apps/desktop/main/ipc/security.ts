import { ipcMain } from 'electron'
import type { IpcContext } from './types'
import {
  changePassword,
  getLockConfig,
  getLockState,
  lockApp,
  resetAppLockPassword,
  setPassword,
  unlockApp,
  updateLockConfig,
} from '../security/lock-manager'

export function registerSecurityHandlers(_ctx: IpcContext): void {
  ipcMain.handle('app-lock:getConfig', getLockConfig)
  ipcMain.handle('app-lock:getState', getLockState)
  ipcMain.handle('app-lock:lock', lockApp)
  ipcMain.handle('app-lock:unlock', (_event, password: unknown) => unlockApp(password))
  ipcMain.handle('app-lock:setPassword', (_event, password: unknown) => setPassword(password))
  ipcMain.handle('app-lock:changePassword', (_event, oldPassword: unknown, newPassword: unknown) =>
    changePassword(oldPassword, newPassword)
  )
  ipcMain.handle('app-lock:resetPassword', resetAppLockPassword)
  ipcMain.handle('app-lock:updateConfig', (_event, updates: unknown) => updateLockConfig(updates))
}
