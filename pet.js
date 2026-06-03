// Elements
const petContainer = document.getElementById('pet-container');
const petCharacter = document.getElementById('pet-character');
const dialogueBubble = document.getElementById('dialogue-bubble');
const dialogueText = document.getElementById('dialogue-text');
const zzzContainer = document.getElementById('zzz-container');
const unreadBadge = document.getElementById('unread-badge');

// State variables
let isDragging = false;
let hasDragged = false;

let config = null;
let currentState = 'idle'; // 'idle', 'happy', 'daze', 'nap', 'drag'
let lastInteractionTime = Date.now(); // Track time for idle timeout
let blinkTimeout = null;
let stateResetTimeout = null;

// Processed Image DataURLs
let processedIdleUrl = '';
let processedClosedUrl = '';
let processedHappyUrl = '';
let processedDazeUrl = '';
let processedSleepUrl = '';
let assetsLoadedCount = 0;
let partnerCharName = '';

// Timer references (kept so they can be paused when the window hides)
let brainInterval = null;
let dialogueInterval = null;
let isWindowHidden = false;

function getAssetPath(fileName, partnerCharacter) {
  const outfit = (config && config.selectedOutfit) ? `${config.selectedOutfit}/` : '';
  if (partnerCharacter) {
    return `assets/characters/${partnerCharacter}/${outfit}${fileName}`;
  }
  return `assets/${outfit}${fileName}`;
}

// Dialogue databases
const defaultDialogues = [
  "今天也要开心哦！✨",
  "戳我理理我嘛~ 🐾",
  "累了的话，就揉揉眼睛休息一下吧 ☕",
  "我一直在桌面上陪着你呢 💕",
  "今天也是爱你的一天 ❤️",
  "多喝水，多喝水，多喝水！🥤"
];

const happyDialogues = [
  "开心！理我了！💕",
  "嘿嘿，被戳到啦~ ✨",
  "收到你的爱心！❤️",
  "最喜欢和你互动啦！🌟"
];

const dazeDialogues = [
  "发呆中... 脑子里都是你 💭",
  "在忙吗？好想你呀 💕",
  "在脑海里悄悄画你的样子~ ✨",
  "发呆是一件很浪漫的事，因为想的都是你 ❤️",
  "⚪⚫⚪⚫⚪<br>⚫⚫⚫⚫⚫<br>⚪⚫⚫⚫⚪<br>⚪⚪⚫⚪⚪<br>（黑子连成心形啦！❤️）",
  "⚫⚫⚫⚫⚫<br>五子相连，我赢啦！<br>惩罚是：想我一次 😘",
  "⚪⚫⚪⚫⚪<br>⚪⚪⚫⚪⚪<br>该轮到你落子啦~ ♟️"
];

// Preload all assets directly (already transparent PNGs)
async function loadAndProcessAssets(partnerCharacter) {
  processedIdleUrl = getAssetPath('pet_character.png', partnerCharacter);
  processedClosedUrl = getAssetPath('pet_character_closed_eyes.png', partnerCharacter);
  processedHappyUrl = getAssetPath('pet_character_happy.png', partnerCharacter);
  processedDazeUrl = getAssetPath('pet_character_daze.png', partnerCharacter);
  processedSleepUrl = getAssetPath('pet_character_sleep.png', partnerCharacter);
  
  // Apply initial background
  updateCharacterBackground();
}

// Initialize configuration and event listeners
async function init() {
  config = await window.api.getConfig();
  
  // Retrieve IM config to find partnerCharacter
  let partnerCharacter = '';
  try {
    const imConfig = await window.api.getIMConfig();
    if (imConfig && imConfig.partnerCharacter) {
      partnerCharacter = imConfig.partnerCharacter;
      partnerCharName = partnerCharacter;
    }
  } catch (e) {
    console.error("Failed to load IM configuration:", e);
  }

  await loadAndProcessAssets(partnerCharacter);

  setState('idle');
  startBrain();

  showRandomDialogue(true);
  dialogueInterval = setInterval(dialogueRoutine, 15000);

  petCharacter.addEventListener('pointerdown', startDrag);
  petCharacter.addEventListener('pointermove', (e) => {
    if (isDragging) {
      hasDragged = true;
      resetInteractionTimer();
      window.api.dragMove();
    }
  });
  petCharacter.addEventListener('pointerup', endDrag);
  petCharacter.addEventListener('pointercancel', endDrag);

  petCharacter.addEventListener('click', (e) => {
    if (e.button === 0 && !hasDragged) {
      triggerPokeInteraction();
    }
    hasDragged = false;
  });

  petCharacter.addEventListener('dragstart', (e) => e.preventDefault());

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.api.showContextMenu();
  });

  window.api.onChangeState((state) => {
    if (state === 'walk') {
      setState('daze');
    } else {
      setState(state);
    }
  });
  window.api.onTriggerDialogue(() => {
    showRandomDialogue();
  });

  window.api.onConfigUpdated((newConfig) => {
    const oldOutfit = (config && config.selectedOutfit) || '';
    config = newConfig;
    const newOutfit = (newConfig && newConfig.selectedOutfit) || '';
    if (oldOutfit !== newOutfit) {
      loadAndProcessAssets(partnerCharName);
    }
  });

  // Pause all loops when hidden to tray, resume when shown again
  window.api.onWindowHide(() => pauseAll());
  window.api.onWindowShow(() => resumeAll());

  // Click on unread red dot to open chat window
  unreadBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.openChatTab();
  });

  window.api.onUpdateUnreadState((hasUnread) => {
    if (hasUnread) {
      unreadBadge.classList.remove('hidden');
    } else {
      unreadBadge.classList.add('hidden');
    }
  });

  // Listen for incoming IM messages from partner to show bubbles
  window.api.onIncomingIMMessage((text) => {
    setState('happy');
    dialogueBubble.classList.add('hidden');
    dialogueText.innerHTML = text;
    dialogueBubble.classList.remove('hidden');
    
    if (stateResetTimeout) clearTimeout(stateResetTimeout);
    
    // Stay visible for 6 seconds, then hide and return to idle
    setTimeout(() => {
      dialogueBubble.classList.add('hidden');
      if (currentState === 'happy') {
        setState('idle');
      }
    }, 6000);
  });
}

function updateCharacterBackground() {
  if (!petCharacter) return;
  
  let targetUrl = processedIdleUrl || getAssetPath('pet_character.png', partnerCharName);

  if (currentState === 'happy') {
    targetUrl = processedHappyUrl || getAssetPath('pet_character_happy.png', partnerCharName);
  } else if (currentState === 'daze') {
    targetUrl = processedDazeUrl || getAssetPath('pet_character_daze.png', partnerCharName);
  } else if (currentState === 'nap') {
    targetUrl = processedSleepUrl || getAssetPath('pet_character_sleep.png', partnerCharName);
  }

  petCharacter.style.backgroundImage = `url("${targetUrl}")`;
}

function setState(state) {
  if (currentState === 'nap' && state !== 'nap') {
    resetInteractionTimer();
  }

  currentState = state;
  petContainer.className = `state-${state}`;
  resetStateTimeouts();
  updateCharacterBackground();

  if (state === 'idle') {
    startBlinkLoop();
  } else if (state === 'happy') {
    startBlinkLoop();
  } else if (state === 'daze') {
    startBlinkLoop();
    showDazeDialogue();
  } else if (state === 'nap') {
    zzzContainer.classList.remove('hidden');
  } else if (state === 'drag') {
  }
}

function resetStateTimeouts() {
  zzzContainer.classList.add('hidden');
  stopBlinkLoop();
  
  if (stateResetTimeout) {
    clearTimeout(stateResetTimeout);
    stateResetTimeout = null;
  }
}

function resetInteractionTimer() {
  lastInteractionTime = Date.now();
}

// Blinking loop (only blinks if in idle, happy, or daze states)
function startBlinkLoop() {
  if (blinkTimeout) clearTimeout(blinkTimeout);
  
  const nextBlinkTime = 3000 + Math.random() * 4000; // Blink every 3-7 seconds
  blinkTimeout = setTimeout(() => {
    const blinkableStates = ['idle', 'happy', 'daze'];
    if (blinkableStates.includes(currentState) && processedClosedUrl) {
      // Swap background to closed eyes
      petCharacter.style.backgroundImage = `url("${processedClosedUrl}")`;
      
      // Keep eyes closed for 150ms
      setTimeout(() => {
        if (blinkableStates.includes(currentState)) {
          updateCharacterBackground();
          startBlinkLoop();
        }
      }, 150);
    } else {
      // Not in a blinkable state — stop the loop entirely.
      // setState() will restart it when entering idle/happy/daze.
      return;
    }
  }, nextBlinkTime);
}

function stopBlinkLoop() {
  if (blinkTimeout) {
    clearTimeout(blinkTimeout);
    blinkTimeout = null;
  }
}

// Poke Interaction (Clicking)
function triggerPokeInteraction() {
  resetInteractionTimer();

  // If clicked while sleeping, wake up!
  if (currentState === 'nap') {
    setState('idle');
    showRandomDialogue(true);
    return;
  }

  // Trigger happy state
  setState('happy');
  showHappyDialogue();

  // Set timeout to return to idle after 2.5 seconds
  stateResetTimeout = setTimeout(() => {
    if (currentState === 'happy') {
      setState('idle');
    }
  }, 2500);
}

// Drag — triggers animation state and calls main process drag APIs
function startDrag(e) {
  if (e.button !== 0) return;
  isDragging = true;
  hasDragged = false;
  setState('drag');
  try {
    petCharacter.setPointerCapture(e.pointerId);
  } catch (err) {
    console.error("Failed to capture pointer:", err);
  }
  window.api.dragStart();
}

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  try {
    if (e) {
      petCharacter.releasePointerCapture(e.pointerId);
    }
  } catch (err) {}
  setState('idle');
  resetInteractionTimer();
}

// Inactivity brain checking loop (runs every 5 seconds)
function startBrain() {
  if (brainInterval) clearInterval(brainInterval);
  brainInterval = setInterval(() => {
    if (isDragging || currentState === 'drag' || currentState === 'happy' || currentState === 'nap') return;

    const timeSinceLastInteract = Date.now() - lastInteractionTime;

    if (currentState === 'idle') {
      // 40 seconds of inactivity -> enters Daze/Yearning state
      if (timeSinceLastInteract >= 40000) {
        setState('daze');
      }
    } else if (currentState === 'daze') {
      // 5 minutes of inactivity -> falls asleep
      if (timeSinceLastInteract >= 300000) {
        setState('nap');
      }
    }
  }, 5000);
}

// Pause all background loops when the window is hidden to the system tray
function pauseAll() {
  isWindowHidden = true;
  if (brainInterval) { clearInterval(brainInterval); brainInterval = null; }
  if (dialogueInterval) { clearInterval(dialogueInterval); dialogueInterval = null; }
  stopBlinkLoop();
}

// Resume all background loops when the window is shown again
function resumeAll() {
  isWindowHidden = false;
  startBrain();
  dialogueInterval = setInterval(dialogueRoutine, 15000);
  const blinkableStates = ['idle', 'happy', 'daze'];
  if (blinkableStates.includes(currentState)) {
    startBlinkLoop();
  }
}

// Dialog Bubbles logic
function showRandomDialogue(isWelcome = false) {
  if (currentState === 'nap' || currentState === 'daze' || currentState === 'happy') return;

  dialogueBubble.classList.add('hidden');
  
  let dialogues = [...defaultDialogues];

  // Include custom memos if available
  if (config && config.memos && config.memos.length > 0) {
    const uncompletedMemos = config.memos.filter(m => !m.completed);
    if (uncompletedMemos.length > 0) {
      dialogues.push(`别忘了"${uncompletedMemos[0].text}"哦！💡`);
    }
  }

  // Include love counters
  if (config && config.anniversaryDate) {
    const startDate = new Date(config.anniversaryDate);
    const today = new Date();
    const diffTime = today - startDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays >= 0) {
      dialogues.push(`今天是我们在一起的第 ${diffDays} 天！❤️`);
    }
  }

  if (isWelcome) {
    dialogueText.innerHTML = "哈喽！我来陪你啦~ 😊";
  } else {
    const randomIndex = Math.floor(Math.random() * dialogues.length);
    dialogueText.innerHTML = dialogues[randomIndex];
  }

  dialogueBubble.classList.remove('hidden');

  setTimeout(() => {
    dialogueBubble.classList.add('hidden');
  }, 5000);
}

function showHappyDialogue() {
  dialogueBubble.classList.add('hidden');
  const randomIndex = Math.floor(Math.random() * happyDialogues.length);
  dialogueText.innerHTML = happyDialogues[randomIndex];
  dialogueBubble.classList.remove('hidden');
  
  setTimeout(() => {
    dialogueBubble.classList.add('hidden');
  }, 5000);
}

function showDazeDialogue() {
  dialogueBubble.classList.add('hidden');
  const randomIndex = Math.floor(Math.random() * dazeDialogues.length);
  dialogueText.innerHTML = dazeDialogues[randomIndex];
  dialogueBubble.classList.remove('hidden');
  
  setTimeout(() => {
    dialogueBubble.classList.add('hidden');
  }, 6000); // Daze dialogue stays slightly longer
}

function dialogueRoutine() {
  if (currentState !== 'idle') return; // Only speak randomly in idle
  if (Math.random() < 0.4) {
    showRandomDialogue();
  }
}

// Start
init();
