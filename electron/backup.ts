import { ipcMain, dialog, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { IPC } from './types';

export function registerBackupHandlers(): void {
  ipcMain.handle(IPC.BACKUP_SAVE, async (_event, content: string, defaultFilename: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), defaultFilename),
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle(IPC.BACKUP_IMPORT, async () => {
    const result = await dialog.showOpenDialog({
      defaultPath: app.getPath('downloads'),
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return await fs.readFile(result.filePaths[0], 'utf-8');
  });
}
