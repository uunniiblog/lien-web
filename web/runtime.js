import { LienVM } from './vm.js?v=20261008-19';
import {
  deleteSave, getSetting, listReadMessages, listSaves, markMessageRead as persistMessageRead,
  putSave, putSetting, exportStoredData, replaceStoredData,
} from './save-store.js?v=20261007-13';

const stage = document.querySelector('#stage');
const stageWrap = document.querySelector('.stage-wrap');
const context = stage.getContext('2d', { alpha: false });
const choiceLayer = document.querySelector('#choice-layer');
const stateNode = document.querySelector('#runtime-state');
const stageMessage = document.querySelector('#stage-message');
const startButton = document.querySelector('#start-game');
const inspector = document.querySelector('#inspector');
const toggleInspector = document.querySelector('#toggle-inspector');
const closeInspector = document.querySelector('#close-inspector');
const archiveStats = document.querySelector('#archive-stats');
const trace = document.querySelector('#trace');
const traceTitle = document.querySelector('#trace-title');
const dialogueBox = document.querySelector('#dialogue-box');
const dialogueName = document.querySelector('#dialogue-name');
const dialogueText = document.querySelector('#dialogue-text');
const transitionCover = document.querySelector('#transition-cover');
const systemBar = document.querySelector('#game-system-bar');
const systemActions = document.querySelector('#game-system-actions');
const backlogPopup = document.querySelector('#backlog-popup');
const backlogList = document.querySelector('#backlog-list');
const resetBacklogSize = document.querySelector('#reset-backlog-size');
const settingsPopup = document.querySelector('#settings-popup');
const resetSettings = document.querySelector('#reset-settings');
const skipReadOnly = document.querySelector('#skip-read-only');
const continueVoice = document.querySelector('#continue-voice');
const textSpeed = document.querySelector('#text-speed');
const textSpeedValue = document.querySelector('#text-speed-value');
const textboxTransparency = document.querySelector('#textbox-transparency');
const textboxTransparencyValue = document.querySelector('#textbox-transparency-value');
const bgmVolume = document.querySelector('#bgm-volume');
const voiceVolume = document.querySelector('#voice-volume');
const effectVolume = document.querySelector('#effect-volume');
const bgmVolumeValue = document.querySelector('#bgm-volume-value');
const voiceVolumeValue = document.querySelector('#voice-volume-value');
const effectVolumeValue = document.querySelector('#effect-volume-value');
const renderScale = document.querySelector('#render-scale');
const renderScaleValue = document.querySelector('#render-scale-value');
const exportSavesButton = document.querySelector('#export-saves');
const importSavesButton = document.querySelector('#import-saves');
const importSavesFile = document.querySelector('#import-saves-file');
const saveTransferStatus = document.querySelector('#save-transfer-status');
const saveDialog = document.querySelector('#save-dialog');
const saveDialogTitle = document.querySelector('#save-dialog-title');
const saveTab = document.querySelector('#save-tab');
const loadTab = document.querySelector('#load-tab');
const saveStatus = document.querySelector('#save-status');
const saveGrid = document.querySelector('#save-grid');
const saveButton = document.querySelector('[data-action="save"]');
const loadButton = document.querySelector('[data-action="load"]');
const backlogButton = document.querySelector('[data-action="backlog"]');
const skipButton = document.querySelector('[data-action="skip"]');
const settingsButton = document.querySelector('[data-action="settings"]');
const systemSkipButton = document.querySelector('[data-system-action="skip"]');
const systemGhostButton = document.querySelector('[data-system-action="ghost"]');

const SAVE_SLOTS = 20;
const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 480;
const RUNTIME_BUILD = '20261008-19';
const VOICE_PREAMP = 3;
const DEFAULT_BACKLOG_POSITION = Object.freeze({ x: 0.5, y: 9 / 38 });
const DEFAULT_SETTINGS = Object.freeze({
  skipReadOnly: true,
  continueVoice: true,
  bgmVolume: 65,
  voiceVolume: 100,
  effectVolume: 100,
  renderScale: 1,
  textSpeed: 100,
  textboxTransparency: 0,
});

const TITLE_ITEMS = [
  { id: 'new', x: 55, y: 218, width: 241, height: 34, spriteY: 0 },
  { id: 'continue', x: 55, y: 269, width: 241, height: 34, spriteY: 51 },
  { id: 'extras', x: 55, y: 319, width: 241, height: 34, spriteY: 101 },
  { id: 'exit', x: 55, y: 370, width: 241, height: 34, spriteY: 152 },
];

const runtime = {
  manifest: null,
  scenario: null,
  screen: 'cover',
  hover: null,
  images: new Map(),
  music: null,
  musicName: null,
  voice: null,
  voiceFinished: null,
  voiceContext: null,
  voiceSource: null,
  voiceGain: null,
  voiceCompressor: null,
  effects: new Set(),
  executionTrace: [],
  vm: null,
  saveMode: 'save',
  previewUrls: [],
  readMessages: new Set(),
  globalFlags: new Uint8Array(8192),
  decisions: new Map(),
  skipMode: false,
  skipTimer: null,
  settings: { ...DEFAULT_SETTINGS },
  backlogPosition: { ...DEFAULT_BACKLOG_POSITION },
  backlogSize: null,
  settingsSize: null,
  textRevealTimer: null,
  textRevealCharacters: [],
  textRevealIndex: 0,
  messageInterfaceHidden: false,
  releaseCoverOnTransition: false,
  setState(kind, message) {
    stateNode.className = `runtime-state ${kind}`;
    stateNode.lastElementChild.textContent = message;
  },
};

function flagBank(value) {
  const bank = new Uint8Array(8192);
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    bank.set(new Uint8Array(value).subarray(0, bank.length));
  }
  return bank;
}

async function saveGlobalFlags(start, end, values) {
  const limit = Math.min(end, runtime.globalFlags.length, start + values.length);
  for (let index = Math.max(0, start); index < limit; index += 1) {
    // These are original GAME.SAV unlocks. Never let an older slot clear one.
    if (values[index - start]) runtime.globalFlags[index] = 1;
  }
  await putSetting('globalFlags', runtime.globalFlags.slice());
}

function showGhostAction(available) {
  systemGhostButton.disabled = !available;
  systemGhostButton.classList.toggle('ghost-action-available', available);
  systemGhostButton.setAttribute('aria-hidden', String(!available));
  systemGhostButton.title = available
    ? 'Ghost action available'
    : 'Ghost action is not available during this line';
}

function reportRuntimeError(error) {
  console.error('[Lien runtime]', error);
  runtime.setState('error', error instanceof Error ? error.message : String(error));
  runtimeLog('error', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : '',
    traceTail: runtime.executionTrace.slice(-8),
  });
}

function runtimeLog(event, detail = {}) {
  const payload = {
    build: RUNTIME_BUILD,
    clientTimeMs: Math.round(performance.now()),
    wallTime: new Date().toISOString(),
    ...detail,
  };
  console.info(`[Lien runtime] ${event}`, payload);
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, detail: payload }),
    keepalive: true,
  }).catch(() => {});
}

function clearTransitionCover() {
  for (const animation of transitionCover.getAnimations()) animation.cancel();
  transitionCover.style.opacity = '0';
  transitionCover.hidden = true;
}

async function animateTransitionCover(opaque, duration, reason) {
  const from = Number.parseFloat(getComputedStyle(transitionCover).opacity) || 0;
  const to = opaque ? 1 : 0;
  transitionCover.hidden = false;
  const started = performance.now();
  runtimeLog('handoff', { phase: 'start', reason, from, to, duration });
  const animation = transitionCover.animate(
    [{ opacity: from }, { opacity: to }],
    { duration, easing: 'linear', fill: 'forwards' },
  );
  try {
    await animation.finished;
  } catch {
    // A newer handoff superseded this one.
  }
  // Commit the final value as an inline style and remove the filled animation
  // so a later frame-synchronized handoff can adjust opacity immediately.
  animation.cancel();
  transitionCover.style.opacity = String(to);
  if (!opaque) transitionCover.hidden = true;
  runtimeLog('handoff', {
    phase: 'end', reason, from, to, duration,
    elapsed: performance.now() - started,
  });
}

let newGameWarmup = null;
function warmNewGameAssets() {
  if (newGameWarmup) return newGameWarmup;
  newGameWarmup = (async () => {
    const started = performance.now();
    const openingNames = [
      'LOAD.isf', 'EV_SET.isf', 'VRAM_CLR.isf', 'MAIN.isf',
      'NT_OP01.isf', 'TUKI_OFF.isf', 'MSC_LOD.isf',
    ];
    const scenarios = await Promise.all(openingNames.map(fetchScenario));
    const assets = [...new Set(scenarios.flatMap(scenario => {
      const firstTransition = scenario.operations.findIndex(operation => (
        operation.opcode === 0x57
        && Number.parseInt(operation.dataHex.slice(0, 2), 16) === 0x13
      ));
      const operations = scenario.name.toUpperCase() === 'NT_OP01.ISF' && firstTransition >= 0
        ? scenario.operations.slice(0, firstTransition + 1)
        : scenario.operations;
      return operations
        .filter(operation => operation.opcode === 0x56 && operation.text)
        .map(operation => `${operation.text}.GGD`);
    }))];
    const results = await Promise.allSettled(assets.map(loadImage));
    const failed = results.flatMap((result, index) => result.status === 'rejected'
      ? [{ asset: assets[index], error: String(result.reason) }]
      : []);
    runtimeLog('new-game-warmup', {
      assets: assets.length,
      failed,
      elapsed: performance.now() - started,
    });
    return scenarios;
  })();
  return newGameWarmup;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encodePortable(value) {
  if (value instanceof Blob) {
    return {
      $lienType: 'Blob',
      mime: value.type,
      data: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
    };
  }
  if (value instanceof ArrayBuffer) {
    return { $lienType: 'ArrayBuffer', data: bytesToBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { $lienType: value.constructor.name, data: bytesToBase64(bytes) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodePortable));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await encodePortable(item)]));
    return Object.fromEntries(entries);
  }
  return value;
}

function decodePortable(value) {
  if (Array.isArray(value)) return value.map(decodePortable);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.$lienType === 'string' && typeof value.data === 'string') {
    const bytes = base64ToBytes(value.data);
    if (value.$lienType === 'Blob') return new Blob([bytes], { type: value.mime || '' });
    if (value.$lienType === 'ArrayBuffer') return bytes.buffer;
    const constructors = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };
    const Constructor = constructors[value.$lienType];
    if (!Constructor) throw new Error(`Unsupported binary value ${value.$lienType}`);
    return new Constructor(bytes.buffer);
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    output[key] = decodePortable(item);
  }
  return output;
}

function validateImportedData(data) {
  if (!data || !Array.isArray(data.saves) || !Array.isArray(data.meta)) throw new Error('Archive does not contain Lien save data');
  const slots = new Set();
  for (const record of data.saves) {
    if (!record || !Number.isInteger(record.slot) || record.slot < 1 || record.slot > SAVE_SLOTS) {
      throw new Error('Archive contains an invalid save slot');
    }
    if (slots.has(record.slot)) throw new Error(`Archive contains duplicate slot ${record.slot}`);
    if (!record.state || record.state.version !== 1) throw new Error(`Slot ${record.slot} uses an unsupported save format`);
    slots.add(record.slot);
  }
  for (const record of data.meta) {
    if (!record || typeof record.key !== 'string') throw new Error('Archive contains invalid global data');
  }
  return data;
}

async function exportSaves() {
  exportSavesButton.disabled = true;
  saveTransferStatus.textContent = 'Preparing portable save archive…';
  try {
    const stored = await exportStoredData();
    const payload = {
      format: 'lien-preservation-save',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: await encodePortable(stored),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lien-saves-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveTransferStatus.textContent = `Exported ${stored.saves.length} save slot${stored.saves.length === 1 ? '' : 's'} and global data.`;
  } catch (error) {
    saveTransferStatus.textContent = `Export failed: ${error.message}`;
  } finally {
    exportSavesButton.disabled = false;
  }
}

async function importSaves(file) {
  importSavesButton.disabled = true;
  saveTransferStatus.textContent = `Reading ${file.name}…`;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== 'lien-preservation-save' || payload.version !== 1) {
      throw new Error('This is not a supported Lien preservation save archive');
    }
    const data = validateImportedData(decodePortable(payload.data));
    const confirmed = window.confirm(
      `Import ${data.saves.length} save slot${data.saves.length === 1 ? '' : 's'}? This replaces all saves, read history, and settings in this browser.`,
    );
    if (!confirmed) {
      saveTransferStatus.textContent = 'Import cancelled.';
      return;
    }
    await replaceStoredData(data);
    saveTransferStatus.textContent = 'Import complete. Reloading…';
    window.location.reload();
  } catch (error) {
    saveTransferStatus.textContent = `Import failed: ${error.message}`;
  } finally {
    importSavesButton.disabled = false;
    importSavesFile.value = '';
  }
}

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  return response;
}

async function loadImage(name) {
  const key = name.toUpperCase();
  if (runtime.images.has(key)) return runtime.images.get(key);
  const pending = (async () => {
    const response = await api(`/api/image/${encodeURIComponent(name)}`);
    const blob = await response.blob();
    const decoded = 'createImageBitmap' in window
      ? createImageBitmap(blob)
      : new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        image.addEventListener('load', () => {
          URL.revokeObjectURL(url);
          resolve(image);
        }, { once: true });
        image.addEventListener('error', () => {
          URL.revokeObjectURL(url);
          reject(new Error(`Could not decode ${name}`));
        }, { once: true });
        image.src = url;
      });
    return Promise.race([
      decoded,
      new Promise((_, reject) => window.setTimeout(
        () => reject(new Error(`Timed out decoding ${name}`)),
        15000,
      )),
    ]);
  })().catch(error => {
    runtime.images.delete(key);
    throw error;
  });
  runtime.images.set(key, pending);
  return pending;
}

function paint(image) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#000';
  context.fillRect(0, 0, stage.width, stage.height);
  context.setTransform(runtime.settings.renderScale, 0, 0, runtime.settings.renderScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0);
}

function renderStats(manifest) {
  archiveStats.replaceChildren();
  for (const [name, archive] of Object.entries(manifest.archives)) {
    const term = document.createElement('dt');
    term.textContent = name;
    const value = document.createElement('dd');
    value.textContent = `${archive.count.toLocaleString()} files`;
    archiveStats.append(term, value);
  }
}

function renderTrace(scenario) {
  runtime.scenario = scenario;
  traceTitle.textContent = scenario.name;
  trace.replaceChildren();
  for (const item of scenario.operations.slice(0, 240)) {
    const row = document.createElement('div');
    row.className = 'trace-line';
    const offset = document.createElement('code');
    offset.textContent = item.offset.toString(16).padStart(6, '0');
    const content = document.createElement('span');
    content.textContent = item.text ? `${item.name} · ${item.text}` : item.name;
    content.title = item.dataHex;
    row.append(offset, content);
    trace.append(row);
  }
}

async function loadScenario(name) {
  const response = await api(`/api/scenario/${encodeURIComponent(name)}`);
  const scenario = await response.json();
  renderTrace(scenario);
  return scenario;
}

async function fetchScenario(name) {
  const response = await api(`/api/scenario/${encodeURIComponent(name)}`);
  return response.json();
}

function showMessage(title, body) {
  stageMessage.querySelector('.eyebrow').textContent = 'Preservation runtime';
  stageMessage.querySelector('h2').textContent = title;
  stageMessage.querySelector('p:last-child').textContent = body;
  stageMessage.hidden = false;
}

function hideMessage() {
  stageMessage.hidden = true;
}

async function playMusic(name) {
  if (runtime.music) runtime.music.pause();
  const audio = new Audio(`/api/audio/WMSC/${encodeURIComponent(name)}`);
  audio.loop = true;
  audio.volume = runtime.settings.bgmVolume / 100;
  runtime.music = audio;
  runtime.musicName = name;
  try { await audio.play(); } catch {
    runtime.setState('ready', 'Title ready · click once to enable audio');
  }
}

function stopMusic() {
  if (!runtime.music) return;
  runtime.music.pause();
  runtime.music.currentTime = 0;
  runtime.music = null;
  runtime.musicName = null;
}

function playVoice(name) {
  if (runtime.voice) runtime.voice.pause();
  if (runtime.voiceFinished) runtime.voiceFinished();
  const filename = name.toLowerCase().endsWith('.wav') ? name : `${name}.WAV`;
  const voice = new Audio(`/api/audio/VOICE/${encodeURIComponent(filename)}`);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    runtime.voiceContext ||= new AudioContextClass();
    const source = runtime.voiceContext.createMediaElementSource(voice);
    const gain = runtime.voiceContext.createGain();
    const compressor = runtime.voiceContext.createDynamicsCompressor();
    gain.gain.value = runtime.settings.voiceVolume / 100 * VOICE_PREAMP;
    compressor.threshold.value = -4;
    compressor.knee.value = 4;
    compressor.ratio.value = 16;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    source.connect(gain).connect(compressor).connect(runtime.voiceContext.destination);
    runtime.voiceSource = source;
    runtime.voiceGain = gain;
    runtime.voiceCompressor = compressor;
    voice.volume = 1;
    void runtime.voiceContext.resume().catch(() => {});
  } else {
    voice.volume = runtime.settings.voiceVolume / 100;
    runtime.voiceGain = null;
    runtime.voiceCompressor = null;
  }
  runtime.voice = voice;
  return new Promise(resolve => {
    const finish = () => {
      if (runtime.voiceFinished === finish) runtime.voiceFinished = null;
      resolve();
    };
    runtime.voiceFinished = finish;
    voice.addEventListener('ended', finish, { once: true });
    voice.addEventListener('error', finish, { once: true });
    voice.play().catch(finish);
  });
}

function stopVoice() {
  if (!runtime.voice) return;
  runtime.voice.pause();
  runtime.voice.currentTime = 0;
  runtime.voice = null;
  runtime.voiceSource = null;
  runtime.voiceGain = null;
  runtime.voiceCompressor = null;
  if (runtime.voiceFinished) runtime.voiceFinished();
}

function playEffect(name) {
  const filename = name.toLowerCase().endsWith('.wav') ? name : `${name}.wav`;
  // Ikura exposes a single sound-effect channel. Reusing that model also
  // prevents PulseAudio/PipeWire from accumulating a new browser stream when
  // a script rapidly retriggers the same transition effect.
  stopEffects();
  const effect = new Audio(`/api/audio/SE/${encodeURIComponent(filename)}`);
  effect.volume = runtime.settings.effectVolume / 100;
  runtime.effects.add(effect);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    runtime.effects.delete(effect);
  };
  effect.addEventListener('ended', release, { once: true });
  effect.addEventListener('error', release, { once: true });
  void effect.play().then(() => {}, release);
}

function stopEffects() {
  for (const effect of runtime.effects) {
    effect.pause();
    effect.currentTime = 0;
  }
  runtime.effects.clear();
}

function cancelTextReveal() {
  if (runtime.textRevealTimer !== null) {
    clearInterval(runtime.textRevealTimer);
    runtime.textRevealTimer = null;
  }
}

function finishTextReveal() {
  if (runtime.textRevealTimer === null) return false;
  cancelTextReveal();
  runtime.textRevealIndex = runtime.textRevealCharacters.length;
  dialogueText.textContent = runtime.textRevealCharacters.join('');
  return true;
}

function beginTextReveal(text) {
  cancelTextReveal();
  runtime.textRevealCharacters = Array.from(text);
  runtime.textRevealIndex = 0;
  if (runtime.settings.textSpeed >= 100 || runtime.skipMode || !runtime.textRevealCharacters.length) {
    dialogueText.textContent = text;
    runtime.textRevealIndex = runtime.textRevealCharacters.length;
    return;
  }
  dialogueText.textContent = '';
  const charactersPerSecond = 8 + runtime.settings.textSpeed * .92;
  const interval = Math.max(10, Math.round(1000 / charactersPerSecond));
  runtime.textRevealTimer = window.setInterval(() => {
    runtime.textRevealIndex += 1;
    dialogueText.textContent = runtime.textRevealCharacters.slice(0, runtime.textRevealIndex).join('');
    if (runtime.textRevealIndex >= runtime.textRevealCharacters.length) cancelTextReveal();
  }, interval);
}

function showDialogue(name, text) {
  runtime.messageInterfaceHidden = false;
  dialogueName.textContent = name;
  dialogueName.hidden = !name;
  beginTextReveal(text);
  dialogueBox.hidden = false;
  systemBar.hidden = false;
  systemActions.hidden = false;
}

function hideDialogue() {
  cancelTextReveal();
  runtime.messageInterfaceHidden = false;
  dialogueBox.hidden = true;
  systemBar.hidden = true;
  systemActions.hidden = true;
}

function renderChoices(handlers) {
  choiceLayer.replaceChildren();
  for (const handler of handlers.filter(item => item.enabled)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-target';
    button.style.left = `${handler.x1 / LOGICAL_WIDTH * 100}%`;
    button.style.top = `${handler.y1 / LOGICAL_HEIGHT * 100}%`;
    button.style.width = `${(handler.x2 - handler.x1) / LOGICAL_WIDTH * 100}%`;
    button.style.height = `${(handler.y2 - handler.y1) / LOGICAL_HEIGHT * 100}%`;
    button.setAttribute('aria-label', `Destination ${handler.id + 1}`);
    if (handler.text) {
      button.classList.add('choice-command');
      button.lang = 'ja';
      button.textContent = handler.text;
      button.setAttribute('aria-label', handler.text);
    }
    button.addEventListener('pointerenter', () => {
      runtime.vm?.hoverChoice(handler.id).catch(reportRuntimeError);
    });
    // The choice layer itself is intentionally pointer-transparent so the
    // map remains clickable.  Some browsers consequently do not dispatch a
    // reliable pointerleave on the parent after it has been rebuilt.  Track
    // it on each active hit target as well, so every hover cycle can clear
    // the destination label when the pointer leaves the character.
    button.addEventListener('pointerleave', event => {
      if (!choiceLayer.contains(event.relatedTarget)) {
        runtime.vm?.clearChoiceHover().catch(reportRuntimeError);
      }
    });
    button.addEventListener('focus', () => {
      runtime.vm?.hoverChoice(handler.id).catch(reportRuntimeError);
    });
    button.addEventListener('click', event => {
      event.stopPropagation();
      const kind = runtime.vm?.choice?.kind === 'command' ? 'dialogue' : 'map';
      runtime.vm?.selectDecision(kind, handler.id).catch(reportRuntimeError);
    });
    choiceLayer.append(button);
  }
  choiceLayer.hidden = false;
}

choiceLayer.addEventListener('pointerleave', event => {
  if (!choiceLayer.contains(event.relatedTarget)) {
    runtime.vm?.clearChoiceHover().catch(reportRuntimeError);
  }
});

function hideChoices() {
  choiceLayer.hidden = true;
  choiceLayer.replaceChildren();
}

function setMessageInterfaceHidden(hidden) {
  if (runtime.screen !== 'prologue' || !runtime.vm?.waiting) return;
  runtime.messageInterfaceHidden = Boolean(hidden);
  if (runtime.messageInterfaceHidden) {
    setSkipMode(false);
    dialogueBox.hidden = true;
    systemBar.hidden = true;
    systemActions.hidden = true;
    runtime.vm.presentBackground();
  } else {
    runtime.vm.present();
    dialogueBox.hidden = false;
    systemBar.hidden = false;
    systemActions.hidden = false;
  }
}

function closeGamePopups() {
  backlogPopup.hidden = true;
  settingsPopup.hidden = true;
}

function gamePopupOpen() {
  return !backlogPopup.hidden || !settingsPopup.hidden;
}

function renderBacklog(entries = runtime.vm?.backlog || []) {
  backlogList.replaceChildren();
  const visibleEntries = entries.slice(-100);
  const firstIndex = entries.length - visibleEntries.length;
  visibleEntries.forEach((entry, visibleIndex) => {
    const entryIndex = firstIndex + visibleIndex;
    const item = document.createElement('li');
    item.className = 'backlog-entry';
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'backlog-jump';
    jump.textContent = 'Jump Back';
    jump.disabled = !entry.checkpoint;
    jump.title = entry.checkpoint
      ? 'Return the game and backlog to this line'
      : 'Jump Back is unavailable for history restored from an older save';
    jump.addEventListener('click', event => {
      event.stopPropagation();
      jumpToBacklogEntry(entryIndex, entry, jump).catch(reportRuntimeError);
    });
    const portrait = document.createElement('span');
    portrait.className = 'backlog-portrait';
    if (entry.portrait) {
      const image = document.createElement('img');
      image.src = `/api/image/${encodeURIComponent(entry.portrait)}.GGD`;
      image.alt = '';
      image.loading = 'lazy';
      portrait.append(image);
    }
    const speakerCell = document.createElement('span');
    speakerCell.className = 'backlog-speaker-cell';
    const speaker = document.createElement('span');
    speaker.className = 'backlog-speaker';
    speaker.textContent = entry.speaker || '—';
    speakerCell.append(speaker);
    if (entry.voice) {
      const repeat = document.createElement('button');
      repeat.type = 'button';
      repeat.className = 'backlog-voice-repeat';
      repeat.title = `Replay voice ${entry.voice}`;
      repeat.setAttribute('aria-label', `Replay voiced line by ${entry.speaker || 'speaker'}`);
      const icon = document.createElement('img');
      icon.src = '/ui-assets/voice-repeat.svg';
      icon.alt = '';
      repeat.append(icon);
      repeat.addEventListener('click', event => {
        event.stopPropagation();
        playVoice(entry.voice);
      });
      speakerCell.append(repeat);
    }
    const text = document.createElement('span');
    text.className = 'backlog-text';
    text.textContent = entry.text;
    item.append(jump, portrait, speakerCell, text);
    backlogList.append(item);
  });
  if (!backlogPopup.hidden) requestAnimationFrame(() => { backlogList.scrollTop = backlogList.scrollHeight; });
}

async function jumpToBacklogEntry(index, entry, button) {
  if (!runtime.vm || !entry.checkpoint) return;
  button.disabled = true;
  button.textContent = 'Loading…';
  const retainedBacklog = runtime.vm.backlog.slice(0, index + 1);
  const state = await entry.checkpoint;
  if (!state) throw new Error(entry.checkpointError || 'Could not restore this backlog line');
  setSkipMode(false);
  stopMusic();
  stopVoice();
  stopEffects();
  await runtime.vm.importState(state);
  runtime.vm.backlog = retainedBacklog;
  runtime.vm.onBacklogChange(retainedBacklog);
  if (state.externalState?.musicName) {
    await playMusic(state.externalState.musicName);
    try { runtime.music.currentTime = state.externalState.musicTime || 0; } catch {}
  }
  backlogPopup.hidden = true;
  runtime.setState('ready', `${runtime.vm.current()?.scenario.name || 'Scenario'} · restored from backlog`);
  runtimeLog('backlog-jump', {
    index,
    scenario: runtime.vm.current()?.scenario.name,
    frames: runtime.vm.frames.map(frame => ({ scenario: frame.scenario.name, ip: frame.ip })),
  });
}

function openBacklog() {
  setSkipMode(false);
  settingsPopup.hidden = true;
  renderBacklog();
  backlogPopup.hidden = false;
  requestAnimationFrame(() => {
    applyBacklogSize();
    applyBacklogPosition();
    backlogList.scrollTop = backlogList.scrollHeight;
  });
}

function backlogAtNewest() {
  return backlogList.scrollTop + backlogList.clientHeight >= backlogList.scrollHeight - 2;
}

function applyBacklogPosition() {
  if (backlogPopup.hidden) return;
  const availableX = Math.max(0, stageWrap.clientWidth - backlogPopup.offsetWidth);
  const availableY = Math.max(0, stageWrap.clientHeight - backlogPopup.offsetHeight);
  backlogPopup.style.left = `${availableX * runtime.backlogPosition.x}px`;
  backlogPopup.style.top = `${availableY * runtime.backlogPosition.y}px`;
}

function applyBacklogSize() {
  if (!runtime.backlogSize) {
    backlogPopup.style.removeProperty('width');
    backlogPopup.style.removeProperty('height');
    return;
  }
  backlogPopup.style.width = `${stageWrap.clientWidth * runtime.backlogSize.width}px`;
  backlogPopup.style.height = `${stageWrap.clientHeight * runtime.backlogSize.height}px`;
}

function saveBacklogSize() {
  if (backlogPopup.hidden) return;
  runtime.backlogSize = {
    width: Math.min(1, Math.max(0.42, backlogPopup.offsetWidth / stageWrap.clientWidth)),
    height: Math.min(1, Math.max(0.34, backlogPopup.offsetHeight / stageWrap.clientHeight)),
  };
  putSetting('backlogSize', runtime.backlogSize).catch(() => {});
}

function resetBacklogWindow() {
  runtime.backlogSize = null;
  runtime.backlogPosition = { ...DEFAULT_BACKLOG_POSITION };
  backlogPopup.style.removeProperty('width');
  backlogPopup.style.removeProperty('height');
  putSetting('backlogSize', null).catch(() => {});
  putSetting('backlogPosition', runtime.backlogPosition).catch(() => {});
  applyBacklogPosition();
}

function saveBacklogPosition() {
  const availableX = Math.max(1, stageWrap.clientWidth - backlogPopup.offsetWidth);
  const availableY = Math.max(1, stageWrap.clientHeight - backlogPopup.offsetHeight);
  const left = Number.parseFloat(backlogPopup.style.left) || 0;
  const top = Number.parseFloat(backlogPopup.style.top) || 0;
  runtime.backlogPosition = {
    x: Math.min(1, Math.max(0, left / availableX)),
    y: Math.min(1, Math.max(0, top / availableY)),
  };
  putSetting('backlogPosition', runtime.backlogPosition).catch(() => {});
}

function setVolume(kind, value, persist = true) {
  const amount = Math.min(100, Math.max(0, Number(value)));
  runtime.settings[`${kind}Volume`] = amount;
  const controls = {
    bgm: [bgmVolume, bgmVolumeValue],
    voice: [voiceVolume, voiceVolumeValue],
    effect: [effectVolume, effectVolumeValue],
  };
  const [input, output] = controls[kind];
  input.value = String(amount);
  output.value = `${amount}%`;
  output.textContent = `${amount}%`;
  if (kind === 'bgm' && runtime.music) runtime.music.volume = amount / 100;
  if (kind === 'voice' && runtime.voiceGain) {
    runtime.voiceGain.gain.value = amount / 100 * VOICE_PREAMP;
  } else if (kind === 'voice' && runtime.voice) {
    runtime.voice.volume = amount / 100;
  }
  if (kind === 'effect') {
    for (const effect of runtime.effects) effect.volume = amount / 100;
  }
  if (persist) putSetting(`${kind}Volume`, amount).catch(() => {});
}

function setRenderScale(value, persist = true, repaint = true) {
  const amount = Math.round(Math.min(4, Math.max(1, Number(value))) * 4) / 4;
  runtime.settings.renderScale = amount;
  renderScale.value = String(amount);
  const width = Math.round(LOGICAL_WIDTH * amount);
  const height = Math.round(LOGICAL_HEIGHT * amount);
  const scaleLabel = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2).replace(/0$/, '');
  renderScaleValue.value = `${scaleLabel}× · ${width}×${height}`;
  renderScaleValue.textContent = renderScaleValue.value;

  stage.width = width;
  stage.height = height;
  stageWrap.style.width = `${width}px`;
  context.setTransform(amount, 0, 0, amount, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (repaint) {
    if (runtime.vm) runtime.vm.present();
    else if (runtime.screen === 'title') drawTitle().catch(reportRuntimeError);
    else loadImage('TITLE.GGD').then(paint).catch(reportRuntimeError);
  }
  if (persist) putSetting('renderScale', amount).catch(() => {});
}

function setTextSpeed(value, persist = true) {
  const amount = Math.round(Math.min(100, Math.max(0, Number(value))) / 5) * 5;
  runtime.settings.textSpeed = amount;
  textSpeed.value = String(amount);
  textSpeedValue.value = amount >= 100 ? 'Instant' : `${Math.round(8 + amount * .92)} chars/sec`;
  textSpeedValue.textContent = textSpeedValue.value;
  if (amount >= 100) finishTextReveal();
  if (persist) putSetting('textSpeed', amount).catch(() => {});
}

function setTextboxTransparency(value, persist = true) {
  const amount = Math.round(Math.min(100, Math.max(0, Number(value))));
  runtime.settings.textboxTransparency = amount;
  textboxTransparency.value = String(amount);
  textboxTransparencyValue.value = `${amount}%`;
  textboxTransparencyValue.textContent = textboxTransparencyValue.value;
  dialogueBox.style.setProperty('--textbox-layer-opacity', (1 - amount / 100).toFixed(3));
  if (persist) putSetting('textboxTransparency', amount).catch(() => {});
}

function applySettingsSize() {
  if (settingsPopup.hidden) return;
  if (!runtime.settingsSize) {
    settingsPopup.style.removeProperty('width');
    settingsPopup.style.removeProperty('height');
    return;
  }
  settingsPopup.style.width = `${stageWrap.clientWidth * runtime.settingsSize.width}px`;
  settingsPopup.style.height = `${stageWrap.clientHeight * runtime.settingsSize.height}px`;
}

function saveSettingsSize() {
  if (settingsPopup.hidden) return;
  runtime.settingsSize = {
    width: Math.min(.9, Math.max(.52, settingsPopup.offsetWidth / stageWrap.clientWidth)),
    height: Math.min(.94, Math.max(.45, settingsPopup.offsetHeight / stageWrap.clientHeight)),
  };
  putSetting('settingsSize', runtime.settingsSize).catch(() => {});
}

function resetRuntimeSettings() {
  runtime.settings.skipReadOnly = DEFAULT_SETTINGS.skipReadOnly;
  skipReadOnly.checked = DEFAULT_SETTINGS.skipReadOnly;
  runtime.settings.continueVoice = DEFAULT_SETTINGS.continueVoice;
  continueVoice.checked = DEFAULT_SETTINGS.continueVoice;
  setVolume('bgm', DEFAULT_SETTINGS.bgmVolume);
  setVolume('voice', DEFAULT_SETTINGS.voiceVolume);
  setVolume('effect', DEFAULT_SETTINGS.effectVolume);
  setRenderScale(DEFAULT_SETTINGS.renderScale);
  setTextSpeed(DEFAULT_SETTINGS.textSpeed);
  setTextboxTransparency(DEFAULT_SETTINGS.textboxTransparency);
  putSetting('skipReadOnly', DEFAULT_SETTINGS.skipReadOnly).catch(() => {});
  putSetting('continueVoice', DEFAULT_SETTINGS.continueVoice).catch(() => {});
  runtime.settingsSize = null;
  settingsPopup.style.removeProperty('width');
  settingsPopup.style.removeProperty('height');
  putSetting('settingsSize', null).catch(() => {});
}

function setSkipMode(enabled) {
  runtime.skipMode = enabled;
  skipButton.setAttribute('aria-pressed', String(enabled));
  systemSkipButton.setAttribute('aria-pressed', String(enabled));
  if (!enabled && runtime.skipTimer !== null) {
    clearTimeout(runtime.skipTimer);
    runtime.skipTimer = null;
  }
}

function scheduleSkip({ wasRead }) {
  if (!runtime.skipMode || gamePopupOpen() || saveDialog.open) return;
  if (runtime.settings.skipReadOnly && !wasRead) {
    setSkipMode(false);
    runtime.setState('ready', 'Skip stopped at unread dialogue');
    return;
  }
  if (runtime.skipTimer !== null) clearTimeout(runtime.skipTimer);
  runtime.skipTimer = window.setTimeout(() => {
    runtime.skipTimer = null;
    runtime.vm?.advance().catch(reportRuntimeError);
  }, 85);
}

function toggleSkip() {
  setSkipMode(!runtime.skipMode);
  if (runtime.skipMode && runtime.vm?.waiting) {
    scheduleSkip({ wasRead: runtime.vm.currentMessageWasRead });
  }
}

function advanceDialogue() {
  if (runtime.messageInterfaceHidden) {
    setMessageInterfaceHidden(false);
    return Promise.resolve();
  }
  if (runtime.skipTimer !== null) {
    clearTimeout(runtime.skipTimer);
    runtime.skipTimer = null;
  }
  if (finishTextReveal()) return Promise.resolve();
  return runtime.vm?.advance();
}

function paginateDialogue(name, text) {
  const previous = {
    boxHidden: dialogueBox.hidden,
    name: dialogueName.textContent,
    nameHidden: dialogueName.hidden,
    text: dialogueText.textContent,
  };
  dialogueBox.classList.add('measuring');
  dialogueBox.hidden = false;
  dialogueName.textContent = name;
  dialogueName.hidden = !name;

  const characters = Array.from(text);
  const pages = [];
  let start = 0;
  const fits = end => {
    dialogueText.textContent = characters.slice(start, end).join('');
    return dialogueText.scrollHeight <= dialogueText.clientHeight + 1;
  };
  while (start < characters.length) {
    let low = start + 1;
    let high = characters.length;
    let best = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(middle)) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    pages.push(characters.slice(start, best).join(''));
    start = best;
  }

  dialogueName.textContent = previous.name;
  dialogueName.hidden = previous.nameHidden;
  dialogueText.textContent = previous.text;
  dialogueBox.hidden = previous.boxHidden;
  dialogueBox.classList.remove('measuring');
  return pages.length ? pages : [''];
}

function makeVM() {
  return new LienVM({
    stage,
    fetchScenario,
    fetchImage: loadImage,
    onScenario(scenario) {
      renderTrace(scenario);
      runtimeLog('scenario', {
        name: scenario.name,
        frames: runtime.vm?.frames.map(frame => ({
          scenario: frame.scenario.name,
          ip: frame.ip,
          calls: frame.calls.length,
        })) || [],
      });
    },
    onDialogue: showDialogue,
    onDialogueClose: hideDialogue,
    paginateDialogue,
    isMessageRead: id => runtime.readMessages.has(id),
    markMessageRead(id) {
      if (runtime.readMessages.has(id)) return;
      runtime.readMessages.add(id);
      persistMessageRead(id).catch(() => {});
    },
    onDialogueReady: scheduleSkip,
    onBacklogChange: renderBacklog,
    onChoice: renderChoices,
    onChoiceClose: hideChoices,
    onDecisionChange(decision) {
      if (decision.available) runtime.decisions.set(decision.kind, decision);
      else runtime.decisions.delete(decision.kind);
    },
    onGhostActionChange: showGhostAction,
    loadGlobalFlags: () => runtime.globalFlags,
    saveGlobalFlags,
    onState(kind, message) {
      runtime.setState(kind === 'complete' ? 'ready' : 'ready', message);
      if (kind === 'complete') runtimeLog('complete', { message, operations: runtime.executionTrace.length });
    },
    playMusic,
    stopMusic,
    playVoice,
    stopVoice,
    continueVoiceAfterAdvance: () => runtime.settings.continueVoice,
    playEffect,
    stopEffects,
    getExternalState: () => ({
      musicName: runtime.musicName,
      musicTime: runtime.music?.currentTime || 0,
    }),
    onTrace(event) {
      runtime.executionTrace.push(event);
      if (runtime.executionTrace.length > 20000) runtime.executionTrace.shift();
    },
    onTransition(detail) {
      runtimeLog('transition', detail);
    },
    onTransitionFrame(detail) {
      if (runtime.releaseCoverOnTransition && detail.scenario !== 'LOAD.isf') {
        // Blend the compositor cover away during the first 12% of the real
        // scene fade. Removing it instantaneously can expose a single frame
        // of independently rendered interface layers before the canvas has
        // visibly advanced.
        const release = Math.min(1, detail.progress / 0.12);
        transitionCover.hidden = false;
        transitionCover.style.opacity = String(1 - release);
        if (release < 1) return;
        runtime.releaseCoverOnTransition = false;
        clearTransitionCover();
        runtimeLog('handoff', {
          phase: 'released',
          reason: 'first-game-transition',
          scenario: detail.scenario,
          offset: detail.offset,
          transitionProgress: detail.progress,
        });
      }
    },
  });
}

async function drawTitle() {
  const [base, normal, selected] = await Promise.all([
    loadImage('TITLE_A.GGD'),
    loadImage('TITLE_B.GGD'),
    loadImage('TITLE_C.GGD'),
  ]);
  paint(base);
  context.drawImage(normal, 0, 0, 241, 186, 55, 218, 241, 186);
  if (runtime.hover) {
    const item = TITLE_ITEMS.find(({ id }) => id === runtime.hover);
    context.drawImage(
      selected,
      0, item.spriteY, item.width, item.height,
      item.x, item.y, item.width, item.height,
    );
  }
}

async function enterTitle() {
  runtime.releaseCoverOnTransition = false;
  clearTransitionCover();
  setSkipMode(false);
  runtime.decisions.clear();
  showGhostAction(false);
  closeGamePopups();
  hideDialogue();
  hideChoices();
  runtime.vm = null;
  renderBacklog([]);
  for (const button of [backlogButton, skipButton, saveButton, settingsButton]) button.disabled = true;
  runtime.screen = 'title';
  runtime.hover = 'new';
  hideMessage();
  // Start warming the opening before the title has finished decoding and
  // before the user can reasonably select New Game.
  void warmNewGameAssets().catch(error => runtimeLog('new-game-warmup-error', {
    message: error instanceof Error ? error.message : String(error),
  }));
  await Promise.all([drawTitle(), loadScenario('TITLE.isf')]);
  await playMusic('OP04.WAV');
  settingsButton.disabled = false;
  loadButton.disabled = false;
  runtime.setState('ready', 'TITLE.isf · interactive title menu');
}

async function beginNewGame() {
  // Keep the title visible until all first-scene data is ready. Fading first
  // would turn ordinary loading time into a conspicuous black-screen stall.
  const warmedScenarios = await warmNewGameAssets().catch(error => {
    runtimeLog('new-game-warmup-error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  });
  await animateTransitionCover(true, 500, 'new-game');
  runtime.decisions.clear();
  showGhostAction(false);
  runtime.screen = 'prologue';
  runtime.hover = null;
  hideMessage();
  hideDialogue();
  hideChoices();
  setInspector(false);
  runtime.setState('', 'Starting original LOAD.isf entry chain');
  runtime.executionTrace = [];
  runtimeLog('new-game', { entry: 'LOAD.isf' });
  runtime.vm = makeVM();
  for (const scenario of warmedScenarios) {
    runtime.vm.scenarios.set(scenario.name.toUpperCase(), Promise.resolve(scenario));
  }
  // LOAD.isf begins by fading the title away. The native browser title is
  // not part of the new VM, so copy its currently displayed frame into the
  // VM before allowing that original transition to execute.
  runtime.vm.seedDisplay(stage);
  // The browser-native title screen does not execute TITLE.isf itself. These
  // two original title variables pace UZU/CARD and similar scripted tile
  // transitions; without them every frame is drawn in one event-loop turn.
  runtime.vm.variables[0x20] = 8;
  runtime.vm.variables[0x21] = 8;
  // The compositor cover just performed LOAD.isf's title fade. Suppress only
  // that first scripted fade so the black interval is not doubled.
  runtime.vm.skipNextFadeOut = true;
  runtime.releaseCoverOnTransition = true;
  for (const button of [backlogButton, skipButton, saveButton, loadButton, settingsButton]) button.disabled = false;
  try {
    await runtime.vm.start('LOAD.isf');
  } finally {
    if (runtime.releaseCoverOnTransition) {
      runtime.releaseCoverOnTransition = false;
      await animateTransitionCover(false, 350, 'new-game-fallback');
    }
  }
}

function itemAt(event) {
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) * LOGICAL_WIDTH / bounds.width;
  const y = (event.clientY - bounds.top) * LOGICAL_HEIGHT / bounds.height;
  return TITLE_ITEMS.find(item => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
}

async function activateTitleItem(id) {
  if (id === 'new') return beginNewGame();
  if (id === 'continue') {
    return openSaveDialog('load');
  }
  if (id === 'extras') {
    return showMessage('Extras', 'This menu remains locked until the original completion flags are implemented.');
  }
  showMessage('Exit', 'Close this browser tab when finished. Stop the local data server with Ctrl+C.');
}

function stageBlob() {
  return new Promise((resolve, reject) => {
    stage.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create save preview')), 'image/jpeg', 0.78);
  });
}

function savedAtLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

async function saveToSlot(slot) {
  if (!runtime.vm) return;
  saveStatus.textContent = `Saving slot ${slot}…`;
  try {
    const state = await runtime.vm.exportState();
    const record = {
      slot,
      timestamp: Date.now(),
      scenario: runtime.vm.current()?.scenario.name || 'Unknown scene',
      speaker: runtime.vm.pendingName || '',
      excerpt: runtime.vm.dialoguePages[runtime.vm.dialoguePage] || '',
      musicName: runtime.musicName,
      musicTime: runtime.music?.currentTime || 0,
      preview: await stageBlob(),
      state,
    };
    await putSave(record);
    saveStatus.textContent = `Slot ${slot} saved.`;
    await renderSaveSlots();
  } catch (error) {
    saveStatus.textContent = `Could not save: ${error.message}`;
  }
}

async function loadFromSlot(record) {
  saveStatus.textContent = `Loading slot ${record.slot}…`;
  try {
    runtimeLog('load-save', {
      slot: record.slot,
      savedScenario: record.scenario,
      version: record.state?.version,
      frames: (record.state?.frames || []).map(frame => ({ scenario: frame.scenario, ip: frame.ip })),
    });
    stopMusic();
    stopVoice();
    if (!runtime.vm) {
      runtime.vm = makeVM();
      runtime.vm.seedDisplay(stage);
    }
    saveDialog.close();
    await animateTransitionCover(true, 350, 'load-save');
    runtime.screen = 'prologue';
    runtime.hover = null;
    hideMessage();
    startButton.hidden = true;
    const restoreStarted = performance.now();
    await runtime.vm.importState(record.state);
    runtimeLog('load-save-restored', {
      slot: record.slot,
      surfaces: record.state?.surfaces?.length || 0,
      elapsed: performance.now() - restoreStarted,
    });
    await animateTransitionCover(false, 350, 'load-save');
    if (runtime.vm.migrations.length) {
      runtimeLog('save-migrated', {
        slot: record.slot,
        migrations: runtime.vm.migrations,
        frames: runtime.vm.frames.map(frame => ({ scenario: frame.scenario.name, ip: frame.ip })),
      });
    }
    if (record.musicName) {
      await playMusic(record.musicName);
      try { runtime.music.currentTime = record.musicTime || 0; } catch {}
    }
    saveButton.disabled = false;
    loadButton.disabled = false;
    backlogButton.disabled = false;
    skipButton.disabled = false;
    settingsButton.disabled = false;
    runtime.setState('ready', `${record.scenario} · loaded from slot ${record.slot}`);
  } catch (error) {
    clearTransitionCover();
    if (!saveDialog.open) saveDialog.showModal();
    saveStatus.textContent = `Could not load: ${error.message}`;
  }
}

async function removeSlot(slot) {
  if (!window.confirm(`Delete save slot ${slot}? This cannot be undone.`)) return;
  await deleteSave(slot);
  saveStatus.textContent = `Slot ${slot} deleted.`;
  await renderSaveSlots();
}

async function renderSaveSlots() {
  for (const url of runtime.previewUrls) URL.revokeObjectURL(url);
  runtime.previewUrls = [];
  saveGrid.replaceChildren();
  let records;
  try {
    records = new Map((await listSaves()).map(record => [record.slot, record]));
  } catch (error) {
    saveStatus.textContent = `Save data is unavailable: ${error.message}`;
    return;
  }
  for (let slot = 1; slot <= SAVE_SLOTS; slot += 1) {
    const record = records.get(slot);
    const wrapper = document.createElement('div');
    wrapper.className = 'save-record';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'save-slot';
    button.disabled = runtime.saveMode === 'load' && !record;
    button.addEventListener('click', () => {
      if (runtime.saveMode === 'save') saveToSlot(slot);
      else if (record) loadFromSlot(record);
    });
    if (record) {
      const preview = document.createElement('img');
      preview.className = 'save-preview';
      preview.alt = '';
      const url = URL.createObjectURL(record.preview);
      runtime.previewUrls.push(url);
      preview.src = url;
      const title = document.createElement('strong');
      title.textContent = `Slot ${slot} · ${record.scenario}`;
      const date = document.createElement('small');
      date.textContent = savedAtLabel(record.timestamp);
      const excerpt = document.createElement('small');
      excerpt.lang = 'ja';
      excerpt.textContent = [record.speaker, record.excerpt].filter(Boolean).join(' · ');
      button.append(preview, title, date, excerpt);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'save-delete';
      remove.setAttribute('aria-label', `Delete save slot ${slot}`);
      remove.textContent = '×';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        removeSlot(slot).catch(error => { saveStatus.textContent = error.message; });
      });
      wrapper.append(button, remove);
    } else {
      const preview = document.createElement('span');
      preview.className = 'save-preview save-empty';
      preview.textContent = 'Empty';
      const title = document.createElement('strong');
      title.textContent = `Slot ${slot}`;
      button.append(preview, title);
      wrapper.append(button);
    }
    saveGrid.append(wrapper);
  }
}

async function openSaveDialog(mode) {
  setSkipMode(false);
  closeGamePopups();
  runtime.saveMode = mode;
  saveDialogTitle.textContent = mode === 'save' ? 'Save game' : 'Load game';
  saveTab.setAttribute('aria-selected', String(mode === 'save'));
  loadTab.setAttribute('aria-selected', String(mode === 'load'));
  saveStatus.textContent = mode === 'save'
    ? 'Choose a slot. Existing data will be replaced.'
    : 'Choose a saved position to continue.';
  if (!saveDialog.open) saveDialog.showModal();
  await renderSaveSlots();
}

async function bootstrap() {
  try {
    runtimeLog('bootstrap', { userAgent: navigator.userAgent });
    const [manifestResponse, readMessages, readOnly, savedContinueVoice, savedBgm, savedVoice, savedEffect, savedBacklogPosition, savedBacklogSize, savedRenderScale, savedTextSpeed, savedTextboxTransparency, savedSettingsSize, savedGlobalFlags] = await Promise.all([
      api('/api/manifest'),
      listReadMessages().catch(() => []),
      getSetting('skipReadOnly', true).catch(() => true),
      getSetting('continueVoice', true).catch(() => true),
      getSetting('bgmVolume', 65).catch(() => 65),
      getSetting('voiceVolume', 100).catch(() => 100),
      getSetting('effectVolume', 100).catch(() => 100),
      getSetting('backlogPosition', { x: 0.5, y: 9 / 38 }).catch(() => ({ x: 0.5, y: 9 / 38 })),
      getSetting('backlogSize', null).catch(() => null),
      getSetting('renderScale', 1).catch(() => 1),
      getSetting('textSpeed', DEFAULT_SETTINGS.textSpeed).catch(() => DEFAULT_SETTINGS.textSpeed),
      getSetting('textboxTransparency', DEFAULT_SETTINGS.textboxTransparency).catch(() => DEFAULT_SETTINGS.textboxTransparency),
      getSetting('settingsSize', null).catch(() => null),
      getSetting('globalFlags', null).catch(() => null),
    ]);
    runtime.manifest = await manifestResponse.json();
    runtime.readMessages = new Set(readMessages);
    runtime.globalFlags = flagBank(savedGlobalFlags);
    runtime.settings.skipReadOnly = Boolean(readOnly);
    skipReadOnly.checked = runtime.settings.skipReadOnly;
    runtime.settings.continueVoice = Boolean(savedContinueVoice);
    continueVoice.checked = runtime.settings.continueVoice;
    if (savedBacklogPosition && Number.isFinite(savedBacklogPosition.x) && Number.isFinite(savedBacklogPosition.y)) {
      runtime.backlogPosition = {
        x: Math.min(1, Math.max(0, savedBacklogPosition.x)),
        y: Math.min(1, Math.max(0, savedBacklogPosition.y)),
      };
    }
    if (savedBacklogSize && Number.isFinite(savedBacklogSize.width) && Number.isFinite(savedBacklogSize.height)) {
      runtime.backlogSize = {
        width: Math.min(1, Math.max(0.42, savedBacklogSize.width)),
        height: Math.min(1, Math.max(0.34, savedBacklogSize.height)),
      };
    }
    if (savedSettingsSize && Number.isFinite(savedSettingsSize.width) && Number.isFinite(savedSettingsSize.height)) {
      runtime.settingsSize = {
        width: Math.min(.9, Math.max(.52, savedSettingsSize.width)),
        height: Math.min(.94, Math.max(.45, savedSettingsSize.height)),
      };
    }
    setVolume('bgm', savedBgm, false);
    setVolume('voice', savedVoice, false);
    setVolume('effect', savedEffect, false);
    setRenderScale(savedRenderScale, false, false);
    setTextSpeed(savedTextSpeed, false);
    setTextboxTransparency(savedTextboxTransparency, false);
    renderStats(runtime.manifest);

    const [title] = await Promise.all([
      loadImage('TITLE.GGD'),
      loadScenario(runtime.manifest.startScenario),
    ]);
    paint(title);
    hideMessage();
    startButton.hidden = false;
    runtime.setState('ready', `${runtime.manifest.archives.ISF.count} scenarios indexed`);
  } catch (error) {
    runtime.setState('error', 'Game data could not be loaded');
    showMessage('Runtime initialization failed', error.message);
  }
}

startButton.addEventListener('click', async () => {
  startButton.hidden = true;
  try { await enterTitle(); } catch (error) {
    runtime.setState('error', error.message);
    showMessage('Title initialization failed', error.message);
  }
});

stage.addEventListener('pointermove', event => {
  if (runtime.screen !== 'title') return;
  const next = itemAt(event)?.id || null;
  stage.style.cursor = next ? 'pointer' : 'default';
  if (next !== runtime.hover) {
    runtime.hover = next;
    drawTitle().catch(reportRuntimeError);
  }
});

stage.addEventListener('pointerleave', () => {
  if (runtime.screen !== 'title' || runtime.hover === null) return;
  runtime.hover = null;
  stage.style.cursor = 'default';
  drawTitle().catch(reportRuntimeError);
});

stage.addEventListener('click', event => {
  if (runtime.screen === 'prologue' && !gamePopupOpen()) {
    advanceDialogue()?.catch(reportRuntimeError);
  } else if (runtime.screen === 'title') {
    const item = itemAt(event);
    if (item) activateTitleItem(item.id).catch(reportRuntimeError);
  }
});

stage.addEventListener('wheel', event => {
  if (event.target.closest('.game-popup')) return;
  if (runtime.screen === 'prologue' && event.deltaY < 0 && !saveDialog.open) {
    event.preventDefault();
    openBacklog();
  }
}, { passive: false });

dialogueBox.addEventListener('click', event => {
  event.stopPropagation();
  advanceDialogue()?.catch(reportRuntimeError);
});

saveButton.addEventListener('click', () => openSaveDialog('save'));
loadButton.addEventListener('click', () => openSaveDialog('load'));
backlogButton.addEventListener('click', () => {
  if (backlogPopup.hidden) openBacklog();
  else backlogPopup.hidden = true;
});
skipButton.addEventListener('click', toggleSkip);
settingsButton.addEventListener('click', () => {
  setSkipMode(false);
  backlogPopup.hidden = true;
  settingsPopup.hidden = !settingsPopup.hidden;
  if (!settingsPopup.hidden) requestAnimationFrame(applySettingsSize);
});
for (const popup of [backlogPopup, settingsPopup]) {
  popup.addEventListener('click', event => event.stopPropagation());
  popup.querySelector('[data-popup-close]').addEventListener('click', () => { popup.hidden = true; });
}
resetBacklogSize.addEventListener('click', event => {
  event.stopPropagation();
  resetBacklogWindow();
});
resetSettings.addEventListener('click', event => {
  event.stopPropagation();
  resetRuntimeSettings();
});
backlogList.addEventListener('wheel', event => {
  if (event.deltaY > 0 && backlogAtNewest()) {
    event.preventDefault();
    backlogPopup.hidden = true;
  }
}, { passive: false });
function handleSecondaryAction() {
  if (!backlogPopup.hidden) {
    backlogPopup.hidden = true;
  } else if (!settingsPopup.hidden) {
    settingsPopup.hidden = true;
  } else if (!saveDialog.open && runtime.screen === 'prologue' && runtime.vm?.waiting) {
    setMessageInterfaceHidden(!runtime.messageInterfaceHidden);
  }
}

document.addEventListener('pointerdown', event => {
  if (event.button !== 2) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleSecondaryAction();
}, { capture: true });
for (const eventName of ['mousedown', 'mouseup', 'auxclick', 'contextmenu']) {
  document.addEventListener(eventName, event => {
    if (eventName !== 'contextmenu' && event.button !== 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}
document.documentElement.oncontextmenu = event => {
  event.preventDefault();
  return false;
};
skipReadOnly.addEventListener('change', () => {
  runtime.settings.skipReadOnly = skipReadOnly.checked;
  putSetting('skipReadOnly', skipReadOnly.checked).catch(() => {});
});

continueVoice.addEventListener('change', () => {
  runtime.settings.continueVoice = continueVoice.checked;
  putSetting('continueVoice', runtime.settings.continueVoice).catch(() => {});
});
textSpeed.addEventListener('input', () => setTextSpeed(textSpeed.value, false));
textSpeed.addEventListener('change', () => setTextSpeed(textSpeed.value, true));
textboxTransparency.addEventListener('input', () => setTextboxTransparency(textboxTransparency.value, false));
textboxTransparency.addEventListener('change', () => setTextboxTransparency(textboxTransparency.value, true));
for (const [kind, input] of [['bgm', bgmVolume], ['voice', voiceVolume], ['effect', effectVolume]]) {
  input.addEventListener('input', () => setVolume(kind, input.value, false));
  input.addEventListener('change', () => setVolume(kind, input.value, true));
}
renderScale.addEventListener('input', () => setRenderScale(renderScale.value, false, true));
renderScale.addEventListener('change', () => setRenderScale(renderScale.value, true, true));
exportSavesButton.addEventListener('click', () => exportSaves());
importSavesButton.addEventListener('click', () => importSavesFile.click());
importSavesFile.addEventListener('change', () => {
  const [file] = importSavesFile.files;
  if (file) importSaves(file);
});

const backlogHeader = backlogPopup.querySelector('header');
let backlogDrag = null;
backlogHeader.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return;
  const popupBounds = backlogPopup.getBoundingClientRect();
  const stageBounds = stageWrap.getBoundingClientRect();
  backlogDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: popupBounds.left - stageBounds.left,
    top: popupBounds.top - stageBounds.top,
  };
  backlogHeader.setPointerCapture(event.pointerId);
  event.preventDefault();
});
backlogHeader.addEventListener('pointermove', event => {
  if (!backlogDrag || backlogDrag.pointerId !== event.pointerId) return;
  const maxLeft = Math.max(0, stageWrap.clientWidth - backlogPopup.offsetWidth);
  const maxTop = Math.max(0, stageWrap.clientHeight - backlogPopup.offsetHeight);
  const left = Math.min(maxLeft, Math.max(0, backlogDrag.left + event.clientX - backlogDrag.startX));
  const top = Math.min(maxTop, Math.max(0, backlogDrag.top + event.clientY - backlogDrag.startY));
  backlogPopup.style.left = `${left}px`;
  backlogPopup.style.top = `${top}px`;
});
function finishBacklogDrag(event) {
  if (!backlogDrag || backlogDrag.pointerId !== event.pointerId) return;
  backlogDrag = null;
  saveBacklogPosition();
}
backlogHeader.addEventListener('pointerup', finishBacklogDrag);
backlogHeader.addEventListener('pointercancel', finishBacklogDrag);
window.addEventListener('pointerup', () => {
  if (!backlogPopup.hidden && !backlogDrag) {
    saveBacklogSize();
    applyBacklogPosition();
  }
  if (!settingsPopup.hidden) saveSettingsSize();
});
window.addEventListener('resize', () => {
  applyBacklogPosition();
  applySettingsSize();
});
for (const button of document.querySelectorAll('[data-system-action]')) {
  button.addEventListener('click', event => {
    event.stopPropagation();
    const action = button.dataset.systemAction;
    if (action === 'skip') toggleSkip();
    else if (action === 'ghost') runtime.vm?.selectDecision('ghost').catch(reportRuntimeError);
    else if (action === 'load') openSaveDialog('load');
    else if (action === 'title') {
      if (window.confirm('Return to the title screen? Unsaved progress will be lost.')) {
        enterTitle().catch(reportRuntimeError);
      }
    } else if (action === 'close') {
      window.close();
      runtime.setState('ready', 'Close this browser tab to exit');
    }
  });
}
saveTab.addEventListener('click', () => openSaveDialog('save'));
loadTab.addEventListener('click', () => openSaveDialog('load'));
saveDialog.addEventListener('close', () => {
  for (const url of runtime.previewUrls) URL.revokeObjectURL(url);
  runtime.previewUrls = [];
});
saveDialog.addEventListener('click', event => {
  if (event.target === saveDialog) saveDialog.close();
});

function setInspector(open) {
  inspector.hidden = !open;
  toggleInspector.setAttribute('aria-expanded', String(open));
}

toggleInspector.addEventListener('click', () => setInspector(inspector.hidden));
closeInspector.addEventListener('click', () => setInspector(false));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !backlogPopup.hidden) {
    event.preventDefault();
    backlogPopup.hidden = true;
  } else if (event.key === 'F12') {
    event.preventDefault();
    setInspector(inspector.hidden);
  } else if (!saveDialog.open && settingsPopup.hidden && runtime.screen === 'prologue' && event.key === 'PageUp') {
    event.preventDefault();
    if (backlogPopup.hidden) openBacklog();
    else backlogList.scrollBy({ top: -backlogList.clientHeight, behavior: 'auto' });
  } else if (!saveDialog.open && settingsPopup.hidden && runtime.screen === 'prologue' && event.key === 'PageDown' && !backlogPopup.hidden) {
    event.preventDefault();
    if (backlogAtNewest()) backlogPopup.hidden = true;
    else backlogList.scrollBy({ top: backlogList.clientHeight, behavior: 'auto' });
  } else if (!saveDialog.open && !gamePopupOpen() && runtime.screen === 'prologue' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    advanceDialogue()?.catch(reportRuntimeError);
  }
});

bootstrap();
