// Config state
let config = null;
let selfID = '';
let partnerID = '';
let lastHourKey = null;

// Elements
const loveDaysCount = document.getElementById('love-days-count');
const countdownText = document.getElementById('countdown-text');
const dateInput = document.getElementById('anniversary-date-input');
const saveDateBtn = document.getElementById('save-date-btn');

const customAnniversaryNameInput = document.getElementById('custom-anniversary-name-input');
const customAnniversaryDateInput = document.getElementById('custom-anniversary-date-input');
const saveCustomAnniversaryBtn = document.getElementById('save-custom-anniversary-btn');

const newMemoInput = document.getElementById('new-memo-input');
const addMemoBtn = document.getElementById('add-memo-btn');
const memoList = document.getElementById('memo-list');

const chatHistory = document.getElementById('chat-history');
const chatMsgInput = document.getElementById('chat-msg-input');
const sendChatBtn = document.getElementById('send-chat-btn');

const closeWinBtn = document.getElementById('close-win-btn');

// Tab Switching
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');
    
    // Toggle active classes
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(t => t.classList.remove('active'));
    
    item.classList.add('active');
    document.getElementById(tabId).classList.add('active');

    // Notify main process of chat tab focus
    if (window.api.notifyChatTabActive) {
      window.api.notifyChatTabActive(tabId === 'chat-tab');
    }
  });
});

// Initialize Dashboard
async function init() {
  config = await window.api.getConfig();
  
  // Fill inputs
  if (config.anniversaryDate) {
    dateInput.value = config.anniversaryDate;
  }
  
  updateAnniversary();
  renderCustomAnniversaries();
  
  // Render Memos
  renderMemos();

  // Load IM details
  try {
    const imConfig = await window.api.getIMConfig();
    if (imConfig) {
      selfID = imConfig.selfID;
      partnerID = imConfig.partnerID;
      chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">连接中...</div>';
      window.api.requestIMHistory();
    } else {
      chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">未检测到IM配置 (离线模式)</div>';
    }
  } catch (e) {
    console.error("Failed to load IM config:", e);
    chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">IM 连接故障</div>';
  }

  // Event Listeners
  saveDateBtn.addEventListener('click', saveDate);
  saveCustomAnniversaryBtn.addEventListener('click', saveCustomAnniversary);
  addMemoBtn.addEventListener('click', addMemo);
  
  // Chat listeners
  sendChatBtn.addEventListener('click', sendIMMsg);
  chatMsgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendIMMsg();
    }
  });

  // Window Controls
  closeWinBtn.addEventListener('click', () => {
    window.api.closeDashboard();
  });

  // Listen for config updates from other windows
  window.api.onConfigUpdated((newConfig) => {
    config = newConfig;
    dateInput.value = config.anniversaryDate || '';
    updateAnniversary();
    renderCustomAnniversaries();
    renderMemos();
  });

  // Listen for real-time chat history updates
  window.api.onUpdateChatHistory((data) => {
    appendChatBubble(data);
  });

  // Listen for historical chat logs
  window.api.onIMHistoryResponse((history) => {
    renderChatHistory(history);
  });

  // Handle initial tab routing
  try {
    const initTab = await window.api.getDashboardInitTab();
    if (initTab) {
      switchTab(initTab);
    } else {
      if (window.api.notifyChatTabActive) {
        window.api.notifyChatTabActive(false);
      }
    }
  } catch (e) {
    console.error("Failed to get initial tab:", e);
  }

  // Listen for tab switch requests at runtime
  window.api.onSwitchTab((tabId) => {
    switchTab(tabId);
  });
}

// Calculate and render love anniversary stats and custom countdown
function updateAnniversary() {
  if (config.anniversaryDate) {
    const startDate = new Date(config.anniversaryDate);
    const today = new Date();
    
    // Normalize times to midnight to avoid fractional day math anomalies
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = today - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    loveDaysCount.textContent = diffDays >= 0 ? diffDays : 0;
  } else {
    loveDaysCount.textContent = '0';
  }
  
  if (config.customAnniversaries && config.customAnniversaries.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate countdown days for all custom anniversaries (based on next occurrence)
    const list = config.customAnniversaries.map(anniv => {
      const targetDate = getNextOccurrence(anniv.date);
      const diffTime = targetDate - today;
      const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { ...anniv, countdownDays };
    });
    
    // Sort all anniversaries ascending by countdownDays (closest upcoming first)
    list.sort((a, b) => a.countdownDays - b.countdownDays);
    const closest = list[0];
    
    if (closest) {
      const nameEscaped = escapeHtml(closest.name);
      if (closest.countdownDays === 0) {
        countdownText.innerHTML = `🎉 今天是我们的 <strong>${nameEscaped}</strong>！节日快乐！❤️`;
      } else {
        countdownText.innerHTML = `距离 <strong>${nameEscaped}</strong> 还有 <strong>${closest.countdownDays}</strong> 天`;
      }
    } else {
      countdownText.innerHTML = '未设置自定义纪念日';
    }
  } else {
    countdownText.innerHTML = '未设置自定义纪念日';
  }
}

function saveDate() {
  const dateVal = dateInput.value;
  if (!dateVal) return;
  
  config.anniversaryDate = dateVal;
  window.api.saveConfig(config);
  updateAnniversary();
  
  // Show save feedback
  const oldText = saveDateBtn.textContent;
  saveDateBtn.textContent = "已保存 ✓";
  saveDateBtn.disabled = true;
  setTimeout(() => {
    saveDateBtn.textContent = oldText;
    saveDateBtn.disabled = false;
  }, 1500);
}

function saveCustomAnniversary() {
  const nameVal = customAnniversaryNameInput.value.trim();
  const dateVal = customAnniversaryDateInput.value;
  if (!nameVal || !dateVal) return;
  
  if (!config.customAnniversaries) {
    config.customAnniversaries = [];
  }
  
  const newAnniv = {
    id: Date.now(),
    name: nameVal,
    date: dateVal
  };
  
  config.customAnniversaries.push(newAnniv);
  
  customAnniversaryNameInput.value = '';
  customAnniversaryDateInput.value = '';
  
  window.api.saveConfig(config);
  updateAnniversary();
  renderCustomAnniversaries();
  
  // Show save feedback
  const oldText = saveCustomAnniversaryBtn.textContent;
  saveCustomAnniversaryBtn.textContent = "已保存 ✓";
  saveCustomAnniversaryBtn.disabled = true;
  setTimeout(() => {
    saveCustomAnniversaryBtn.textContent = oldText;
    saveCustomAnniversaryBtn.disabled = false;
  }, 1500);
}

function switchTab(tabId) {
  const targetItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (targetItem) {
    targetItem.click();
  }
}

// Memo operations
function renderMemos() {
  memoList.innerHTML = '';
  
  if (!config.memos || config.memos.length === 0) {
    memoList.innerHTML = '<li style="text-align:center; color:#999; font-size:12px; margin-top:20px;">暂无备忘事项，添加一个吧~</li>';
    return;
  }
  
  config.memos.forEach(memo => {
    const li = document.createElement('li');
    li.className = 'memo-item';
    
    li.innerHTML = `
      <div class="memo-content">
        <input type="checkbox" ${memo.completed ? 'checked' : ''} data-id="${memo.id}">
        <span class="memo-text ${memo.completed ? 'completed' : ''}">${escapeHtml(memo.text)}</span>
      </div>
      <button class="delete-memo-btn" data-id="${memo.id}">&times;</button>
    `;
    
    // Toggle completion listener
    li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      toggleMemo(memo.id, e.target.checked);
    });
    
    // Delete listener
    li.querySelector('.delete-memo-btn').addEventListener('click', () => {
      deleteMemo(memo.id);
    });
    
    memoList.appendChild(li);
  });
}

function addMemo() {
  const text = newMemoInput.value.trim();
  if (!text) return;
  
  const newMemo = {
    id: Date.now(),
    text: text,
    completed: false
  };
  
  if (!config.memos) config.memos = [];
  config.memos.push(newMemo);
  
  window.api.saveConfig(config);
  renderMemos();
  newMemoInput.value = '';
}

function toggleMemo(id, completed) {
  config.memos = config.memos.map(m => {
    if (m.id === id) {
      return { ...m, completed: completed };
    }
    return m;
  });
  window.api.saveConfig(config);
  renderMemos();
}

function deleteMemo(id) {
  config.memos = config.memos.filter(m => m.id !== id);
  window.api.saveConfig(config);
  renderMemos();
}

// Helper to escape HTML tags
function escapeHtml(string) {
  const matchHtmlRegExp = /["'&<>]/;
  const str = '' + string;
  const match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  let escape;
  let html = '';
  let index = 0;
  let lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = '&quot;';
        break;
      case 38: // &
        escape = '&amp;';
        break;
      case 39: // '
        escape = '&#39;'; // expression safer than &apos;
        break;
      case 60: // <
        escape = '&lt;';
        break;
      case 62: // >
        escape = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index
    ? html + str.substring(lastIndex, index)
    : html;
}

function sendIMMsg() {
  const text = chatMsgInput.value.trim();
  if (!text) return;

  window.api.sendIMMessage(text);
  chatMsgInput.value = '';
}

function appendChatBubble(data) {
  const placeholder = chatHistory.querySelector('div');
  if (placeholder && (placeholder.textContent === '暂无互动记录' || placeholder.textContent === '连接中...' || placeholder.textContent === '未检测到IM配置 (离线模式)')) {
    chatHistory.innerHTML = '';
    lastHourKey = null;
  }

  // Detect hour key
  const msgDate = new Date(data.time);
  const year = msgDate.getFullYear();
  const month = String(msgDate.getMonth() + 1).padStart(2, '0');
  const date = String(msgDate.getDate()).padStart(2, '0');
  const hours = String(msgDate.getHours()).padStart(2, '0');
  const hourKey = `${year}-${month}-${date} ${hours}:00`;

  if (hourKey !== lastHourKey) {
    const today = new Date();
    const isToday = msgDate.getFullYear() === today.getFullYear() &&
                    msgDate.getMonth() === today.getMonth() &&
                    msgDate.getDate() === today.getDate();
    const displayTime = isToday ? `${hours}:00` : `${month}-${date} ${hours}:00`;

    const divider = document.createElement('div');
    divider.className = 'chat-time-divider';
    divider.innerHTML = `<span class="chat-time-text">${displayTime}</span>`;
    chatHistory.appendChild(divider);
    lastHourKey = hourKey;
  }

  const isSelf = data.sender === selfID;
  const senderName = isSelf ? '我' : '对方';

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSelf ? 'self' : 'partner'}`;
  
  bubble.innerHTML = `
    <div class="chat-bubble-sender">${escapeHtml(senderName)}</div>
    <div class="chat-bubble-content">${escapeHtml(data.text)}</div>
  `;

  chatHistory.appendChild(bubble);
  
  // Auto scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderChatHistory(history) {
  chatHistory.innerHTML = '';
  lastHourKey = null;
  if (!history || history.length === 0) {
    chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">暂无互动记录</div>';
    return;
  }
  
  const today = new Date();
  
  history.forEach(data => {
    const msgDate = new Date(data.time);
    const year = msgDate.getFullYear();
    const month = String(msgDate.getMonth() + 1).padStart(2, '0');
    const date = String(msgDate.getDate()).padStart(2, '0');
    const hours = String(msgDate.getHours()).padStart(2, '0');
    const hourKey = `${year}-${month}-${date} ${hours}:00`;

    if (hourKey !== lastHourKey) {
      const isToday = msgDate.getFullYear() === today.getFullYear() &&
                      msgDate.getMonth() === today.getMonth() &&
                      msgDate.getDate() === today.getDate();
      const displayTime = isToday ? `${hours}:00` : `${month}-${date} ${hours}:00`;

      const divider = document.createElement('div');
      divider.className = 'chat-time-divider';
      divider.innerHTML = `<span class="chat-time-text">${displayTime}</span>`;
      chatHistory.appendChild(divider);
      lastHourKey = hourKey;
    }

    const isSelf = data.sender === selfID;
    const senderName = isSelf ? '我' : '对方';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isSelf ? 'self' : 'partner'}`;
    
    bubble.innerHTML = `
      <div class="chat-bubble-sender">${escapeHtml(senderName)}</div>
      <div class="chat-bubble-content">${escapeHtml(data.text)}</div>
    `;

    chatHistory.appendChild(bubble);
  });
  
  // Auto scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function renderCustomAnniversaries() {
  const annivList = document.getElementById('anniversary-list');
  if (!annivList) return;
  
  annivList.innerHTML = '';
  
  if (!config.customAnniversaries || config.customAnniversaries.length === 0) {
    annivList.innerHTML = '<li style="text-align:center; color:#999; font-size:12px; margin-top:10px;">暂无自定义纪念日，添加一个吧~</li>';
    return;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  config.customAnniversaries.forEach(anniv => {
    const targetDate = getNextOccurrence(anniv.date);
    const diffTime = targetDate - today;
    const countdownDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let countdownStr = '';
    if (countdownDays === 0) {
      countdownStr = '今天！🎉';
    } else {
      countdownStr = `还有 ${countdownDays} 天`;
    }
    
    const li = document.createElement('li');
    li.className = 'memo-item';
    
    li.innerHTML = `
      <div class="memo-content" style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
        <span style="font-weight: 600; font-size: 13px;">${escapeHtml(anniv.name)}</span>
        <span style="font-size: 11px; color: var(--text-light);">${anniv.date} (${countdownStr})</span>
      </div>
      <button class="delete-anniv-btn" data-id="${anniv.id}">&times;</button>
    `;
    
    li.querySelector('.delete-anniv-btn').addEventListener('click', () => {
      deleteAnniversary(anniv.id);
    });
    
    annivList.appendChild(li);
  });
}

function deleteAnniversary(id) {
  config.customAnniversaries = config.customAnniversaries.filter(a => a.id !== id);
  window.api.saveConfig(config);
  updateAnniversary();
  renderCustomAnniversaries();
}

// Helper to calculate the next occurrence of an anniversary date (always in the future or today)
function getNextOccurrence(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const originalDate = new Date(dateStr);
  originalDate.setHours(0, 0, 0, 0);
  
  if (originalDate >= today) {
    return originalDate;
  }
  
  const targetDate = new Date(today.getFullYear(), originalDate.getMonth(), originalDate.getDate());
  targetDate.setHours(0, 0, 0, 0);
  
  if (targetDate < today) {
    targetDate.setFullYear(today.getFullYear() + 1);
  }
  
  return targetDate;
}

// Start
init();
