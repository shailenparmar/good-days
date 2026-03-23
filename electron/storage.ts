import { ipcMain, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { IPC } from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getEntriesDir(): string {
  return path.join(app.getPath('userData'), 'entries');
}

function entryPath(date: string): string {
  return path.join(getEntriesDir(), `${date}.json`);
}

// Cache: only mkdir once per session, not on every save
let dirEnsured = false;
async function ensureDir(): Promise<void> {
  if (dirEnsured) return;
  await fs.mkdir(getEntriesDir(), { recursive: true });
  dirEnsured = true;
}

export function registerStorageHandlers(): void {
  ipcMain.handle(IPC.STORAGE_SAVE, async (_event, date: string, data: string) => {
    if (!DATE_RE.test(date)) throw new Error(`Invalid date format: ${date}`);
    await ensureDir();
    const target = entryPath(date);
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, data, 'utf-8');
    await fs.rename(tmp, target);
  });

  ipcMain.handle(IPC.STORAGE_LOAD, async (_event, date: string) => {
    if (!DATE_RE.test(date)) throw new Error(`Invalid date format: ${date}`);
    try {
      return await fs.readFile(entryPath(date), 'utf-8');
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.STORAGE_LOAD_ALL, async () => {
    const dir = getEntriesDir();
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const entries: Array<{ date: string; data: string }> = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const date = file.replace('.json', '');
      if (!DATE_RE.test(date)) continue;
      const data = await fs.readFile(path.join(dir, file), 'utf-8');
      entries.push({ date, data });
    }
    return entries;
  });

  ipcMain.handle(IPC.STORAGE_DELETE, async (_event, date: string) => {
    if (!DATE_RE.test(date)) throw new Error(`Invalid date format: ${date}`);
    try {
      await fs.unlink(entryPath(date));
      return true;
    } catch {
      return false;
    }
  });
}
