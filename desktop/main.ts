import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createMainWindow } from './window.ts';

const url = process.env.APP_URL ?? 'http://localhost:5173';
const preload = join(import.meta.dirname, 'preload.cjs');

app.whenReady().then(() => {
  createMainWindow({ url, preload });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ url, preload });
  });
});

app.on('window-all-closed', () => app.quit());
