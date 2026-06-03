const { contextBridge, ipcRenderer } = require('electron');

// Lightweight preload for the Dashboard window.
// Does NOT load any IM SDK or drag/walk/pet-state logic — those live
// exclusively in the pet window's preload.js.

contextBridge.exposeInMainWorld('api', {
  // Config storage
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  onConfigUpdated: (callback) => {
    const listener = (event, config) => callback(config);
    ipcRenderer.on('config-updated', listener);
    return () => ipcRenderer.removeListener('config-updated', listener);
  },

  // Window control
  closeDashboard: () => ipcRenderer.send('close-dashboard'),
  getDashboardInitTab: () => ipcRenderer.invoke('get-dashboard-init-tab'),
  onSwitchTab: (callback) => {
    const listener = (event, tabId) => callback(tabId);
    ipcRenderer.on('switch-tab', listener);
    return () => ipcRenderer.removeListener('switch-tab', listener);
  },

  // IM config (read-only, for selfID / partnerID display)
  getIMConfig: () => ipcRenderer.invoke('get-im-config'),

  // IM messaging (relayed through main process → pet window's IM SDK)
  sendIMMessage: (text) => ipcRenderer.send('send-im-message', text),
  requestIMHistory: () => ipcRenderer.send('request-im-history'),
  onIMHistoryResponse: (callback) => {
    const listener = (event, history) => callback(history);
    ipcRenderer.on('im-history-response', listener);
    return () => ipcRenderer.removeListener('im-history-response', listener);
  },
  onUpdateChatHistory: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-chat-history', listener);
    return () => ipcRenderer.removeListener('update-chat-history', listener);
  },
  notifyChatTabActive: (isActive) => ipcRenderer.send('chat-tab-active', isActive)
});
