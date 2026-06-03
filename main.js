const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');

// Track drag start position in physical pixels (main process only)
let dragStartWinX = 0;
let dragStartWinY = 0;
let dragStartMouseX = 0;
let dragStartMouseY = 0;
const path = require('path');
const fs = require('fs');
const { Api: TLSSigAPIv2 } = require('tls-sig-api-v2');

let petWindow = null;
let dashboardWindow = null;
let isQuitting = false;
let pendingTab = null;
let tray = null;
let isChatTabActive = false;
let hasUnread = false;

// Parse command line arguments to detect custom profile (e.g. --profile=UserB)
let profile = '';
for (const arg of process.argv) {
  if (arg.startsWith('--profile=')) {
    profile = arg.split('=')[1];
  }
}

if (profile) {
  // Set app name and userData paths to ensure total process/cache isolation
  app.name = `desktop-pet-profile-${profile}`;
  const customUserDataPath = path.join(app.getPath('appData'), app.name);
  app.setPath('userData', customUserDataPath);
  app.commandLine.appendSwitch('user-data-dir', customUserDataPath);
  console.log(`Using custom profile: ${profile}, userData: ${customUserDataPath}`);
}

// ---- 防止程序多开的单实例锁 ----
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (petWindow && !petWindow.isDestroyed()) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
  });
}

// ---- IM Configuration Loading ----
// 优先级: secret.json (开发模式) > im-config-builtin.js (构建打包) > 离线模式
let secretConfig = null;
let testUserSig = '';

function tryLoadConfigFromFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (cfg.SDKAppID && cfg.selfID) {
        return cfg;
      }
    } catch (e) {
      console.error(`Failed to parse config from ${filePath}:`, e);
    }
  }
  return null;
}

// 1. 优先尝试 secret-<profile>.json，然后是 secret.json（开发模式覆盖）
if (profile) {
  secretConfig = tryLoadConfigFromFile(path.join(__dirname, `secret-${profile}.json`));
}
if (!secretConfig) {
  secretConfig = tryLoadConfigFromFile(path.join(__dirname, 'secret.json'));
  if (secretConfig && profile && profile.toLowerCase() === secretConfig.partnerID.toLowerCase()) {
    // 自动对调账号，方便本地双开调试
    const originalSelf = secretConfig.selfID;
    secretConfig.selfID = secretConfig.partnerID;
    secretConfig.partnerID = originalSelf;
    secretConfig.partnerCharacter = secretConfig.partnerCharacter === 'char_girl' ? 'char_boy' : 'char_girl';
    console.log(`[Auto-Swap] Swapped selfID/partnerID for profile "${profile}". selfID=${secretConfig.selfID}, partnerID=${secretConfig.partnerID}, partnerCharacter=${secretConfig.partnerCharacter}`);
  }
}

// 2. 尝试内置构建配置（生产模式，含预生成的 userSig，无 SecretKey）
if (!secretConfig) {
  try {
    secretConfig = require('./im-config-builtin.js');
  } catch (e) {
    // im-config-builtin.js 在开发模式下不存在，这是预期行为
  }
}

// 3. 生成 UserSig（如配置中已有 userSig 则直接使用，否则用 SecretKey 生成）
if (secretConfig) {
  try {
    if (secretConfig.userSig) {
      // 预生成的 userSig（生产模式）
      testUserSig = secretConfig.userSig;
      console.log(`IM config loaded (built-in). selfID=${secretConfig.selfID}, partnerID=${secretConfig.partnerID}`);
    } else if (secretConfig.SecretKey) {
      // 用 SecretKey 运行时生成（开发模式）
      const generator = new TLSSigAPIv2(secretConfig.SDKAppID, secretConfig.SecretKey);
      testUserSig = generator.genUserSig(secretConfig.selfID, 604800);
      console.log(`IM config loaded (secret.json). selfID=${secretConfig.selfID}, partnerID=${secretConfig.partnerID}`);
    }
  } catch (e) {
    console.error('Failed to generate UserSig:', e);
    secretConfig = null;
    testUserSig = '';
  }
} else {
  console.warn('No IM configuration found. Running in offline mode.');
}

// Paths for persistent config
const configPath = path.join(app.getPath('userData'), 'desktop-pet-config.json');

// Default configurations
const defaultConfig = {
  anniversaryDate: '2024-05-20',
  customAnniversaries: [
    { id: 1, name: '百天纪念', date: '2026-06-01' }
  ],
  petScale: 1.5,
  wanderEnabled: true,
  wanderSpeed: 1,
  selectedOutfit: "",
  memos: [
    { id: 1, text: '给伴侣准备纪念日惊喜！🎁', completed: false },
    { id: 2, text: '每天提醒对方多喝水 🥤', completed: false }
  ]
};

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      cachedConfig = JSON.parse(data);
      // Migrate legacy config if customAnniversaries is not defined
      if (!cachedConfig.customAnniversaries) {
        cachedConfig.customAnniversaries = [];
        if (cachedConfig.customAnniversaryName && cachedConfig.customAnniversaryDate) {
          cachedConfig.customAnniversaries.push({
            id: Date.now(),
            name: cachedConfig.customAnniversaryName,
            date: cachedConfig.customAnniversaryDate
          });
        }
      }
      return cachedConfig;
    }
  } catch (err) {
    console.error('Error loading config, using default:', err);
  }
  cachedConfig = { ...defaultConfig };
  return cachedConfig;
}

function saveConfig(config) {
  try {
    cachedConfig = config; // Update memory cache
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // Notify windows of config change
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('config-updated', config);
    }
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('config-updated', config);
    }
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

// Scan available outfits inside assets/characters/<partnerCharacter>
function getAvailableOutfits() {
  const partnerCharacter = secretConfig ? secretConfig.partnerCharacter : '';
  if (!partnerCharacter) return [];
  const charDir = path.join(__dirname, 'assets', 'characters', partnerCharacter);
  if (!fs.existsSync(charDir)) return [];
  try {
    const files = fs.readdirSync(charDir, { withFileTypes: true });
    return files
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (e) {
    console.error(`Failed to scan outfits:`, e);
    return [];
  }
}

// Compute the locked window size based on petScale config
function getPetWindowSize() {
  const config = loadConfig();
  const scale = config.petScale || 1.5;
  const baseSize = 120;
  return Math.round(baseSize * scale);
}

// Atomically enforce position and locked size to prevent DPI size drift
function setPetWindowBounds(win, x, y) {
  const size = getPetWindowSize();
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: size,
    height: size
  });
}

// Create a simple heart tray icon using raw BGRA pixel data
function createHeartIcon() {
  const w = 16, h = 16;
  const buf = Buffer.alloc(w * h * 4, 0);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; // BGRA
  }

  // Heart pattern rows (10 wide, 8 tall)
  const heartRows = [
    '.XX..XX.',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
    '...XX...',
    '...XX...',
  ];

  const startX = 4, startY = 4;
  for (let r = 0; r < heartRows.length; r++) {
    for (let c = 0; c < heartRows[r].length; c++) {
      if (heartRows[r][c] === 'X') {
        setPixel(startX + c, startY + r, 255, 75, 140, 255);
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: w, height: h });
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    return;
  }

  const config = loadConfig();
  const scale = config.petScale || 1.5;
  const baseSize = 120;
  const size = Math.round(baseSize * scale);

  // Position at bottom right of the primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const x = width - size - 40;
  const y = height - size - 10;

  petWindow = new BrowserWindow({
    width: size,
    height: size,
    x: x,
    y: y,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  petWindow.loadFile('index.html');
  if (process.env.LOVEPET_DEVTOOLS === '1') petWindow.webContents.openDevTools({ mode: 'detach' });

  // When user closes the pet window via OS, hide to tray instead of quitting
  petWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      petWindow.hide();
    }
  });

  // Notify renderer to pause/resume background loops
  petWindow.on('hide', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('window-hide');
    }
  });
  petWindow.on('show', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('window-show');
    }
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 620,
    height: 500,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  dashboardWindow.loadFile('dashboard.html');
  if (process.env.LOVEPET_DEVTOOLS === '1') dashboardWindow.webContents.openDevTools();

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    isChatTabActive = false; // Reset chat tab tracking when closed
  });
}

function createTray() {
  const icon = createHeartIcon();
  tray = new Tray(icon);
  tray.setToolTip('💖 桌面人物');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '💖 显示人物',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.show();
        } else {
          createPetWindow();
        }
      }
    },
    {
      label: '❤️ 展开详情',
      click: () => createDashboardWindow()
    },
    { type: 'separator' },
    {
      label: '🚪 退出程序',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click tray icon to show pet
  tray.on('double-click', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.show();
    } else {
      createPetWindow();
    }
  });
}

// IPC Handlers
// drag-start: record starting positions in physical pixels from main process
ipcMain.on('drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const bounds = win.getBounds();
    dragStartWinX = bounds.x;
    dragStartWinY = bounds.y;
    // Get current physical cursor position via screen API
    const point = screen.getCursorScreenPoint();
    dragStartMouseX = point.x;
    dragStartMouseY = point.y;
  }
});

// drag-move: compute new position entirely in main process using physical pixels
ipcMain.on('drag-move', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const point = screen.getCursorScreenPoint();
    const dx = point.x - dragStartMouseX;
    const dy = point.y - dragStartMouseY;
    setPetWindowBounds(win, dragStartWinX + dx, dragStartWinY + dy);
  }
});

// walk-move: auto-wander repositioning (logical pixel coords from renderer)
ipcMain.on('walk-move', (event, { x, y }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    setPetWindowBounds(win, x, y);
  }
});

function updatePetScale(scale) {
  const config = loadConfig();
  config.petScale = scale;
  saveConfig(config);
  if (petWindow && !petWindow.isDestroyed()) {
    const bounds = petWindow.getBounds();
    setPetWindowBounds(petWindow, bounds.x, bounds.y);
  }
}


// show-context-menu: popup native OS context menu
ipcMain.on('show-context-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const config = loadConfig();
  const currentScale = config.petScale || 1.5;

  const contextMenuTemplate = [
    {
      label: '❤️ 展开详情',
      click: () => {
        createDashboardWindow();
      }
    },
    {
      label: '💬 飞鸽传书',
      click: () => {
        pendingTab = 'chat-tab';
        createDashboardWindow();
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('switch-tab', 'chat-tab');
        }
      }
    },
    { type: 'separator' },
    {
      label: '🏃 切换状态',
      submenu: [
        {
          label: '🧍 站立待机',
          click: () => {
            if (petWindow && !petWindow.isDestroyed()) {
              petWindow.webContents.send('change-state', 'idle');
            }
          }
        },
        {
          label: '💭 发呆思念',
          click: () => {
            if (petWindow && !petWindow.isDestroyed()) {
              petWindow.webContents.send('change-state', 'daze');
            }
          }
        },
        {
          label: '💤 趴桌睡觉',
          click: () => {
            if (petWindow && !petWindow.isDestroyed()) {
              petWindow.webContents.send('change-state', 'nap');
            }
          }
        }
      ]
    },
    {
      label: '👗 切换装扮',
      submenu: (() => {
        const availableOutfits = getAvailableOutfits();
        const selectedOutfit = config.selectedOutfit || '';
        const submenu = [
          {
            label: '👗 默认装扮',
            type: 'checkbox',
            checked: selectedOutfit === '',
            click: () => {
              config.selectedOutfit = '';
              saveConfig(config);
            }
          }
        ];
        availableOutfits.forEach(outfit => {
          submenu.push({
            label: `👗 ${outfit}`,
            type: 'checkbox',
            checked: selectedOutfit === outfit,
            click: () => {
              config.selectedOutfit = outfit;
              saveConfig(config);
            }
          });
        });
        return submenu;
      })()
    },
    {
      label: '⚙️ 人物设定',
      submenu: [
        {
          label: '📏 小巧 (1.0x)',
          type: 'checkbox',
          checked: currentScale === 1.0,
          click: () => {
            updatePetScale(1.0);
          }
        },
        {
          label: '📏 适中 (1.5x)',
          type: 'checkbox',
          checked: currentScale === 1.5,
          click: () => {
            updatePetScale(1.5);
          }
        },
        {
          label: '📏 双倍可爱 (2.0x)',
          type: 'checkbox',
          checked: currentScale === 2.0,
          click: () => {
            updatePetScale(2.0);
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '🔽 隐藏到托盘',
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.hide();
        }
      }
    },
    {
      label: '🚪 退出程序',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];

  const menu = Menu.buildFromTemplate(contextMenuTemplate);
  menu.popup({ window: win });
});


ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.on('save-config', (event, newConfig) => {
  saveConfig(newConfig);
});

ipcMain.on('open-dashboard', () => {
  createDashboardWindow();
});

ipcMain.on('close-dashboard', () => {
  if (dashboardWindow) {
    dashboardWindow.close();
  }
});

// Hide pet to tray (not quit)
ipcMain.on('hide-pet', () => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.hide();
  }
});

// Quit the entire app
ipcMain.on('exit-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return primaryDisplay.workAreaSize;
});

// Resize pet window — only called from explicit user settings action
ipcMain.on('resize-pet', (event, scale) => {
  if (petWindow && !petWindow.isDestroyed()) {
    const bounds = petWindow.getBounds();
    setPetWindowBounds(petWindow, bounds.x, bounds.y);
  }
});

ipcMain.handle('get-dashboard-init-tab', () => {
  const tab = pendingTab;
  pendingTab = null; // consume
  return tab;
});

// Expose IM config (without SecretKey!)
ipcMain.handle('get-im-config', () => {
  if (!secretConfig) return null;
  return {
    SDKAppID: secretConfig.SDKAppID,
    selfID: secretConfig.selfID,
    partnerID: secretConfig.partnerID,
    partnerCharacter: secretConfig.partnerCharacter,
    userSig: testUserSig
  };
});

// 将渲染进程的 IM 登录结果转发到终端（便于调试）
ipcMain.on('im-login-result', (_event, result) => {
  if (result.success) {
    console.log(`[IM] ${result.selfID} 登录成功`);
  } else {
    console.error(`[IM] ${result.selfID} 登录失败:`, result.error, result.code ? `(code: ${result.code})` : '');
  }
});

// 将渲染进程的 IM 发送错误转发到终端（便于调试）
ipcMain.on('im-send-error', (_event, data) => {
  console.error(`[IM] 发送消息失败:`, data.error, data.code ? `(code: ${data.code})` : '');
});

// Relay IM messages between pet window and dashboard window
ipcMain.on('send-im-message', (event, text) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('trigger-send-im-message', text);
  }
});

ipcMain.on('im-message-sent-success', (event, data) => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('update-chat-history', data);
  }
});

ipcMain.on('im-message-received', (event, data) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('incoming-im-message', data.text);
    if (!isChatTabActive) {
      hasUnread = true;
      petWindow.webContents.send('update-unread-state', true);
    }
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('update-chat-history', data);
  }
});

ipcMain.on('chat-tab-active', (event, isActive) => {
  isChatTabActive = isActive;
  if (isChatTabActive) {
    hasUnread = false;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('update-unread-state', false);
    }
  }
});

ipcMain.on('open-chat-tab', (event) => {
  pendingTab = 'chat-tab';
  createDashboardWindow();
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('switch-tab', 'chat-tab');
  }
});

ipcMain.on('request-im-history', (event) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('trigger-get-im-history');
  }
});

ipcMain.on('im-history-response', (event, history) => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('im-history-response', history);
  }
});

app.whenReady().then(() => {
  createTray();
  createPetWindow();

  app.on('activate', () => {
    if (petWindow === null || petWindow.isDestroyed()) {
      createPetWindow();
    } else {
      petWindow.show();
    }
  });
});

// Prevent quitting when all windows closed — tray keeps the app alive
app.on('window-all-closed', () => {
  // Do nothing — the tray keeps the app running
});

app.on('before-quit', () => {
  isQuitting = true;
});
