// Config state
let config = null;
let selfID = '';
let partnerID = '';

// Elements
const loveDaysCount = document.getElementById('love-days-count');
const countdownText = document.getElementById('countdown-text');
const dateInput = document.getElementById('anniversary-date-input');
const saveDateBtn = document.getElementById('save-date-btn');

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
  });
});

// Initialize Dashboard
async function init() {
  config = await window.api.getConfig();
  
  // Fill inputs
  if (config.anniversaryDate) {
    dateInput.value = config.anniversaryDate;
    updateAnniversary(config.anniversaryDate);
  }
  
  // Render Memos
  renderMemos();

  // Load IM details
  try {
    const imConfig = await window.api.getIMConfig();
    if (imConfig) {
      selfID = imConfig.selfID;
      partnerID = imConfig.partnerID;
      chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">暂无互动记录</div>';
    } else {
      chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">未检测到IM配置 (离线模式)</div>';
    }
  } catch (e) {
    console.error("Failed to load IM config:", e);
    chatHistory.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; margin: 10px 0;">IM 连接故障</div>';
  }

  // Event Listeners
  saveDateBtn.addEventListener('click', saveDate);
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
    dateInput.value = config.anniversaryDate;
    updateAnniversary(config.anniversaryDate);
    renderMemos();
  });

  // Listen for real-time chat history updates
  window.api.onUpdateChatHistory((data) => {
    appendChatBubble(data);
  });
}

// Calculate and render love anniversary stats
function updateAnniversary(dateString) {
  if (!dateString) return;
  
  const startDate = new Date(dateString);
  const today = new Date();
  
  // Normalize times to midnight to avoid fractional day math anomalies
  startDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today - startDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  loveDaysCount.textContent = diffDays >= 0 ? diffDays : 0;
  
  // Calculate next anniversary
  const currentYear = today.getFullYear();
  let nextAnniversary = new Date(startDate);
  nextAnniversary.setFullYear(currentYear);
  
  // If the anniversary has passed this year, look at next year
  if (nextAnniversary < today) {
    nextAnniversary.setFullYear(currentYear + 1);
  }
  
  const countdownTime = nextAnniversary - today;
  const countdownDays = Math.ceil(countdownTime / (1000 * 60 * 60 * 24));
  
  const yearsTogether = nextAnniversary.getFullYear() - startDate.getFullYear();
  const anniversaryName = `${yearsTogether}周年`;
  
  if (countdownDays === 0) {
    countdownText.innerHTML = `🎉 今天是我们的 <strong>${anniversaryName}纪念日</strong>！情人节快乐！❤️`;
  } else {
    countdownText.innerHTML = `距离我们的 <strong>${anniversaryName}纪念日</strong> 还有 <strong>${countdownDays}</strong> 天`;
  }
}

function saveDate() {
  const dateVal = dateInput.value;
  if (!dateVal) return;
  
  config.anniversaryDate = dateVal;
  window.api.saveConfig(config);
  updateAnniversary(dateVal);
  
  // Show save feedback
  const oldText = saveDateBtn.textContent;
  saveDateBtn.textContent = "已保存 ✓";
  saveDateBtn.disabled = true;
  setTimeout(() => {
    saveDateBtn.textContent = oldText;
    saveDateBtn.disabled = false;
  }, 1500);
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

// Start
init();
