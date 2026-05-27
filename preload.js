const { contextBridge, ipcRenderer } = require('electron');

let isPetWindow = false;
try {
  isPetWindow = location.pathname.endsWith('index.html');
} catch (e) {}

let chat = null;
let selfID = '';
let partnerID = '';
let incomingMessageCallback = null;

if (isPetWindow) {
  const TencentCloudChat = require('@tencentcloud/lite-chat');
  const TIMUploadPlugin = require('tim-upload-plugin');

  // Initialize IM connection
  ipcRenderer.invoke('get-im-config').then((config) => {
    if (!config) {
      console.warn('IM configuration not found. Running in offline/single-player mode.');
      return;
    }
    
    selfID = config.selfID;
    partnerID = config.partnerID;

    chat = TencentCloudChat.create({
      SDKAppID: config.SDKAppID
    });
    
    chat.registerPlugin({ 'tim-upload-plugin': TIMUploadPlugin });
    chat.setLogLevel(1); // Production log level
    
    // Set up listeners before login
    chat.on(TencentCloudChat.EVENT.MESSAGE_RECEIVED, (event) => {
      const messageList = event.data;
      messageList.forEach((message) => {
        if (message.type === TencentCloudChat.TYPES.MSG_TEXT && message.from === partnerID) {
          const text = message.payload.text;
          // 1. Notify the renderer process (pet.js) to show the speech bubble
          if (incomingMessageCallback) {
            incomingMessageCallback(text);
          }
          // 2. Notify the main process to forward to the dashboard chat history
          ipcRenderer.send('im-message-received', { text, sender: partnerID, time: Date.now() });
        }
      });
    });

    // Login
    chat.login({
      userID: config.selfID,
      userSig: config.userSig
    }).then(() => {
      console.log('Tencent IM logged in successfully as:', config.selfID);
      ipcRenderer.send('im-login-result', { success: true, selfID: config.selfID });
    }).catch((err) => {
      console.error('Tencent IM login failed:', err);
      ipcRenderer.send('im-login-result', { success: false, selfID: config.selfID, error: err.message || String(err), code: err.code });
    });
  });

  // Listen for trigger from dashboard/main process to send message
  ipcRenderer.on('trigger-send-im-message', (event, text) => {
    sendIMMessage(text);
  });
}

function sendIMMessage(text) {
  if (!chat || !partnerID) {
    console.warn('IM client not initialized');
    return;
  }

  const message = chat.createTextMessage({
    to: partnerID,
    conversationType: 'C2C',
    payload: { text }
  });

  chat.sendMessage(message).then((imResponse) => {
    ipcRenderer.send('im-message-sent-success', { text, sender: selfID, time: Date.now() });
  }).catch((err) => {
    console.error('Failed to send IM message:', err);
    ipcRenderer.send('im-send-error', { text, error: err.message || String(err), code: err.code });
  });
}

contextBridge.exposeInMainWorld('api', {
  // Drag window — main process handles all coordinate math to avoid DPI issues
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: () => ipcRenderer.send('drag-move'),
  // Auto-wander walk movement (absolute logical pixel coords)
  walkMove: (coords) => ipcRenderer.send('walk-move', coords),
  
  // App control
  exitApp: () => ipcRenderer.send('exit-app'),
  hidePet: () => ipcRenderer.send('hide-pet'),
  
  // Dashboard control
  openDashboard: () => ipcRenderer.send('open-dashboard'),
  closeDashboard: () => ipcRenderer.send('close-dashboard'),
  
  // Config storage
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  resizePet: (scale) => ipcRenderer.send('resize-pet', scale),
  
  // Screen info
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  
  // Context Menu
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  // IM real-time communication
  getIMConfig: () => ipcRenderer.invoke('get-im-config'),
  sendIMMessage: (text) => ipcRenderer.send('send-im-message', text),
  
  // Register callback for incoming IM message
  onIncomingIMMessage: (callback) => {
    incomingMessageCallback = callback;
  },
  onUpdateChatHistory: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('update-chat-history', listener);
    return () => ipcRenderer.removeListener('update-chat-history', listener);
  },
  onConfigUpdated: (callback) => {
    const listener = (event, config) => callback(config);
    ipcRenderer.on('config-updated', listener);
    return () => ipcRenderer.removeListener('config-updated', listener);
  },
  onChangeState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('change-state', listener);
    return () => ipcRenderer.removeListener('change-state', listener);
  },
  onTriggerDialogue: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('trigger-dialogue', listener);
    return () => ipcRenderer.removeListener('trigger-dialogue', listener);
  }
});
