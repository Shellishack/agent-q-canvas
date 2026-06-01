import { app, BrowserWindow, ipcMain } from 'electron';
import isDev from 'electron-is-dev';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

type AgentRuntime = {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  process: ChildProcessWithoutNullStreams;
};

const runtimes = new Map<string, AgentRuntime>();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: 'Agent Q Canvas',
    backgroundColor: '#101214',
    webPreferences: {
      preload: path.join(app.getAppPath(), isDev ? 'dist-electron/preload.js' : 'dist-electron/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:6060');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  for (const runtime of runtimes.values()) {
    runtime.process.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('agent:list-runtimes', () =>
  Array.from(runtimes.values()).map(({ id, command, args, cwd }) => ({ id, command, args, cwd }))
);

ipcMain.handle(
  'agent:start',
  async (_event, input: { id: string; command: string; args?: string[]; cwd?: string }) => {
    if (runtimes.has(input.id)) {
      return { ok: false, error: `Agent ${input.id} is already running.` };
    }

    const cwd = input.cwd?.trim() || app.getPath('home');
    const child = spawn(input.command, input.args ?? [], {
      cwd,
      shell: process.platform === 'win32',
      env: process.env
    });

    const runtime: AgentRuntime = {
      id: input.id,
      command: input.command,
      args: input.args ?? [],
      cwd,
      process: child
    };

    runtimes.set(input.id, runtime);

    child.stdout.on('data', (chunk: Buffer) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('agent:output', { id: input.id, stream: 'stdout', text: chunk.toString() });
      });
    });

    child.stderr.on('data', (chunk: Buffer) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('agent:output', { id: input.id, stream: 'stderr', text: chunk.toString() });
      });
    });

    child.on('exit', (code) => {
      runtimes.delete(input.id);
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('agent:exit', { id: input.id, code });
      });
    });

    return { ok: true };
  }
);

ipcMain.handle('agent:send', async (_event, input: { id: string; text: string }) => {
  const runtime = runtimes.get(input.id);
  if (!runtime) {
    return { ok: false, error: `Agent ${input.id} is not running.` };
  }

  runtime.process.stdin.write(input.text);
  if (!input.text.endsWith('\n')) {
    runtime.process.stdin.write('\n');
  }

  return { ok: true };
});

ipcMain.handle('agent:stop', async (_event, input: { id: string }) => {
  const runtime = runtimes.get(input.id);
  if (!runtime) {
    return { ok: false, error: `Agent ${input.id} is not running.` };
  }

  runtime.process.kill();
  runtimes.delete(input.id);
  return { ok: true };
});
