// Elements
const petContainer = document.getElementById('pet-container');
const petCharacter = document.getElementById('pet-character');
const dialogueBubble = document.getElementById('dialogue-bubble');
const dialogueText = document.getElementById('dialogue-text');
const zzzContainer = document.getElementById('zzz-container');

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

function getAssetPath(fileName, partnerCharacter) {
  if (partnerCharacter) {
    return `assets/characters/${partnerCharacter}/${fileName}`;
  }
  return `assets/${fileName}`;
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

// Preload and process all assets
async function loadAndProcessAssets(partnerCharacter) {
  const imagesToProcess = [
    { key: 'idle', src: getAssetPath('pet_character.png', partnerCharacter) },
    { key: 'closed', src: getAssetPath('pet_character_closed_eyes.png', partnerCharacter) },
    { key: 'happy', src: getAssetPath('pet_character_happy.png', partnerCharacter) },
    { key: 'daze', src: getAssetPath('pet_character_daze.png', partnerCharacter) },
    { key: 'sleep', src: getAssetPath('pet_character_sleep.png', partnerCharacter) }
  ];

  for (const imgInfo of imagesToProcess) {
    processSingleImage(imgInfo.src, (dataUrl) => {
      if (imgInfo.key === 'idle') processedIdleUrl = dataUrl;
      else if (imgInfo.key === 'closed') processedClosedUrl = dataUrl;
      else if (imgInfo.key === 'happy') processedHappyUrl = dataUrl;
      else if (imgInfo.key === 'daze') processedDazeUrl = dataUrl;
      else if (imgInfo.key === 'sleep') processedSleepUrl = dataUrl;

      assetsLoadedCount++;
      // Apply the first image as default background once loaded
      if (imgInfo.key === 'idle') {
        updateCharacterBackground();
      }
    });
  }
}

// "Magic Wand" Background Removal (BFS Flood Fill starting from corners)
function processSingleImage(imgSrc, callback) {
  const tempImg = new Image();
  tempImg.src = imgSrc;
  tempImg.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = tempImg.naturalWidth;
      canvas.height = tempImg.naturalHeight;
      ctx.drawImage(tempImg, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;
      
      const visited = new Uint8Array(width * height);
      const queue = [];
      
      // Helper to check if pixel color is close to white background
      function isNearWhite(idx) {
        return data[idx] > 240 && data[idx + 1] > 240 && data[idx + 2] > 240;
      }
      
      // Seed queue with border pixels
      for (let x = 0; x < width; x++) {
        queue.push({ x, y: 0 });
        queue.push({ x, y: height - 1 });
        visited[x] = 1;
        visited[x + (height - 1) * width] = 1;
      }
      for (let y = 1; y < height - 1; y++) {
        queue.push({ x: 0, y });
        queue.push({ x: width - 1, y });
        visited[y * width] = 1;
        visited[width - 1 + y * width] = 1;
      }
      
      let head = 0;
      while (head < queue.length) {
        const { x, y } = queue[head++];
        const idx = (y * width + x) * 4;
        
        if (isNearWhite(idx)) {
          data[idx + 3] = 0;
          const neighbors = [
            { x: x - 1, y }, { x: x + 1, y },
            { x, y: y - 1 }, { x, y: y + 1 }
          ];
          for (const n of neighbors) {
            if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
              const vIdx = n.y * width + n.x;
              if (!visited[vIdx]) {
                 visited[vIdx] = 1;
                 queue.push(n);
              }
            }
          }
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL());
    } catch (e) {
      console.error("Background removal canvas error:", e);
      callback(imgSrc);
    }
  };

  tempImg.onerror = () => {
    console.warn("Failed to load asset, trying fallback:", imgSrc);
    // If it is not the main idle image, fall back to the main idle image
    if (!imgSrc.endsWith('pet_character.png')) {
      const fallbackSrc = imgSrc.replace(/_(daze|happy|sleep|closed_eyes)\.png$/, '.png');
      if (fallbackSrc !== imgSrc) {
        processSingleImage(fallbackSrc, callback);
        return;
      }
    }
    callback(imgSrc);
  };
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
  setInterval(dialogueRoutine, 15000);

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
    config = newConfig;
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
      startBlinkLoop();
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
  setInterval(() => {
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
