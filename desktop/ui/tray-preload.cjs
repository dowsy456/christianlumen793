'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chatTray', Object.freeze({ onState(callback) { ipcRenderer.on('chat-tray:state', (_event, state) => callback(state)); }, command: value => ipcRenderer.invoke('chat-tray:command', value) }));
