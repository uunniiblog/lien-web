import { LienVM } from './vm.js?v=20261009-55';
import {
  AUTO_ROUTES, autoWalkthroughState, createAutoWalkthrough, resolveAutoDecision,
} from './auto-walkthrough.js?v=20261009-55';
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
const stopSkipAtGhostAction = document.querySelector('#stop-skip-at-ghost-action');
const continueVoice = document.querySelector('#continue-voice');
const textSpeed = document.querySelector('#text-speed');
const textSpeedValue = document.querySelector('#text-speed-value');
const textboxTransparency = document.querySelector('#textbox-transparency');
const textboxTransparencyValue = document.querySelector('#textbox-transparency-value');
const gameFont = document.querySelector('#game-font');
const bgmVolume = document.querySelector('#bgm-volume');
const voiceVolume = document.querySelector('#voice-volume');
const effectVolume = document.querySelector('#effect-volume');
const bgmVolumeValue = document.querySelector('#bgm-volume-value');
const voiceVolumeValue = document.querySelector('#voice-volume-value');
const effectVolumeValue = document.querySelector('#effect-volume-value');
const renderScale = document.querySelector('#render-scale');
const renderScaleValue = document.querySelector('#render-scale-value');
const displayMode = document.querySelector('#display-mode');
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
const savePages = document.querySelector('#save-pages');
const saveButton = document.querySelector('[data-action="save"]');
const loadButton = document.querySelector('[data-action="load"]');
const backlogButton = document.querySelector('[data-action="backlog"]');
const skipButton = document.querySelector('[data-action="skip"]');
const settingsButton = document.querySelector('[data-action="settings"]');
const systemSkipButton = document.querySelector('[data-system-action="skip"]');
const systemGhostButton = document.querySelector('[data-system-action="ghost"]');
const ghostActionStatus = document.querySelector('#ghost-action-status');
const autoWalkthroughButton = document.querySelector('#auto-walkthrough-button');
const autoRoutePicker = document.querySelector('#auto-route-picker');
const closeAutoRoute = document.querySelector('#close-auto-route');

const SAVE_SLOTS = 200;
const SAVE_SLOTS_PER_PAGE = 10;
const SAVE_PAGES = Math.ceil(SAVE_SLOTS / SAVE_SLOTS_PER_PAGE);
const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 480;
const RUNTIME_BUILD = '20261009-55';
const VOICE_PREAMP = 3;
const DEFAULT_BACKLOG_POSITION = Object.freeze({ x: 0.5, y: 9 / 38 });
const DEFAULT_SETTINGS = Object.freeze({
  skipReadOnly: true,
  stopSkipAtGhostAction: true,
  continueVoice: true,
  bgmVolume: 65,
  voiceVolume: 100,
  effectVolume: 100,
  renderScale: 1,
  displayMode: 'windowed',
  textSpeed: 100,
  textboxTransparency: 0,
  gameFont: 'current',
});

const GAME_FONT_STACKS = Object.freeze({
  current: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  'bundled-mincho': '"MS Mincho", "Yu Mincho", "Lien Bundled Mincho", "Noto Serif JP", serif',
  'ms-gothic': '"MS Gothic", "Lien MS Gothic Style", "Noto Sans Mono CJK JP", monospace',
  gothic: '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  rounded: '"Hiragino Maru Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif',
  'system-serif': 'ui-serif, "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
  'system-sans': 'system-ui, "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
  monospace: '"Noto Sans Mono CJK JP", "BIZ UDGothic", "Yu Gothic", monospace',
});

const TITLE_ITEMS = [
  { id: 'new', x: 55, y: 218, width: 241, height: 34, spriteY: 0 },
  { id: 'continue', x: 55, y: 269, width: 241, height: 34, spriteY: 51 },
  { id: 'extras', x: 55, y: 319, width: 241, height: 34, spriteY: 101 },
  { id: 'exit', x: 55, y: 370, width: 241, height: 34, spriteY: 152 },
];

const OMAKE_ITEMS = [
  { id: 'cg', x: 219, y: 242, width: 186, height: 45, spriteY: 0, spriteHeight: 45 },
  { id: 'music', x: 219, y: 287, width: 186, height: 34, spriteY: 45, spriteHeight: 34 },
  { id: 'back', x: 219, y: 321, width: 186, height: 45, spriteY: 79, spriteHeight: 42 },
];

const CG_CATEGORY_ITEMS = [
  { id: 'wa', x: 88, y: 87, width: 99, height: 54 },
  { id: 'yu', x: 249, y: 236, width: 75, height: 31 },
  { id: 'mi', x: 312, y: 412, width: 106, height: 35 },
  { id: 'ak', x: 486, y: 180, width: 84, height: 33 },
  { id: 'etc', x: 25, y: 397, width: 66, height: 34 },
];

const CG_SLOTS = [
  { x: 29, y: 113 }, { x: 187, y: 113 }, { x: 343, y: 113 }, { x: 498, y: 113 },
  { x: 29, y: 204 }, { x: 187, y: 204 }, { x: 343, y: 204 }, { x: 498, y: 204 },
  { x: 29, y: 295 }, { x: 187, y: 295 }, { x: 343, y: 295 }, { x: 498, y: 295 },
  { x: 29, y: 386 }, { x: 187, y: 386 }, { x: 343, y: 386 }, { x: 498, y: 386 },
];

const CG_GALLERIES = Object.freeze({
  wa: {
    base: 'CGM-WA.GGD', flags: [740, 741, 743, 744, 745, 746, 747, 748, 750, 751, 752, 753, 755, 756],
    events: ['EVWA01', 'EVWA02', 'EVWA03', 'EVWA04', 'EVWA05', 'EVWA06', 'EVWA07', 'EVWA08', 'EVWA09', 'EVWA10', 'EVWA11', 'EVWA12', 'EVWA13', 'EVWA14'],
    variants: { 1: [{ name: 'EVWA02A', flag: 742 }], 7: [{ name: 'EVWA08A', flag: 749 }], 11: [{ name: 'EVWA12A', flag: 754 }] },
    miniFlags: [810, 811, 812, 813, 814, 815, 816, 817, 818, 819, 820],
    minis: ['MWWA01', 'MWWA02', 'MWWA03', 'MWWA04', 'MWWA05', 'MWWA06', 'MWWA07', 'MWWA08', 'MWWA09', 'MWWA10', 'MWWA11'],
  },
  yu: {
    base: 'CGM-YU.GGD', flags: [760, 761, 762, 763, 764, 765, 766, 767, 769, 770, 771, 772, 773],
    events: ['EVYU01', 'EVYU02', 'EVYU03', 'EVYU04', 'EVYU05', 'EVYU06', 'EVYU07', 'EVYU08', 'EVYU09', 'EVYU10', 'EVYU11', 'EVYU12', 'EVYU13'],
    variants: { 7: [{ name: 'EVYU08A', flag: 768 }] },
    miniFlags: [840, 841, 842, 843, 844, 845, 846, 847],
    minis: ['MWYU01', 'MWYU02', 'MWYU03', 'MWYU04', 'MWYU05', 'MWYU06', 'MWYU07', 'MWYU08'],
  },
  mi: {
    base: 'CGM-MI.GGD', flags: [720, 722, 723, 724, 725, 726, 727, 728, 729, 730, 732, 733, 735, 736, 737],
    events: ['EVMI01', 'EVMI02', 'EVMI03', 'EVMI04', 'EVMI05', 'EVMI06', 'EVMI07', 'EVMI08', 'EVMI09', 'EVMI10', 'EVMI11', 'EVMI12', 'EVMI13', 'EVMI14', 'EVMI15'],
    variants: { 0: [{ name: 'EVMI01A', flag: 721 }], 9: [{ name: 'EVMI10A', flag: 731 }], 11: [{ name: 'EVMI12A', flag: 734 }] },
    miniFlags: [830, 831, 832, 833, 834, 835, 836, 837],
    minis: ['MWMI01', 'MWMI02', 'MWMI03', 'MWMI04', 'MWMI05', 'MWMI06', 'MWMI07', 'MWMI08'],
  },
  ak: {
    base: 'CGM-AK.GGD', flags: [700, 701, 702, 703, 704, 705, 706, 707, 709, 710, 711, 712, 714, 715],
    events: ['EVAK01', 'EVAK02', 'EVAK03', 'EVAK04', 'EVAK05', 'EVAK06', 'EVAK07', 'EVAK08', 'EVAK09', 'EVAK10', 'EVAK11', 'EVAK12', 'EVAK13', 'EVAK14'],
    variants: { 7: [{ name: 'EVAK08A', flag: 708 }], 11: [{ name: 'EVAK12A', flag: 713 }] },
    miniFlags: [800, 801, 802, 803, 804, 805],
    minis: ['MWAK01', 'MWAK02', 'MWAK04', 'MWAK05', 'MWAK06', 'MWAK07'],
  },
  etc: {
    base: 'CGM-OT.GGD', flags: [780, 781, 782], events: ['EVOT01', 'EVOT02', 'EVOT03'],
    miniFlags: [850, 851], minis: ['MWOT01', 'MWOT02'],
  },
});

const MUSIC_TRACKS = [
  { name: 'OP04.WAV', label: 'Opening · 風が吹く街へ' },
  ...Array.from({ length: 11 }, (_, index) => ({ name: `L${String(index + 2).padStart(2, '0')}.WAV`, label: `Track ${index + 1}` })),
  { name: 'END04.WAV', label: 'Ending · おわらないきみのうた' },
];

const runtime = {
  manifest: null,
  scenario: null,
  screen: 'cover',
  hover: null,
  images: new Map(),
  music: null,
  musicName: null,
  musicRequestId: 0,
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
  savePage: 0,
  saveDialogSize: null,
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
  fullscreenReturnMode: 'windowed',
  omake: { hover: null, category: null, viewer: null, miniIndex: 0 },
  textRevealTimer: null,
  textRevealCharacters: [],
  textRevealIndex: 0,
  messageInterfaceHidden: false,
  releaseCoverOnTransition: false,
  autoWalkthrough: null,
  autoDecisionTimer: null,
  endingTitleHandoff: false,
  lastRouteDebugSnapshot: null,
  ghostDebugTrace: [],
  ghostActionAvailable: false,
  possessionActive: false,
  setState(kind, message) {
    stateNode.className = `runtime-state ${kind}`;
    stateNode.lastElementChild.textContent = message;
  },
};

function hideAutoRoutePicker() {
  autoRoutePicker.hidden = true;
}

function setTitleAutoWalkthroughVisible(visible) {
  autoWalkthroughButton.hidden = !visible;
  if (!visible) hideAutoRoutePicker();
}

function restoreAutoWalkthrough(saved) {
  runtime.autoWalkthrough = saved?.routeId ? createAutoWalkthrough(saved.routeId, saved) : null;
}

function routeDebugSnapshot(reason, extra = {}) {
  const vm = runtime.vm;
  const previous = runtime.lastRouteDebugSnapshot;
  const setFlags = [];
  const setGlobalFlags = [];
  if (vm?.flags) {
    for (let index = 0; index < vm.flags.length; index += 1) {
      if (vm.flags[index]) setFlags.push(index);
    }
  }
  for (let index = 0; index < runtime.globalFlags.length; index += 1) {
    if (runtime.globalFlags[index]) setGlobalFlags.push(index);
  }
  return {
    reason,
    scenario: vm?.current()?.scenario.name || runtime.scenario?.name || null,
    calendar: {
      day: vm?.variables?.[0xC8] ?? null,
      phase: vm?.variables?.[0xC9] ?? null,
      week: vm?.variables?.[0xCA] ?? null,
    },
    routeVariables: {
      event: vm?.variables?.[0xFF] ?? null,
      branch: vm?.variables?.[0x100] ?? null,
      selectedEvent: vm?.variables?.[0x105] ?? null,
    },
    ghostAction: {
      tableSelection: vm?.variables?.[0x46] ?? null,
      unavailableFlag: vm?.flags?.[0x50] ?? null,
      armed: vm?.ghostActionArmed ?? null,
      available: vm?.ghostActionAvailable ?? null,
    },
    flags: { size: vm?.flags?.length || 0, set: setFlags },
    globalFlags: { size: runtime.globalFlags.length, set: setGlobalFlags },
    progress: autoWalkthroughState(runtime.autoWalkthrough) || previous?.progress || null,
    choicesMade: runtime.autoWalkthrough?.history?.map(entry => ({ ...entry }))
      || previous?.choicesMade?.map(entry => ({ ...entry })) || [],
    ...extra,
  };
}

function logRouteDebug(reason, extra = {}) {
  const snapshot = routeDebugSnapshot(reason, extra);
  runtime.lastRouteDebugSnapshot = snapshot;
  runtimeLog('auto-walkthrough-debug', snapshot);
  return snapshot;
}

window.dumpLienRouteState = () => {
  const snapshot = routeDebugSnapshot('manual-console-dump');
  console.info('[Lien runtime] route state dump', snapshot);
  return snapshot;
};

function autoWalkthroughFailure(message, decision) {
  const route = AUTO_ROUTES[runtime.autoWalkthrough?.routeId];
  runtimeLog('auto-walkthrough-error', routeDebugSnapshot('decision-error', {
    route: route?.name,
    message,
    decision,
  }));
  runtime.autoWalkthrough = null;
  queueMicrotask(() => runtime.setState('error', `Auto Walkthrough stopped: ${message}`));
  if (decision?.kind === 'ghost') showGhostAction(decision.available);
  else if (decision?.available) renderChoices(decision.options);
}

function scheduleAutoDecision(decision) {
  if (!runtime.autoWalkthrough || !decision.available) return;
  const walkthrough = runtime.autoWalkthrough;
  const route = AUTO_ROUTES[walkthrough.routeId];
  const result = resolveAutoDecision(
    walkthrough,
    decision,
    runtime.vm?.current()?.scenario.name,
    {
      day: runtime.vm?.variables?.[0xC8],
      phase: runtime.vm?.variables?.[0xC9],
      week: runtime.vm?.variables?.[0xCA],
    },
  );
  if (result.status === 'error') {
    autoWalkthroughFailure(result.message, decision);
    return;
  }
  if (result.status === 'ignore' && decision.kind === 'ghost') {
    logRouteDebug('ghost-opportunity-ignored', { decision });
  }
  if (result.status !== 'select') return;
  if (runtime.autoDecisionTimer !== null) window.clearTimeout(runtime.autoDecisionTimer);
  runtime.autoDecisionTimer = window.setTimeout(async () => {
    runtime.autoDecisionTimer = null;
    if (runtime.autoWalkthrough !== walkthrough || runtime.decisions.get(decision.kind) !== decision) return;
    const previousGhostPending = walkthrough.ghostPending;
    const previousStandaloneGhostDone = walkthrough.standaloneGhostDone;
    const previousMapIndex = walkthrough.mapIndex;
    const historyLength = walkthrough.history.length;
    if (result.counter) walkthrough[result.counter] += 1;
    if (result.mapIndexValue !== null && result.mapIndexValue !== undefined) {
      walkthrough.mapIndex = result.mapIndexValue;
    }
    if (result.expected?.ghost !== undefined) walkthrough.ghostPending = Boolean(result.expected.ghost);
    if (result.consumeGhost) walkthrough.ghostPending = false;
    if (result.consumeStandaloneGhost) walkthrough.standaloneGhostDone = true;
    walkthrough.history.push({
      sequence: walkthrough.history.length + 1,
      kind: decision.kind,
      selection: result.label,
      selectedId: result.id,
      expectedId: result.expected?.id ?? null,
      forced: Boolean(result.forced),
      scenario: runtime.vm?.current()?.scenario.name || null,
      day: runtime.vm?.variables?.[0xC8] ?? null,
      phase: runtime.vm?.variables?.[0xC9] ?? null,
    });
    if (walkthrough.history.length > 256) walkthrough.history.splice(0, walkthrough.history.length - 256);
    runtimeLog('auto-walkthrough-select', {
      route: route.name,
      kind: decision.kind,
      selection: result.label,
      fallback: result.fallback || null,
      forced: Boolean(result.forced),
      selectedId: result.id,
      expectedId: result.expected?.id,
      scenario: runtime.vm?.current()?.scenario.name,
      progress: autoWalkthroughState(walkthrough),
    });
    try {
      const selected = await runtime.vm?.selectDecision(decision.kind, result.id);
      if (!selected && result.counter) walkthrough[result.counter] -= 1;
      if (!selected) {
        walkthrough.mapIndex = previousMapIndex;
        walkthrough.ghostPending = previousGhostPending;
        walkthrough.standaloneGhostDone = previousStandaloneGhostDone;
        walkthrough.history.length = historyLength;
      }
      if (!selected) autoWalkthroughFailure(`Could not select ${result.label}.`, decision);
      else logRouteDebug('decision-selected', { decision: walkthrough.history.at(-1) });
    } catch (error) {
      if (result.counter) walkthrough[result.counter] -= 1;
      walkthrough.mapIndex = previousMapIndex;
      walkthrough.ghostPending = previousGhostPending;
      walkthrough.standaloneGhostDone = previousStandaloneGhostDone;
      walkthrough.history.length = historyLength;
      autoWalkthroughFailure(error instanceof Error ? error.message : String(error), decision);
    }
  }, 0);
}

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
  runtime.ghostActionAvailable = Boolean(available);
  renderGhostActionState();
}

function showPossessionState(active) {
  runtime.possessionActive = Boolean(active);
  renderGhostActionState();
}

function renderGhostActionState() {
  const available = runtime.ghostActionAvailable && !runtime.possessionActive;
  ghostActionStatus.hidden = !available && !runtime.possessionActive;
  ghostActionStatus.src = runtime.possessionActive ? '/api/image/CHUU.GGD' : '/api/image/KA.GGD';
  systemGhostButton.disabled = !available;
  systemGhostButton.classList.toggle('ghost-action-available', available);
  systemGhostButton.classList.toggle('possession-active', runtime.possessionActive);
  systemGhostButton.setAttribute('aria-hidden', String(!available && !runtime.possessionActive));
  systemGhostButton.title = runtime.possessionActive
    ? 'Ghost action currently active'
    : available
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
  return payload;
}

window.dumpLienGhostTrace = () => {
  const trace = runtime.ghostDebugTrace.map(entry => ({ ...entry }));
  const json = JSON.stringify(trace, null, 2);
  console.info('[Lien runtime] ghost trace dump\n' + json);
  return json;
};

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
  const requestId = ++runtime.musicRequestId;
  let audio = runtime.music;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    runtime.music = audio;
  }
  if (runtime.musicName === name && !audio.paused && !audio.ended) return;
  audio.pause();
  audio.loop = true;
  audio.volume = runtime.settings.bgmVolume / 100;
  runtime.musicName = name;
  audio.src = `/api/audio/WMSC/${encodeURIComponent(name)}`;
  audio.load();
  try {
    await audio.play();
  } catch (error) {
    // Changing tracks interrupts the previous play() promise. That is normal
    // during quick Music Mode browsing; only the newest request may report a
    // real playback failure.
    if (requestId !== runtime.musicRequestId || error?.name === 'AbortError') return;
    runtimeLog('music-playback-error', { name, message: error instanceof Error ? error.message : String(error) });
    runtime.setState('ready', 'Audio is paused · click a track to enable playback');
  }
}

function stopMusic() {
  if (!runtime.music) return;
  runtime.musicRequestId += 1;
  runtime.music.pause();
  try { runtime.music.currentTime = 0; } catch {}
  runtime.music.removeAttribute('src');
  runtime.music.load();
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
  closeSettings();
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
  hideChoices();
  runtime.decisions.clear();
  restoreAutoWalkthrough(state.externalState?.autoWalkthrough);
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
  closeSettings();
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

function applyBaseDisplayMode(value, persist = true) {
  const mode = value === 'fit' ? 'fit' : 'windowed';
  runtime.settings.displayMode = mode;
  document.body.dataset.displayMode = mode;
  displayMode.value = mode;
  if (persist) putSetting('displayMode', mode).catch(() => {});
  requestAnimationFrame(() => {
    applyBacklogPosition();
    applySettingsSize();
  });
}

async function setDisplayMode(value, persist = true) {
  if (value !== 'fullscreen') {
    runtime.fullscreenReturnMode = value === 'fit' ? 'fit' : 'windowed';
    applyBaseDisplayMode(value, persist);
    if (document.fullscreenElement) await document.exitFullscreen();
    return;
  }
  if (!document.fullscreenEnabled) {
    displayMode.value = runtime.settings.displayMode;
    runtime.setState('ready', 'Fullscreen is not available in this browser context');
    return;
  }
  runtime.fullscreenReturnMode = runtime.settings.displayMode;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (error) {
    displayMode.value = runtime.settings.displayMode;
    runtimeLog('fullscreen-error', { message: error instanceof Error ? error.message : String(error) });
  }
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

function setGameFont(value, persist = true) {
  const selected = Object.hasOwn(GAME_FONT_STACKS, value) ? value : DEFAULT_SETTINGS.gameFont;
  runtime.settings.gameFont = selected;
  gameFont.value = selected;
  document.documentElement.style.setProperty('--game-text-font', GAME_FONT_STACKS[selected]);
  if (runtime.vm?.waiting && !runtime.vm.choice && runtime.vm.pendingText.length) {
    const text = runtime.vm.pendingText.join('').replace(/^\n+/u, '');
    runtime.vm.dialoguePages = paginateDialogue(runtime.vm.pendingName, text);
    runtime.vm.dialoguePage = Math.min(runtime.vm.dialoguePage, runtime.vm.dialoguePages.length - 1);
    showDialogue(runtime.vm.pendingName, runtime.vm.dialoguePages[runtime.vm.dialoguePage]);
  }
  if (persist) putSetting('gameFont', selected).catch(() => {});
}

function applySettingsSize() {
  if (settingsPopup.hidden) return;
  if (!runtime.settingsSize) {
    // Preserve the original in-game popup dimensions on first use even
    // though the window now lives at viewport level and may grow beyond it.
    settingsPopup.style.width = `${stageWrap.clientWidth * 0.8}px`;
    settingsPopup.style.height = `${stageWrap.clientHeight * 0.88}px`;
    return;
  }
  settingsPopup.style.width = `${window.innerWidth * runtime.settingsSize.width}px`;
  settingsPopup.style.height = `${window.innerHeight * runtime.settingsSize.height}px`;
}

function saveSettingsSize() {
  if (settingsPopup.hidden) return;
  runtime.settingsSize = {
    width: Math.min(.96, Math.max(.3, settingsPopup.offsetWidth / window.innerWidth)),
    height: Math.min(.96, Math.max(.3, settingsPopup.offsetHeight / window.innerHeight)),
  };
  putSetting('settingsSize', runtime.settingsSize).catch(() => {});
}

const settingsHome = settingsPopup.parentNode;
const settingsHomeNextSibling = settingsPopup.nextSibling;

function openSettings() {
  setSkipMode(false);
  backlogPopup.hidden = true;
  if (settingsPopup.parentNode !== document.body) document.body.append(settingsPopup);
  settingsPopup.classList.add('settings-detached');
  settingsPopup.hidden = false;
  requestAnimationFrame(applySettingsSize);
}

function closeSettings() {
  if (!settingsPopup.hidden) saveSettingsSize();
  settingsPopup.hidden = true;
  settingsPopup.classList.remove('settings-detached');
  if (settingsPopup.parentNode !== settingsHome) {
    settingsHome.insertBefore(settingsPopup, settingsHomeNextSibling);
  }
}

function resetRuntimeSettings() {
  runtime.settings.skipReadOnly = DEFAULT_SETTINGS.skipReadOnly;
  skipReadOnly.checked = DEFAULT_SETTINGS.skipReadOnly;
  runtime.settings.stopSkipAtGhostAction = DEFAULT_SETTINGS.stopSkipAtGhostAction;
  stopSkipAtGhostAction.checked = DEFAULT_SETTINGS.stopSkipAtGhostAction;
  runtime.settings.continueVoice = DEFAULT_SETTINGS.continueVoice;
  continueVoice.checked = DEFAULT_SETTINGS.continueVoice;
  setVolume('bgm', DEFAULT_SETTINGS.bgmVolume);
  setVolume('voice', DEFAULT_SETTINGS.voiceVolume);
  setVolume('effect', DEFAULT_SETTINGS.effectVolume);
  setRenderScale(DEFAULT_SETTINGS.renderScale);
  applyBaseDisplayMode(DEFAULT_SETTINGS.displayMode);
  setTextSpeed(DEFAULT_SETTINGS.textSpeed);
  setTextboxTransparency(DEFAULT_SETTINGS.textboxTransparency);
  setGameFont(DEFAULT_SETTINGS.gameFont);
  putSetting('skipReadOnly', DEFAULT_SETTINGS.skipReadOnly).catch(() => {});
  putSetting('stopSkipAtGhostAction', DEFAULT_SETTINGS.stopSkipAtGhostAction).catch(() => {});
  putSetting('continueVoice', DEFAULT_SETTINGS.continueVoice).catch(() => {});
  runtime.settingsSize = null;
  settingsPopup.style.removeProperty('width');
  settingsPopup.style.removeProperty('height');
  putSetting('settingsSize', null).catch(() => {});
  if (!settingsPopup.hidden) applySettingsSize();
}

function setSkipMode(enabled) {
  runtime.skipMode = enabled;
  skipButton.setAttribute('aria-pressed', String(enabled));
  systemSkipButton.setAttribute('aria-pressed', String(enabled));
  if (!enabled && runtime.skipTimer !== null) {
    clearTimeout(runtime.skipTimer);
    runtime.skipTimer = null;
  }
  if (enabled) runtime.vm?.skipActiveAnimation();
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
  // This path is used only by direct player input (canvas/dialogue clicks,
  // Enter, and Space). Automated skipping advances the VM directly.
  if (runtime.skipMode) setSkipMode(false);
  if (runtime.vm?.skipActiveAnimation()) return Promise.resolve();
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
      // STAFF is the original ending-credit scenario. Automatic route input
      // must end here; otherwise its generic mouse gates are instantly
      // selected and TITLE's New Game item is selected immediately afterward.
      if (scenario.name.toUpperCase() === 'STAFF.ISF' && runtime.autoWalkthrough) {
        logRouteDebug('credits-start', {
          route: AUTO_ROUTES[runtime.autoWalkthrough.routeId]?.name,
          enteringScenario: scenario.name,
        });
        runtimeLog('auto-walkthrough-complete', routeDebugSnapshot('credits-start'));
        restoreAutoWalkthrough(null);
      }
      const upperScenario = scenario.name.toUpperCase();
      if (runtime.autoWalkthrough && (
        ['NMED.ISF', 'MIBED.ISF', 'MIED.ISF'].includes(upperScenario)
        || (upperScenario === 'EV_BUNKI.ISF' && runtime.vm?.variables?.[0xC8] >= 28)
      )) {
        logRouteDebug(upperScenario === 'EV_BUNKI.ISF' ? 'ending-fork' : 'ending-selected', {
          enteringScenario: scenario.name,
        });
      }
      if (upperScenario === 'TITLE.ISF' && runtime.screen === 'prologue') {
        const endingVm = runtime.vm;
        runtimeLog('ending-title-handoff', routeDebugSnapshot('ending-title-handoff', {
          enteringScenario: scenario.name,
        }));
        endingVm?.halt();
        if (!runtime.endingTitleHandoff) {
          runtime.endingTitleHandoff = true;
          window.setTimeout(() => {
            if (runtime.vm !== endingVm) {
              runtime.endingTitleHandoff = false;
              return;
            }
            enterTitle().catch(reportRuntimeError).finally(() => {
              runtime.endingTitleHandoff = false;
            });
          }, 0);
        }
      }
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
    onChoice(handlers) {
      if (!runtime.autoWalkthrough) renderChoices(handlers);
    },
    onChoiceClose: hideChoices,
    onDecisionChange(decision) {
      if (decision.available) runtime.decisions.set(decision.kind, decision);
      else runtime.decisions.delete(decision.kind);
      if (decision.available) scheduleAutoDecision(decision);
    },
    onGhostActionChange(available) {
      showGhostAction(runtime.autoWalkthrough ? false : available);
      if (available) {
        if (!runtime.autoWalkthrough && runtime.skipMode && runtime.settings.stopSkipAtGhostAction) {
          setSkipMode(false);
          queueMicrotask(() => runtime.setState('ready', 'Skip stopped at a とりつく action'));
        }
        // Post-scene opportunities wait in SCREEN_MOUSE_INPUT after the
        // dialogue UI has closed. Restore the toolbar so that the authored
        // action can actually be seen and clicked.
        if (!runtime.autoWalkthrough && !runtime.messageInterfaceHidden) {
          systemBar.hidden = false;
          systemActions.hidden = false;
        }
        runtimeLog('ghost-action-window', {
          scenario: runtime.vm?.current()?.scenario.name || null,
          day: runtime.vm?.variables?.[0xC8] ?? null,
          phase: runtime.vm?.variables?.[0xC9] ?? null,
          tableSelection: runtime.vm?.variables?.[0x46] ?? null,
          automatic: Boolean(runtime.autoWalkthrough),
        });
      }
    },
    onGhostActionDebug(detail) {
      const entry = runtimeLog('ghost-action-debug', detail);
      runtime.ghostDebugTrace.push(entry);
      if (runtime.ghostDebugTrace.length > 200) runtime.ghostDebugTrace.splice(0, runtime.ghostDebugTrace.length - 200);
    },
    onPossessionChange(active) {
      showPossessionState(active);
    },
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
      autoWalkthrough: autoWalkthroughState(runtime.autoWalkthrough),
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
    shouldSkipAnimations: () => runtime.skipMode,
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

function logicalPoint(event) {
  const bounds = stage.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * LOGICAL_WIDTH / bounds.width,
    y: (event.clientY - bounds.top) * LOGICAL_HEIGHT / bounds.height,
  };
}

function hitItem(items, point) {
  return items.find(item => point.x >= item.x && point.x < item.x + item.width
    && point.y >= item.y && point.y < item.y + item.height);
}

async function drawOmakeMenu() {
  const [base, selected] = await Promise.all([loadImage('OMAKE_A.GGD'), loadImage('OMAKE_C.GGD')]);
  paint(base);
  const item = OMAKE_ITEMS.find(({ id }) => id === runtime.hover);
  if (item) {
    context.drawImage(selected, 0, item.spriteY, item.width, item.spriteHeight, item.x, item.y, item.width, item.spriteHeight);
  }
}

async function enterOmake() {
  setTitleAutoWalkthroughVisible(false);
  runtime.screen = 'omake';
  runtime.omake = { category: null, viewer: null, miniIndex: 0 };
  runtime.hover = 'cg';
  hideMessage();
  await drawOmakeMenu();
  runtime.setState('ready', 'Original Extras menu');
}

async function drawCgCategories() {
  const [base, selected] = await Promise.all([loadImage('CG-N.GGD'), loadImage('CG-S.GGD')]);
  paint(base);
  const item = CG_CATEGORY_ITEMS.find(({ id }) => id === runtime.hover);
  if (item) context.drawImage(selected, item.x, item.y, item.width, item.height, item.x, item.y, item.width, item.height);
}

async function enterCgCategories() {
  runtime.screen = 'omake-cg';
  runtime.hover = null;
  runtime.omake.category = null;
  await playMusic('L02.WAV');
  await drawCgCategories();
  runtime.setState('ready', 'CG mode · choose a character');
}

function slotUnlocked(gallery, index) {
  return Boolean(runtime.globalFlags[gallery.flags[index]]);
}

function miniUnlocked(gallery, index) {
  return Boolean(runtime.globalFlags[gallery.miniFlags[index]]);
}

async function drawCgGallery() {
  const gallery = CG_GALLERIES[runtime.omake.category];
  paint(await loadImage(gallery.base));
  context.save();
  for (let index = 0; index < gallery.events.length; index += 1) {
    if (slotUnlocked(gallery, index)) continue;
    const slot = CG_SLOTS[index];
    context.fillStyle = '#000';
    context.fillRect(slot.x + 1, slot.y + 1, 112, 83);
  }
  const hovered = Number.isInteger(runtime.hover) ? runtime.hover : -1;
  if (hovered >= 0 && slotUnlocked(gallery, hovered)) {
    const slot = CG_SLOTS[hovered];
    context.strokeStyle = '#fff4cf';
    context.lineWidth = 3;
    context.strokeRect(slot.x - 1.5, slot.y - 1.5, 117, 88);
  }
  context.restore();
}

async function enterCgGallery(category) {
  runtime.screen = 'omake-gallery';
  runtime.omake.category = category;
  runtime.hover = null;
  runtime.omake.viewer = null;
  runtime.omake.miniIndex = 0;
  await drawCgGallery();
  runtime.setState('ready', `CG mode · ${category.toUpperCase()} gallery`);
}

async function showCgAsset(name, kind = 'event', names = [name], index = 0) {
  runtime.omake.viewer = { name, kind, names, index };
  paint(await loadImage(`${name}.GGD`));
  runtime.screen = 'omake-viewer';
  runtime.setState('ready', `${kind === 'mini' ? 'Mini window' : 'CG'} · click or press Escape to return`);
}

async function showMiniWindow() {
  const gallery = CG_GALLERIES[runtime.omake.category];
  const unlocked = gallery.minis.filter((_, index) => miniUnlocked(gallery, index));
  if (!unlocked.length) {
    showMessage('Mini Window', 'No SD artwork has been unlocked for this gallery yet.');
    return;
  }
  runtime.omake.miniIndex %= unlocked.length;
  await drawCgGallery();
  const image = await loadImage(`${unlocked[runtime.omake.miniIndex]}.GGD`);
  const width = Math.min(image.width, 400);
  const height = Math.min(image.height, 300);
  const x = (LOGICAL_WIDTH - width) / 2;
  const y = (LOGICAL_HEIGHT - height) / 2;
  context.save();
  context.fillStyle = 'rgba(28, 17, 22, .55)';
  context.fillRect(0, 68, LOGICAL_WIDTH, LOGICAL_HEIGHT - 68);
  context.fillStyle = '#f4e9d7';
  context.fillRect(x - 3, y - 3, width + 6, height + 6);
  context.drawImage(image, 0, 0, image.width, image.height, x, y, width, height);
  context.restore();
  runtime.omake.viewer = { kind: 'mini-overlay', unlocked };
  runtime.screen = 'omake-mini';
  runtime.setState('ready', 'Mini window · click to see the next SD artwork');
}

async function drawMusicMode() {
  const base = await loadImage('MSC_A.GGD');
  paint(base);
  const hover = runtime.hover;
  const boxes = musicHitboxes();
  const item = boxes.find(({ id }) => id === hover);
  if (item) {
    context.save();
    context.fillStyle = item.id === 'stop' || item.id === 'exit' ? 'rgba(255, 116, 139, .42)' : 'rgba(127, 192, 224, .35)';
    context.fillRect(item.x, item.y, item.width, item.height);
    context.restore();
  }
  if (runtime.musicName) {
    context.save();
    context.fillStyle = 'rgba(76, 45, 48, .88)';
    context.fillRect(225, 443, 190, 25);
    context.fillStyle = '#fff6e7';
    context.font = '15px serif';
    context.textAlign = 'center';
    context.fillText(MUSIC_TRACKS.find(track => track.name === runtime.musicName)?.label || runtime.musicName, 320, 461);
    context.restore();
  }
}

function musicHitboxes() {
  const result = [
    { id: 0, x: 34, y: 107, width: 178, height: 42 },
    { id: 'stop', x: 438, y: 105, width: 92, height: 45 },
    { id: 'exit', x: 15, y: 398, width: 150, height: 45 },
  ];
  for (let index = 1; index <= 5; index += 1) result.push({ id: index, x: 34, y: 151 + (index - 1) * 37, width: 90, height: 30 });
  for (let index = 6; index <= 11; index += 1) result.push({ id: index, x: 508, y: 187 + (index - 6) * 37, width: 92, height: 30 });
  result.push({ id: 12, x: 305, y: 418, width: 310, height: 50 });
  return result;
}

async function enterMusicMode() {
  runtime.screen = 'omake-music';
  runtime.hover = null;
  await drawMusicMode();
  runtime.setState('ready', 'Music mode · original soundtrack player');
}

async function enterTitle() {
  runtime.releaseCoverOnTransition = false;
  clearTransitionCover();
  setSkipMode(false);
  runtime.decisions.clear();
  restoreAutoWalkthrough(null);
  showGhostAction(false);
  showPossessionState(false);
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
  setTitleAutoWalkthroughVisible(true);
  settingsButton.disabled = false;
  loadButton.disabled = false;
  runtime.setState('ready', 'TITLE.isf · interactive title menu');
}

async function beginNewGame(autoRoute = null) {
  // Keep the title visible until all first-scene data is ready. Fading first
  // would turn ordinary loading time into a conspicuous black-screen stall.
  const warmedScenarios = await warmNewGameAssets().catch(error => {
    runtimeLog('new-game-warmup-error', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  });
  await animateTransitionCover(true, 500, 'new-game');
  restoreAutoWalkthrough(autoRoute ? { routeId: autoRoute } : null);
  setTitleAutoWalkthroughVisible(false);
  runtime.decisions.clear();
  showGhostAction(false);
  showPossessionState(false);
  runtime.screen = 'prologue';
  runtime.hover = null;
  hideMessage();
  hideDialogue();
  hideChoices();
  setInspector(false);
  runtime.setState('', 'Starting original LOAD.isf entry chain');
  runtime.executionTrace = [];
  runtime.ghostDebugTrace = [];
  runtimeLog('new-game', { entry: 'LOAD.isf', autoRoute });
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
  return hitItem(TITLE_ITEMS, logicalPoint(event));
}

async function activateTitleItem(id) {
  if (id === 'new') return beginNewGame();
  if (id === 'continue') {
    return openSaveDialog('load');
  }
  if (id === 'extras') {
    return enterOmake();
  }
  showMessage('Exit', 'Close this browser tab when finished. Stop the local data server with Ctrl+C.');
}

async function leaveOmakeScreen() {
  hideMessage();
  if (runtime.screen === 'omake' || runtime.screen === 'omake-cg' || runtime.screen === 'omake-music') {
    await enterTitle();
  } else if (runtime.screen === 'omake-gallery') {
    await enterCgCategories();
  } else if (runtime.screen === 'omake-viewer' || runtime.screen === 'omake-mini') {
    runtime.screen = 'omake-gallery';
    runtime.omake.viewer = null;
    await drawCgGallery();
  }
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
      day: runtime.vm.variables?.[0xC8] ?? null,
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
    hideChoices();
    runtime.decisions.clear();
    if (!runtime.vm) {
      runtime.vm = makeVM();
      runtime.vm.seedDisplay(stage);
    }
    saveDialog.close();
    await animateTransitionCover(true, 350, 'load-save');
    runtime.screen = 'prologue';
    setTitleAutoWalkthroughVisible(false);
    runtime.hover = null;
    hideMessage();
    startButton.hidden = true;
    const restoreStarted = performance.now();
    restoreAutoWalkthrough(record.state?.externalState?.autoWalkthrough);
    await runtime.vm.importState(record.state);
    if (runtime.autoWalkthrough) {
      logRouteDebug('save-loaded', { slot: record.slot, savedScenario: record.scenario });
    }
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
  const firstSlot = runtime.savePage * SAVE_SLOTS_PER_PAGE + 1;
  const lastSlot = Math.min(SAVE_SLOTS, firstSlot + SAVE_SLOTS_PER_PAGE - 1);
  for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
    const record = records.get(slot);
    const wrapper = document.createElement('div');
    wrapper.className = 'save-record';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'save-slot';
    button.disabled = runtime.saveMode === 'load' && !record;
    button.addEventListener('click', () => {
      if (runtime.saveMode === 'save') {
        if (record && !window.confirm(`Overwrite save slot ${slot}? The existing save will be replaced.`)) return;
        saveToSlot(slot);
      }
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
      const day = document.createElement('small');
      day.className = 'save-calendar';
      const savedDay = Number.isInteger(record.day)
        ? record.day
        : record.state?.variables?.[0xC8];
      day.textContent = Number.isInteger(savedDay) ? `Day ${savedDay}` : 'Day unavailable';
      const excerpt = document.createElement('small');
      excerpt.lang = 'ja';
      excerpt.textContent = [record.speaker, record.excerpt].filter(Boolean).join(' · ');
      button.append(preview, title, date, day, excerpt);

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
  renderSavePages();
}

function renderSavePages() {
  savePages.replaceChildren();
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'save-page-step';
  previous.textContent = '‹';
  previous.title = 'Previous save page';
  previous.disabled = runtime.savePage === 0;
  previous.addEventListener('click', () => selectSavePage(runtime.savePage - 1));
  const numbers = document.createElement('div');
  numbers.className = 'save-page-numbers';
  for (let page = 0; page < SAVE_PAGES; page += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(page + 1);
    button.title = `Slots ${page * SAVE_SLOTS_PER_PAGE + 1}–${Math.min(SAVE_SLOTS, (page + 1) * SAVE_SLOTS_PER_PAGE)}`;
    button.setAttribute('aria-current', page === runtime.savePage ? 'page' : 'false');
    button.addEventListener('click', () => selectSavePage(page));
    numbers.append(button);
  }
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'save-page-step';
  next.textContent = '›';
  next.title = 'Next save page';
  next.disabled = runtime.savePage === SAVE_PAGES - 1;
  next.addEventListener('click', () => selectSavePage(runtime.savePage + 1));
  savePages.append(previous, numbers, next);
  numbers.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function selectSavePage(page) {
  const next = Math.min(SAVE_PAGES - 1, Math.max(0, page));
  if (next === runtime.savePage) return;
  runtime.savePage = next;
  saveGrid.scrollTop = 0;
  renderSaveSlots().catch(error => { saveStatus.textContent = error.message; });
}

function applySaveDialogSize() {
  if (!saveDialog.open) return;
  if (!runtime.saveDialogSize) {
    saveDialog.style.removeProperty('width');
    saveDialog.style.removeProperty('height');
    return;
  }
  saveDialog.style.width = `${window.innerWidth * runtime.saveDialogSize.width}px`;
  saveDialog.style.height = `${window.innerHeight * runtime.saveDialogSize.height}px`;
}

function saveSaveDialogSize() {
  if (!saveDialog.open) return;
  runtime.saveDialogSize = {
    width: Math.min(.98, Math.max(.32, saveDialog.offsetWidth / window.innerWidth)),
    height: Math.min(.98, Math.max(.4, saveDialog.offsetHeight / window.innerHeight)),
  };
  putSetting('saveDialogSizeV2', runtime.saveDialogSize).catch(() => {});
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
  requestAnimationFrame(applySaveDialogSize);
  await renderSaveSlots();
}

async function bootstrap() {
  try {
    runtimeLog('bootstrap', { userAgent: navigator.userAgent });
    const [manifestResponse, readMessages, readOnly, savedStopSkipAtGhostAction, savedContinueVoice, savedBgm, savedVoice, savedEffect, savedBacklogPosition, savedBacklogSize, savedRenderScale, savedDisplayMode, savedTextSpeed, savedTextboxTransparency, savedGameFont, savedSettingsSize, savedSaveDialogSize, savedGlobalFlags] = await Promise.all([
      api('/api/manifest'),
      listReadMessages().catch(() => []),
      getSetting('skipReadOnly', true).catch(() => true),
      getSetting('stopSkipAtGhostAction', true).catch(() => true),
      getSetting('continueVoice', true).catch(() => true),
      getSetting('bgmVolume', 65).catch(() => 65),
      getSetting('voiceVolume', 100).catch(() => 100),
      getSetting('effectVolume', 100).catch(() => 100),
      getSetting('backlogPosition', { x: 0.5, y: 9 / 38 }).catch(() => ({ x: 0.5, y: 9 / 38 })),
      getSetting('backlogSize', null).catch(() => null),
      getSetting('renderScale', 1).catch(() => 1),
      getSetting('displayMode', DEFAULT_SETTINGS.displayMode).catch(() => DEFAULT_SETTINGS.displayMode),
      getSetting('textSpeed', DEFAULT_SETTINGS.textSpeed).catch(() => DEFAULT_SETTINGS.textSpeed),
      getSetting('textboxTransparency', DEFAULT_SETTINGS.textboxTransparency).catch(() => DEFAULT_SETTINGS.textboxTransparency),
      getSetting('gameFont', DEFAULT_SETTINGS.gameFont).catch(() => DEFAULT_SETTINGS.gameFont),
      getSetting('settingsSize', null).catch(() => null),
      getSetting('saveDialogSizeV2', null).catch(() => null),
      getSetting('globalFlags', null).catch(() => null),
    ]);
    runtime.manifest = await manifestResponse.json();
    runtime.readMessages = new Set(readMessages);
    runtime.globalFlags = flagBank(savedGlobalFlags);
    runtime.settings.skipReadOnly = Boolean(readOnly);
    skipReadOnly.checked = runtime.settings.skipReadOnly;
    runtime.settings.stopSkipAtGhostAction = Boolean(savedStopSkipAtGhostAction);
    stopSkipAtGhostAction.checked = runtime.settings.stopSkipAtGhostAction;
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
        width: Math.min(.96, Math.max(.3, savedSettingsSize.width)),
        height: Math.min(.96, Math.max(.3, savedSettingsSize.height)),
      };
    }
    if (savedSaveDialogSize && Number.isFinite(savedSaveDialogSize.width) && Number.isFinite(savedSaveDialogSize.height)) {
      runtime.saveDialogSize = {
        width: Math.min(.98, Math.max(.32, savedSaveDialogSize.width)),
        height: Math.min(.98, Math.max(.4, savedSaveDialogSize.height)),
      };
    }
    setVolume('bgm', savedBgm, false);
    setVolume('voice', savedVoice, false);
    setVolume('effect', savedEffect, false);
    setRenderScale(savedRenderScale, false, false);
    applyBaseDisplayMode(savedDisplayMode, false);
    setTextSpeed(savedTextSpeed, false);
    setTextboxTransparency(savedTextboxTransparency, false);
    setGameFont(savedGameFont, false);
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
  const point = logicalPoint(event);
  let next = null;
  if (runtime.screen === 'title') next = itemAt(event)?.id || null;
  else if (runtime.screen === 'omake') next = hitItem(OMAKE_ITEMS, point)?.id || null;
  else if (runtime.screen === 'omake-cg') next = hitItem(CG_CATEGORY_ITEMS, point)?.id || null;
  else if (runtime.screen === 'omake-gallery') {
    if (point.x >= 493 && point.x < 557 && point.y >= 24 && point.y < 56) next = 'mini';
    else if (point.x >= 567 && point.x < 631 && point.y >= 24 && point.y < 56) next = 'back';
    else next = CG_SLOTS.findIndex((slot, index) => index < CG_GALLERIES[runtime.omake.category].events.length
      && point.x >= slot.x && point.x < slot.x + 114 && point.y >= slot.y && point.y < slot.y + 85);
    if (next === -1) next = null;
  } else if (runtime.screen === 'omake-music') next = hitItem(musicHitboxes(), point)?.id ?? null;
  else return;
  stage.style.cursor = next ? 'pointer' : 'default';
  if (next === 0) stage.style.cursor = 'pointer';
  if (next !== runtime.hover) {
    runtime.hover = next;
    if (runtime.screen === 'title') drawTitle().catch(reportRuntimeError);
    else if (runtime.screen === 'omake') drawOmakeMenu().catch(reportRuntimeError);
    else if (runtime.screen === 'omake-cg') drawCgCategories().catch(reportRuntimeError);
    else if (runtime.screen === 'omake-gallery') drawCgGallery().catch(reportRuntimeError);
    else if (runtime.screen === 'omake-music') drawMusicMode().catch(reportRuntimeError);
  }
});

stage.addEventListener('pointerleave', () => {
  if (!['title', 'omake', 'omake-cg', 'omake-gallery', 'omake-music'].includes(runtime.screen) || runtime.hover === null) return;
  runtime.hover = null;
  stage.style.cursor = 'default';
  if (runtime.screen === 'title') drawTitle().catch(reportRuntimeError);
  else if (runtime.screen === 'omake') drawOmakeMenu().catch(reportRuntimeError);
  else if (runtime.screen === 'omake-cg') drawCgCategories().catch(reportRuntimeError);
  else if (runtime.screen === 'omake-gallery') drawCgGallery().catch(reportRuntimeError);
  else if (runtime.screen === 'omake-music') drawMusicMode().catch(reportRuntimeError);
});

stage.addEventListener('click', event => {
  if (runtime.screen === 'prologue' && !gamePopupOpen()) {
    advanceDialogue()?.catch(reportRuntimeError);
  } else if (runtime.screen === 'title') {
    const item = itemAt(event);
    if (item) activateTitleItem(item.id).catch(reportRuntimeError);
  } else if (runtime.screen === 'omake') {
    const item = hitItem(OMAKE_ITEMS, logicalPoint(event));
    if (item?.id === 'cg') enterCgCategories().catch(reportRuntimeError);
    else if (item?.id === 'music') enterMusicMode().catch(reportRuntimeError);
    else if (item?.id === 'back') leaveOmakeScreen().catch(reportRuntimeError);
  } else if (runtime.screen === 'omake-cg') {
    const item = hitItem(CG_CATEGORY_ITEMS, logicalPoint(event));
    if (item) enterCgGallery(item.id).catch(reportRuntimeError);
  } else if (runtime.screen === 'omake-gallery') {
    const point = logicalPoint(event);
    if (point.x >= 493 && point.x < 557 && point.y >= 24 && point.y < 56) {
      showMiniWindow().catch(reportRuntimeError);
    } else if (point.x >= 567 && point.x < 631 && point.y >= 24 && point.y < 56) {
      leaveOmakeScreen().catch(reportRuntimeError);
    } else {
      const index = CG_SLOTS.findIndex((slot, slotIndex) => slotIndex < CG_GALLERIES[runtime.omake.category].events.length
        && point.x >= slot.x && point.x < slot.x + 114 && point.y >= slot.y && point.y < slot.y + 85);
      const gallery = CG_GALLERIES[runtime.omake.category];
      if (index >= 0 && slotUnlocked(gallery, index)) {
        const names = [gallery.events[index], ...(gallery.variants?.[index] || [])
          .filter(variant => runtime.globalFlags[variant.flag]).map(variant => variant.name)];
        showCgAsset(names[0], 'event', names, 0).catch(reportRuntimeError);
      }
    }
  } else if (runtime.screen === 'omake-viewer') {
    const viewer = runtime.omake.viewer;
    if (viewer.index + 1 < viewer.names.length) {
      const index = viewer.index + 1;
      showCgAsset(viewer.names[index], viewer.kind, viewer.names, index).catch(reportRuntimeError);
    } else leaveOmakeScreen().catch(reportRuntimeError);
  } else if (runtime.screen === 'omake-mini') {
    const { unlocked } = runtime.omake.viewer;
    runtime.omake.miniIndex = (runtime.omake.miniIndex + 1) % unlocked.length;
    showMiniWindow().catch(reportRuntimeError);
  } else if (runtime.screen === 'omake-music') {
    const item = hitItem(musicHitboxes(), logicalPoint(event));
    if (Number.isInteger(item?.id)) {
      playMusic(MUSIC_TRACKS[item.id].name).then(drawMusicMode).catch(reportRuntimeError);
    } else if (item?.id === 'stop') {
      stopMusic();
      drawMusicMode().catch(reportRuntimeError);
    } else if (item?.id === 'exit') leaveOmakeScreen().catch(reportRuntimeError);
  }
});

stage.addEventListener('wheel', event => {
  if (event.target.closest('.game-popup')) return;
  if (runtime.screen === 'prologue' && event.deltaY < 0 && !saveDialog.open) {
    event.preventDefault();
    openBacklog();
  }
}, { passive: false });

autoWalkthroughButton.addEventListener('click', event => {
  event.stopPropagation();
  if (runtime.screen === 'title') autoRoutePicker.hidden = false;
});
closeAutoRoute.addEventListener('click', hideAutoRoutePicker);
autoRoutePicker.addEventListener('click', event => {
  event.stopPropagation();
  const button = event.target.closest('[data-auto-route]');
  if (!button || button.disabled) return;
  hideAutoRoutePicker();
  beginNewGame(button.dataset.autoRoute).catch(reportRuntimeError);
});

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
  if (settingsPopup.hidden) openSettings();
  else closeSettings();
});
for (const popup of [backlogPopup, settingsPopup]) popup.addEventListener('click', event => event.stopPropagation());
backlogPopup.querySelector('[data-popup-close]').addEventListener('click', () => { backlogPopup.hidden = true; });
settingsPopup.querySelector('[data-popup-close]').addEventListener('click', closeSettings);
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
  if (!autoRoutePicker.hidden) {
    hideAutoRoutePicker();
  } else if (!backlogPopup.hidden) {
    backlogPopup.hidden = true;
  } else if (!settingsPopup.hidden) {
    closeSettings();
  } else if (!saveDialog.open && runtime.screen === 'prologue' && runtime.vm?.waiting) {
    setMessageInterfaceHidden(!runtime.messageInterfaceHidden);
  } else if (runtime.screen.startsWith('omake')) {
    leaveOmakeScreen().catch(reportRuntimeError);
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

stopSkipAtGhostAction.addEventListener('change', () => {
  runtime.settings.stopSkipAtGhostAction = stopSkipAtGhostAction.checked;
  putSetting('stopSkipAtGhostAction', runtime.settings.stopSkipAtGhostAction).catch(() => {});
});

continueVoice.addEventListener('change', () => {
  runtime.settings.continueVoice = continueVoice.checked;
  putSetting('continueVoice', runtime.settings.continueVoice).catch(() => {});
});
textSpeed.addEventListener('input', () => setTextSpeed(textSpeed.value, false));
textSpeed.addEventListener('change', () => setTextSpeed(textSpeed.value, true));
textboxTransparency.addEventListener('input', () => setTextboxTransparency(textboxTransparency.value, false));
textboxTransparency.addEventListener('change', () => setTextboxTransparency(textboxTransparency.value, true));
gameFont.addEventListener('change', () => setGameFont(gameFont.value, true));
for (const [kind, input] of [['bgm', bgmVolume], ['voice', voiceVolume], ['effect', effectVolume]]) {
  input.addEventListener('input', () => setVolume(kind, input.value, false));
  input.addEventListener('change', () => setVolume(kind, input.value, true));
}
renderScale.addEventListener('input', () => setRenderScale(renderScale.value, false, true));
renderScale.addEventListener('change', () => setRenderScale(renderScale.value, true, true));
displayMode.addEventListener('change', () => {
  setDisplayMode(displayMode.value, true).catch(reportRuntimeError);
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    document.body.dataset.displayMode = 'fullscreen';
    displayMode.value = 'fullscreen';
  } else {
    applyBaseDisplayMode(runtime.fullscreenReturnMode || runtime.settings.displayMode, false);
  }
});
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
  if (saveDialog.open) saveSaveDialogSize();
});
window.addEventListener('resize', () => {
  applyBacklogPosition();
  applySettingsSize();
  applySaveDialogSize();
});
saveDialog.addEventListener('close', () => {
  for (const url of runtime.previewUrls) URL.revokeObjectURL(url);
  runtime.previewUrls = [];
});
for (const button of document.querySelectorAll('[data-system-action]')) {
  button.addEventListener('click', event => {
    event.stopPropagation();
    const action = button.dataset.systemAction;
    if (action === 'skip') toggleSkip();
    else if (action === 'ghost') {
      runtimeLog('ghost-action-click', {
        scenario: runtime.vm?.current()?.scenario.name || null,
        day: runtime.vm?.variables?.[0xC8] ?? null,
        phase: runtime.vm?.variables?.[0xC9] ?? null,
        tableSelection: runtime.vm?.variables?.[0x46] ?? null,
      });
      runtime.vm?.selectDecision('ghost').catch(reportRuntimeError);
    }
    else if (action === 'load') openSaveDialog('load');
    else if (action === 'title') {
      if (window.confirm('Return to the title screen? Unsaved progress will be lost.')) {
        enterTitle().catch(reportRuntimeError);
      }
    } else if (action === 'close') {
      setMessageInterfaceHidden(true);
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
  if (event.key === 'Escape' && !autoRoutePicker.hidden) {
    event.preventDefault();
    hideAutoRoutePicker();
  } else if (event.key === 'Escape' && !settingsPopup.hidden) {
    event.preventDefault();
    closeSettings();
  } else if (event.key === 'Escape' && !backlogPopup.hidden) {
    event.preventDefault();
    backlogPopup.hidden = true;
  } else if (event.key === 'Escape' && runtime.screen.startsWith('omake')) {
    event.preventDefault();
    leaveOmakeScreen().catch(reportRuntimeError);
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
