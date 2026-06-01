import { contextBridge, ipcRenderer } from 'electron';

const agent = {
  start: (input: { id: string; command: string; args?: string[]; cwd?: string }) =>
    ipcRenderer.invoke('agent:start', input),
  send: (input: { id: string; text: string }) => ipcRenderer.invoke('agent:send', input),
  stop: (input: { id: string }) => ipcRenderer.invoke('agent:stop', input),
  listRuntimes: () => ipcRenderer.invoke('agent:list-runtimes'),
  onOutput: (callback: (event: { id: string; stream: 'stdout' | 'stderr'; text: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; stream: 'stdout' | 'stderr'; text: string }) =>
      callback(payload);
    ipcRenderer.on('agent:output', listener);
    return () => ipcRenderer.off('agent:output', listener);
  },
  onExit: (callback: (event: { id: string; code: number | null }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { id: string; code: number | null }) => callback(payload);
    ipcRenderer.on('agent:exit', listener);
    return () => ipcRenderer.off('agent:exit', listener);
  }
};

contextBridge.exposeInMainWorld('agentQ', { agent });
