'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const requestedMode = new URLSearchParams(window.location.search).get('mode');
const mode = ['pings','controls'].includes(requestedMode) ? requestedMode : 'rings';
contextBridge.exposeInMainWorld('ringPopup', Object.freeze({
  mode,
  painted: generation => { if (mode === 'controls') ipcRenderer.send('chat-rings:painted', generation); },
  onHover(callback) { const listener = (_e, id) => callback(id); ipcRenderer.on('chat-rings:hover', listener); return () => ipcRenderer.removeListener('chat-rings:hover', listener); },
  onState(callback) { const listener = (_event, state) => callback(state); ipcRenderer.on(`chat-${mode === 'pings' ? 'pings' : 'rings'}:state`, listener); return () => ipcRenderer.removeListener(`chat-${mode === 'pings' ? 'pings' : 'rings'}:state`, listener); },
  command: command => ipcRenderer.invoke(mode === 'pings' ? 'chat-pings:command' : 'chat-rings:answer', command),
}));
