const { contextBridge, ipcRenderer } = require('electron');

let isPetWindow = false;
try {
  isPetWindow = location.pathname.endsWith('index.html');
} catch (e) {}

let chat = null;
let selfID = '';
let partnerID = '';
let incomingMessageCallback = null;
let loginPromise = null;
let TencentCloudChat = null;

// 用于解决 dashboard 窗口拉取历史记录与 IM 登录初始化的时序竞态问题
let imReadyResolve = null;
let imReadyReject = null;
const imReadyPromise = new Promise((resolve, reject) => {
  imReadyResolve = resolve;
  imReadyReject = reject;
});

if (isPetWindow) {
  // Initialize IM connection
  ipcRenderer.invoke('get-im-config').then((config) => {
    if (!config) {
      console.warn('IM configuration not found. Running in offline/single-player mode.');
      if (imReadyReject) imReadyReject(new Error('IM config not found'));
      return;
    }
    
    TencentCloudChat = require('@tencentcloud/lite-chat');
    const TIMUploadPlugin = require('tim-upload-plugin');

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
    loginPromise = chat.login({
      userID: config.selfID,
      userSig: config.userSig
    });

    loginPromise.then(() => {
      console.log('Tencent IM logged in successfully as:', config.selfID);
      ipcRenderer.send('im-login-result', { success: true, selfID: config.selfID });
      if (imReadyResolve) imReadyResolve();
    }).catch((err) => {
      console.error('Tencent IM login failed:', err);
      ipcRenderer.send('im-login-result', { success: false, selfID: config.selfID, error: err.message || String(err), code: err.code });
      if (imReadyReject) imReadyReject(err);
    });
  }).catch((err) => {
    console.error('Failed to load IM configuration:', err);
    if (imReadyReject) imReadyReject(err);
  });

  // Listen for trigger from dashboard/main process to send message
  ipcRenderer.on('trigger-send-im-message', (event, text) => {
    sendIMMessage(text);
  });

  // Listen for trigger from dashboard/main process to fetch history
  ipcRenderer.on('trigger-get-im-history', (event) => {
    imReadyPromise.then(() => {
      if (!chat || !partnerID) {
        ipcRenderer.send('im-history-response', []);
        return;
      }

      const now = new Date();
      const todayTwoAM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 2, 0, 0, 0);
      const boundaryTime = now < todayTwoAM ? todayTwoAM.getTime() - 24 * 60 * 60 * 1000 : todayTwoAM.getTime();

      chat.getMessageList({
        conversationID: `C2C${partnerID}`,
        count: 100
      }).then((imResponse) => {
        const list = imResponse.data.messageList || [];
        const formattedHistory = list
          .filter(msg => {
            if (msg.type !== TencentCloudChat.TYPES.MSG_TEXT) return false;
            // 兼容性时间戳转换 (服务器返回的时间 is 秒，乘 1000 转换毫秒。若已是毫秒则保持)
            const msgTimeMs = msg.time < 10000000000 ? msg.time * 1000 : msg.time;
            return msgTimeMs >= boundaryTime;
          })
          .map(msg => ({
            text: msg.payload.text,
            sender: msg.from,
            time: msg.time < 10000000000 ? msg.time * 1000 : msg.time
          }));
        ipcRenderer.send('im-history-response', formattedHistory);
      }).catch((err) => {
        console.error('Failed to get IM history from Tencent Cloud:', err);
        ipcRenderer.send('im-history-response', []);
      });
    }).catch((err) => {
      console.warn('IM history request skipped because IM initialization failed or was not configured:', err.message);
      ipcRenderer.send('im-history-response', []);
    });
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
  getDashboardInitTab: () => ipcRenderer.invoke('get-dashboard-init-tab'),
  onSwitchTab: (callback) => {
    const listener = (event, tabId) => callback(tabId);
    ipcRenderer.on('switch-tab', listener);
    return () => ipcRenderer.removeListener('switch-tab', listener);
  },
  
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
  requestIMHistory: () => ipcRenderer.send('request-im-history'),
  onIMHistoryResponse: (callback) => {
    const listener = (event, history) => callback(history);
    ipcRenderer.on('im-history-response', listener);
    return () => ipcRenderer.removeListener('im-history-response', listener);
  },
  
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
  },
  onWindowHide: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-hide', listener);
    return () => ipcRenderer.removeListener('window-hide', listener);
  },
  onWindowShow: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-show', listener);
    return () => ipcRenderer.removeListener('window-show', listener);
  },
  openChatTab: () => ipcRenderer.send('open-chat-tab'),
  onUpdateUnreadState: (callback) => {
    const listener = (event, hasUnread) => callback(hasUnread);
    ipcRenderer.on('update-unread-state', listener);
    return () => ipcRenderer.removeListener('update-unread-state', listener);
  }
});
