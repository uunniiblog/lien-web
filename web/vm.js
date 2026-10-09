function bytes(hex) {
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function word(data, offset = 0) {
  return data[offset] | (data[offset + 1] << 8);
}

function dword(data, offset = 0) {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function cstring(data, offset = 0) {
  let end = offset;
  while (end < data.length && data[end]) end += 1;
  return new TextDecoder('ascii').decode(data.subarray(offset, end));
}

function textHash(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const CLEAN_VIEW_SURFACE = -1;
const INTERFACE_SURFACES = new Set([4, 5, 6, 7, 9, 13, 14, 16, 25]);
// Canonical destination rectangles declared by MAP2. Some route scenarios
// enter SCREEN_MOUSE_INPUT before MAP2 has installed these handlers, while
// still using the one-based destination slots 0xDD..0xE7 to identify the
// visible map character (0xDD corresponds to handler 0).
const MAP_DESTINATION_HITBOXES = [
  [260, 129, 318, 209], [196, 115, 254, 195], [196, 195, 254, 275],
  [371, 49, 429, 129], [115, 186, 173, 266], [386, 129, 444, 209],
  [290, 40, 348, 120], [209, 35, 267, 115], [429, 9, 487, 89],
  [0, 0, 0, 0], [326, 129, 384, 209],
];

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not capture game surface')), 'image/png');
  });
}

async function drawBlob(canvas, blob) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class LienVM {
  constructor(options) {
    this.stage = options.stage;
    this.context = this.stage.getContext('2d', { alpha: false });
    this.fetchScenario = options.fetchScenario;
    this.fetchImage = options.fetchImage;
    this.onScenario = options.onScenario;
    this.onDialogue = options.onDialogue;
    this.onDialogueClose = options.onDialogueClose;
    this.paginateDialogue = options.paginateDialogue || ((name, text) => [text]);
    this.isMessageRead = options.isMessageRead || (() => false);
    this.markMessageRead = options.markMessageRead || (() => {});
    this.onDialogueReady = options.onDialogueReady || (() => {});
    this.onBacklogChange = options.onBacklogChange || (() => {});
    this.onChoice = options.onChoice || (() => {});
    this.onChoiceClose = options.onChoiceClose || (() => {});
    // Decision notifications are deliberately separate from presentation.
    // A future route planner can consume these and call selectDecision()
    // without synthesizing pointer events in the browser UI.
    this.onDecisionChange = options.onDecisionChange || (() => {});
    this.onGhostActionChange = options.onGhostActionChange || (() => {});
    this.onGhostActionDebug = options.onGhostActionDebug || (() => {});
    this.onPossessionChange = options.onPossessionChange || (() => {});
    this.loadGlobalFlags = options.loadGlobalFlags || (() => new Uint8Array(8192));
    this.saveGlobalFlags = options.saveGlobalFlags || (() => {});
    this.onState = options.onState;
    this.playMusic = options.playMusic;
    this.stopMusic = options.stopMusic;
    this.playVoice = options.playVoice;
    this.stopVoice = options.stopVoice || (() => {});
    this.continueVoiceAfterAdvance = options.continueVoiceAfterAdvance || (() => true);
    this.playEffect = options.playEffect || (() => {});
    this.stopEffects = options.stopEffects || (() => {});
    this.onTrace = options.onTrace || (() => {});
    this.onTransition = options.onTransition || (() => {});
    this.onTransitionFrame = options.onTransitionFrame || (() => {});
    this.getExternalState = options.getExternalState || (() => ({}));
    this.shouldSkipAnimations = options.shouldSkipAnimations || (() => false);

    this.scenarios = new Map();
    this.frames = [];
    this.variables = new Int32Array(8192);
    this.flags = new Uint8Array(8192);
    this.systemFlags = new Uint8Array(8192);
    this.surfaces = new Map();
    this.surfaceVersions = new Map();
    this.surfaceSnapshots = new Map();
    this.colorKeySurfaces = new Map();
    this.pendingText = [];
    this.pendingName = '';
    this.pendingVoice = null;
    this.dialoguePages = [];
    this.dialoguePage = 0;
    this.currentMessageId = '';
    this.currentMessageWasRead = false;
    this.backlog = [];
    this.inputHandlers = [];
    this.choice = null;
    this.choiceCallback = null;
    this.choiceBusy = false;
    this.commandOptions = new Map();
    this.commandWindow = { x: 0, y: 0, width: 640, height: 480 };
    this.specialActionMode = false;
    // Flag 0x50 defaults to zero when GAME.SAV is cleared, so its value alone
    // cannot distinguish an authored TUKI_ON window from an uninitialised
    // game. Track whether the script explicitly opened that window.
    this.ghostActionArmed = false;
    this.ghostActionAvailable = false;
    this.ghostActionBusy = false;
    this.possessionActive = false;
    this.activePortrait = null;
    this.waiting = false;
    this.running = false;
    this.delay = 0;
    this.animationSkipRequested = false;
    this.activeAnimation = null;
    this.unsupported = new Set();
    this.effectName = 'YUS_01.wav';
    this.voiceCompletion = Promise.resolve();
    this.waitForVoice = false;
    this.skipNextFadeOut = false;
    this.migrations = [];
    const cleanView = this.surface(CLEAN_VIEW_SURFACE);
    cleanView.getContext('2d').fillRect(0, 0, cleanView.width, cleanView.height);
    this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
  }

  async scenario(name) {
    const filename = name.toLowerCase().endsWith('.isf') ? name : `${name}.isf`;
    const key = filename.toUpperCase();
    if (!this.scenarios.has(key)) this.scenarios.set(key, this.fetchScenario(filename));
    return this.scenarios.get(key);
  }

  frameFor(scenario) {
    const offsets = new Map(scenario.operations.map((operation, index) => [operation.offset, index]));
    return { scenario, offsets, ip: 0, calls: [] };
  }

  async start(name) {
    this.frames = [this.frameFor(await this.scenario(name))];
    // The browser-native title replaces TITLE.isf, whose New Game path fills
    // the possession-power gauge (variable 0x0A) to 100. LOAD.isf only sets
    // the required action threshold (0x10) to 10, so omitting this title-side
    // initialization makes every conditional TUKI_ON gate fail as 0 >= 10.
    if (this.frames[0].scenario.name.toUpperCase() === 'LOAD.ISF') {
      this.setVariable(0x0A, 100);
    }
    this.onScenario(this.frames[0].scenario);
    this.pendingText = [];
    this.pendingName = '';
    this.pendingVoice = null;
    this.dialoguePages = [];
    this.dialoguePage = 0;
    this.currentMessageId = '';
    this.currentMessageWasRead = false;
    this.backlog = [];
    this.inputHandlers = [];
    this.choice = null;
    this.choiceCallback = null;
    this.choiceBusy = false;
    this.commandOptions.clear();
    this.commandWindow = { x: 0, y: 0, width: 640, height: 480 };
    this.specialActionMode = false;
    this.ghostActionArmed = false;
    this.ghostActionBusy = false;
    this.setGhostActionAvailable(false);
    this.setPossessionActive(false);
    this.activePortrait = null;
    this.waiting = false;
    this.running = true;
    await this.run();
  }

  current() {
    return this.frames[this.frames.length - 1];
  }

  halt() {
    this.frames = [];
    this.running = false;
    this.waiting = false;
    this.choice = null;
    this.setGhostActionAvailable(false);
    this.setPossessionActive(false);
  }

  decodeValue(value) {
    let decoded = value >>> 0;
    if (decoded & 0x80000000) decoded = this.variables[decoded & 0x7fffffff] >>> 0;
    if (decoded & 0x40000000) decoded |= 0x80000000;
    return decoded | 0;
  }

  value(data, offset = 0) {
    return this.decodeValue(dword(data, offset));
  }

  setVariable(index, value) {
    this.variables[index] = (value >>> 0) & 0x7fffffff;
    if (value < 0) this.variables[index] |= 0x40000000;
  }

  emitDecision(kind, available, options = []) {
    this.onDecisionChange({ kind, available, options });
  }

  setGhostActionAvailable(available) {
    const next = Boolean(available);
    if (next === this.ghostActionAvailable) return;
    this.ghostActionAvailable = next;
    this.onGhostActionChange(next);
    this.emitDecision('ghost', next, next ? [{ id: 0 }] : []);
  }

  setPossessionActive(active) {
    const next = Boolean(active);
    if (next === this.possessionActive) return;
    this.possessionActive = next;
    this.onPossessionChange(next);
    this.ghostDebug(next ? 'possession-started' : 'possession-ended');
  }

  ghostDebug(event, extra = {}) {
    const frame = this.current();
    this.onGhostActionDebug({
      event,
      scenario: frame?.scenario.name || null,
      instructionIndex: frame?.ip ?? null,
      waiting: this.waiting,
      choiceKind: this.choice?.kind || null,
      choiceTargets: this.choice?.handlers?.length || 0,
      armed: this.ghostActionArmed,
      unavailableFlag: this.flags[0x50],
      available: this.ghostActionAvailable,
      busy: this.ghostActionBusy,
      tableSelection: this.variables[0x46],
      ...extra,
    });
  }

  refreshGhostAction(reason = 'refresh') {
    const next = this.ghostActionArmed && this.flags[0x50] === 0 && this.waiting
      && !this.ghostActionBusy;
    if (next !== this.ghostActionAvailable || reason !== 'refresh') {
      this.ghostDebug('availability-check', { reason, calculated: next });
    }
    this.setGhostActionAvailable(next);
  }

  async mergeGlobalFlags() {
    const saved = await this.loadGlobalFlags();
    if (!saved) return;
    const values = ArrayBuffer.isView(saved) ? saved : Array.isArray(saved) ? saved : [];
    const limit = Math.min(this.flags.length, values.length);
    // The original FLAGS_SAVE bank consists of monotonic route/completion
    // unlocks. OR merging prevents an older slot from relocking progress.
    for (let index = 0; index < limit; index += 1) {
      if (values[index]) this.flags[index] = 1;
    }
    this.refreshGhostAction();
  }

  async selectDecision(kind, id = 0) {
    if (kind === 'ghost') return this.selectGhostAction();
    const activeKind = this.choice?.kind === 'command' ? 'dialogue' : this.choice?.kind;
    if (kind !== activeKind) return false;
    await this.selectChoice(id);
    return true;
  }

  async selectGhostAction() {
    this.ghostDebug('selection-attempt');
    if (!this.ghostActionAvailable || this.ghostActionBusy) {
      this.ghostDebug('selection-rejected');
      return false;
    }
    this.ghostActionBusy = true;
    this.ghostActionArmed = false;
    this.flags[0x50] = 1;
    this.refreshGhostAction();

    // Several original opportunities (including AF_AK11 and AF_AK14) open
    // TUKI_ON only after the dialogue subroutine returns, while the scenario
    // is waiting in SCREEN_MOUSE_INPUT. The toolbar action supersedes that
    // ordinary continue target, so discard the pending input before entering
    // TORITUKI instead of requiring there to be no active choice.
    if (this.choice) {
      const kind = this.choice.kind === 'command' ? 'dialogue' : 'map';
      this.choice = null;
      this.choiceCallback = null;
      this.onChoiceClose();
      this.emitDecision(kind, false);
    }

    // The original toolbar dispatches TORITUKI asynchronously while a line
    // is on screen. Its table immediately enters the appropriate B-event;
    // pushing it here preserves that behavior without advancing the line.
    this.pendingText = [];
    this.pendingName = '';
    this.pendingVoice = null;
    this.dialoguePages = [];
    this.dialoguePage = 0;
    this.currentMessageId = '';
    this.currentMessageWasRead = false;
    this.onDialogueClose();
    const next = this.frameFor(await this.scenario('TORITUKI.isf'));
    this.frames.push(next);
    this.onScenario(next.scenario);
    this.ghostDebug('selection-dispatched', { target: next.scenario.name });
    this.waiting = false;
    try {
      await this.run();
      return true;
    } finally {
      this.ghostActionBusy = false;
      this.refreshGhostAction();
    }
  }

  jump(frame, tableIndex) {
    const relative = frame.scenario.jumps[tableIndex];
    if (relative === undefined) throw new Error(`Invalid jump ${tableIndex} in ${frame.scenario.name}`);
    const target = frame.scenario.scriptOffset + relative;
    const ip = frame.offsets.get(target);
    if (ip === undefined) throw new Error(`Jump target ${target.toString(16)} is not an instruction`);
    frame.ip = ip;
  }

  surface(index, width = 640, height = 480) {
    if (!this.surfaces.has(index)) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      this.surfaces.set(index, canvas);
      this.surfaceVersions.set(index, 0);
    }
    return this.surfaces.get(index);
  }

  markSurfaceDirty(index) {
    this.surfaceVersions.set(index, (this.surfaceVersions.get(index) || 0) + 1);
    this.surfaceSnapshots.delete(index);
    this.colorKeySurfaces.delete(index);
  }

  colorKeySurface(index, source) {
    const version = this.surfaceVersions.get(index) || 0;
    const cached = this.colorKeySurfaces.get(index);
    if (cached?.version === version) return cached.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const target = canvas.getContext('2d', { willReadFrequently: true });
    target.drawImage(source, 0, 0);
    const pixels = target.getImageData(0, 0, canvas.width, canvas.height);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      if (pixels.data[offset] === 0 && pixels.data[offset + 1] === 0 && pixels.data[offset + 2] === 0) {
        pixels.data[offset + 3] = 0;
      }
    }
    target.putImageData(pixels, 0, 0);
    this.colorKeySurfaces.set(index, { version, canvas });
    return canvas;
  }

  present() {
    this.presentSurface(this.surface(0));
  }

  presentBackground() {
    this.presentSurface(this.surfaces.get(CLEAN_VIEW_SURFACE) || this.surfaces.get(2) || this.surface(0));
  }

  presentSurface(display) {
    const scale = this.stage.width / 640;
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.fillStyle = '#000';
    this.context.fillRect(0, 0, this.stage.width, this.stage.height);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    this.context.drawImage(display, 0, 0);
  }

  canvasCopy(source) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  }

  seedDisplay(display = this.stage) {
    const destination = this.surface(0);
    const target = destination.getContext('2d');
    target.clearRect(0, 0, destination.width, destination.height);
    target.drawImage(
      display, 0, 0, display.width, display.height,
      0, 0, destination.width, destination.height,
    );
    this.markSurfaceDirty(0);
    const cleanView = this.surface(CLEAN_VIEW_SURFACE, destination.width, destination.height);
    cleanView.width = destination.width;
    cleanView.height = destination.height;
    cleanView.getContext('2d').drawImage(destination, 0, 0);
    this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
  }

  async animate(duration, draw) {
    const milliseconds = Math.max(0, Math.min(10000, Number(duration) || 0));
    if (!milliseconds || this.animationSkipRequested || this.shouldSkipAnimations()) {
      draw(1);
      return { elapsed: 0, frames: 1, maxFrameGap: 0, skipped: true };
    }
    // Establish the first frame before yielding. Otherwise the browser can
    // briefly paint a surface prepared by the script between two transitions.
    draw(0);
    const started = performance.now();
    let previous = started;
    let frames = 1;
    let maxFrameGap = 0;
    await new Promise(resolve => {
      let request = 0;
      let finished = false;
      const finish = (drawFinal = true) => {
        if (finished) return;
        finished = true;
        if (request) cancelAnimationFrame(request);
        if (drawFinal) draw(1);
        resolve();
      };
      const active = { finish: () => finish(true) };
      this.activeAnimation = active;
      const frame = now => {
        if (finished) return;
        maxFrameGap = Math.max(maxFrameGap, now - previous);
        previous = now;
        frames += 1;
        const progress = Math.min(1, (now - started) / milliseconds);
        draw(progress);
        if (progress >= 1) finish(false);
        else request = requestAnimationFrame(frame);
      };
      request = requestAnimationFrame(frame);
    }).finally(() => {
      this.activeAnimation = null;
    });
    return {
      elapsed: performance.now() - started,
      frames,
      maxFrameGap,
    };
  }

  skipActiveAnimation() {
    if (!this.running || this.waiting) return false;
    this.animationSkipRequested = true;
    this.activeAnimation?.finish();
    return true;
  }

  clearAnimationSkip() {
    this.animationSkipRequested = false;
  }

  async waitAnimationDelay(duration) {
    const milliseconds = Math.max(0, Math.min(10000, Number(duration) || 0));
    if (!milliseconds || this.animationSkipRequested || this.shouldSkipAnimations()) return;
    await new Promise(resolve => {
      let finished = false;
      let timer = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      };
      this.activeAnimation = { finish };
      timer = setTimeout(finish, milliseconds);
    }).finally(() => {
      this.activeAnimation = null;
    });
  }

  async preloadFollowingTransitionAssets(frame) {
    const names = [];
    for (let index = frame.ip; index < frame.scenario.operations.length; index += 1) {
      const operation = frame.scenario.operations[index];
      if (operation.opcode === 0x57
          && Number.parseInt(operation.dataHex.slice(0, 2), 16) === 0x13) break;
      if (operation.opcode === 0x56 && operation.text) names.push(`${operation.text}.GGD`);
      // Keep look-ahead local to the current visual handoff.
      if (index - frame.ip >= 128) break;
    }
    const unique = [...new Set(names)];
    if (!unique.length) return { assets: [], elapsed: 0, failed: [] };
    const started = performance.now();
    this.onTransition({ phase: 'preload-start', assets: unique });
    const results = await Promise.allSettled(unique.map(name => this.fetchImage(name)));
    const failed = results.flatMap((result, index) => result.status === 'rejected'
      ? [{ asset: unique[index], error: String(result.reason) }]
      : []);
    const detail = { assets: unique, elapsed: performance.now() - started, failed };
    this.onTransition({ phase: 'preload-end', ...detail });
    return detail;
  }

  async fadeDisplayToBlack(duration = 500) {
    const destination = this.surface(0);
    const original = this.canvasCopy(destination);
    const target = destination.getContext('2d');
    await this.animate(duration, progress => {
      target.clearRect(0, 0, destination.width, destination.height);
      target.drawImage(original, 0, 0);
      target.fillStyle = `rgba(0,0,0,${progress})`;
      target.fillRect(0, 0, destination.width, destination.height);
      this.present();
    });
    target.fillStyle = '#000';
    target.fillRect(0, 0, destination.width, destination.height);
    this.markSurfaceDirty(0);
    this.present();
  }

  async revealDisplayFromBlack(duration = 500) {
    const destination = this.surface(0);
    const finalFrame = this.canvasCopy(destination);
    const target = destination.getContext('2d');
    await this.animate(duration, progress => {
      target.clearRect(0, 0, destination.width, destination.height);
      target.fillStyle = '#000';
      target.fillRect(0, 0, destination.width, destination.height);
      target.globalAlpha = progress;
      target.drawImage(finalFrame, 0, 0);
      target.globalAlpha = 1;
      this.present();
    });
    target.clearRect(0, 0, destination.width, destination.height);
    target.drawImage(finalFrame, 0, 0);
    this.markSurfaceDirty(0);
    this.present();
  }

  async fadeOut(data, frame, operation) {
    const duration = this.value(data, 0);
    const red = data[4] ?? 0;
    const green = data[5] ?? 0;
    const blue = data[6] ?? 0;
    const destination = this.surface(0);
    const original = this.canvasCopy(destination);
    const target = destination.getContext('2d');
    if (this.skipNextFadeOut) {
      this.skipNextFadeOut = false;
      target.fillStyle = `rgb(${red},${green},${blue})`;
      target.fillRect(0, 0, destination.width, destination.height);
      this.markSurfaceDirty(0);
      const cleanView = this.surface(CLEAN_VIEW_SURFACE, destination.width, destination.height);
      cleanView.getContext('2d').drawImage(destination, 0, 0);
      this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
      this.present();
      this.onTransition({
        phase: 'skipped',
        kind: 'fade-out',
        scenario: frame.scenario.name,
        offset: operation.offset,
        duration,
        reason: 'browser handoff already faded to black',
      });
      return;
    }
    const preload = await this.preloadFollowingTransitionAssets(frame);
    const diagnostic = {
      phase: 'start',
      kind: 'fade-out',
      scenario: frame.scenario.name,
      offset: operation.offset,
      duration,
      preload,
    };
    this.onTransition(diagnostic);
    const timing = await this.animate(duration, progress => {
      target.clearRect(0, 0, destination.width, destination.height);
      target.drawImage(original, 0, 0);
      target.fillStyle = `rgba(${red},${green},${blue},${progress})`;
      target.fillRect(0, 0, destination.width, destination.height);
      this.present();
    });
    target.fillStyle = `rgb(${red},${green},${blue})`;
    target.fillRect(0, 0, destination.width, destination.height);
    this.markSurfaceDirty(0);
    const cleanView = this.surface(CLEAN_VIEW_SURFACE, destination.width, destination.height);
    cleanView.getContext('2d').drawImage(destination, 0, 0);
    this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
    this.present();
    this.onTransition({ ...diagnostic, phase: 'end', timing });
  }

  async transitionCopy(data, frame, operation) {
    const sourceIndex = this.value(data, 1);
    const sourceX = this.value(data, 5);
    const sourceY = this.value(data, 9);
    const width = this.value(data, 13);
    const height = this.value(data, 17);
    const duration = this.value(data, 21);
    const destinationX = this.value(data, 25);
    const destinationY = this.value(data, 29);
    if (width <= 0 || height <= 0) return;

    // Original assets were memory-local. In the browser, loading the next
    // image after fading to black creates a first-run pause/flash that then
    // disappears from cache. Fetch and decode the handoff assets first.
    const preload = await this.preloadFollowingTransitionAssets(frame);

    const destination = this.surface(0);
    const original = this.canvasCopy(destination);
    const finalFrame = this.canvasCopy(destination);
    finalFrame.getContext('2d').drawImage(
      this.surface(sourceIndex), sourceX, sourceY, width, height,
      destinationX, destinationY, width, height,
    );
    const target = destination.getContext('2d');

    // Ikura's mode 0x13 blends the currently displayed frame directly into
    // the supplied frame. Scene changes commonly invoke it twice: first
    // with a black target, then with the new background. Adding another
    // black midpoint here would therefore produce a duplicate fade-out.
    const diagnostic = {
      phase: 'start',
      scenario: frame.scenario.name,
      offset: operation.offset,
      sourceIndex,
      sourceVersion: this.surfaceVersions.get(sourceIndex) || 0,
      destinationVersion: this.surfaceVersions.get(0) || 0,
      duration,
      preload,
    };
    this.onTransition(diagnostic);
    const timing = await this.animate(duration, progress => {
      target.clearRect(0, 0, destination.width, destination.height);
      target.drawImage(original, 0, 0);
      target.globalAlpha = progress;
      target.drawImage(finalFrame, 0, 0);
      target.globalAlpha = 1;
      this.present();
      this.onTransitionFrame({ ...diagnostic, progress });
    });
    target.clearRect(0, 0, destination.width, destination.height);
    target.drawImage(finalFrame, 0, 0);
    this.markSurfaceDirty(0);
    // Surface 1 contains the complete presentation frame, including the
    // original toolbar and face portrait. Its background/character layers
    // have already been mirrored into CLEAN_VIEW_SURFACE by the individual
    // non-interface blits used to construct it. Do not replace that clean
    // composite with the interface-bearing transition target.
    this.present();
    this.onTransition({ ...diagnostic, phase: 'end', timing });
  }

  async run() {
    if (this.waiting || !this.running) return;
    let budget = 20000;
    while (!this.waiting && this.running && budget > 0) {
      budget -= 1;
      const frame = this.current();
      if (!frame) {
        this.running = false;
        this.onState('complete', 'Scenario stack completed');
        return;
      }
      if (frame.ip >= frame.scenario.operations.length) {
        this.frames.pop();
        continue;
      }
      const operation = frame.scenario.operations[frame.ip];
      frame.ip += 1;
      this.onTrace({
        scenario: frame.scenario.name,
        offset: operation.offset,
        opcode: operation.opcode,
        name: operation.name,
      });
      try {
        await this.execute(frame, operation, bytes(operation.dataHex));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${frame.scenario.name} @ 0x${operation.offset.toString(16)} ${operation.name}: ${detail}`,
          { cause: error },
        );
      }
    }
    if (budget === 0) throw new Error('VM instruction budget exhausted');
  }

  pauseForDialogue(offset = 0) {
    if (!this.pendingText.length && !this.pendingName) return false;
    this.clearAnimationSkip();
    this.waiting = true;
    this.refreshGhostAction();
    const text = this.pendingText.join('').replace(/^\n+/u, '');
    this.currentMessageId = `${this.current().scenario.name}:${offset.toString(16)}:${textHash(text)}`;
    this.currentMessageWasRead = this.isMessageRead(this.currentMessageId);
    this.markMessageRead(this.currentMessageId);
    const backlogEntry = {
      speaker: this.pendingName,
      text,
      portrait: this.pendingName ? this.activePortrait : null,
      voice: this.pendingVoice,
      checkpoint: null,
    };
    this.backlog.push(backlogEntry);
    if (this.backlog.length > 100) this.backlog.splice(0, this.backlog.length - 100);
    this.dialoguePages = this.paginateDialogue(this.pendingName, text);
    if (!this.dialoguePages.length) this.dialoguePages = [''];
    this.dialoguePage = 0;
    backlogEntry.checkpoint = this.exportState().catch(error => {
      backlogEntry.checkpointError = error instanceof Error ? error.message : String(error);
      return null;
    });
    this.onBacklogChange(this.backlog);
    this.onDialogue(this.pendingName, this.dialoguePages[0]);
    this.onState('dialogue', `${this.current().scenario.name} · click to continue`);
    this.onDialogueReady({ id: this.currentMessageId, wasRead: this.currentMessageWasRead });
    return true;
  }

  async advance() {
    if (!this.waiting || this.choice) return;
    if (!this.continueVoiceAfterAdvance()) this.stopVoice();
    this.waitForVoice = false;
    if (this.dialoguePage + 1 < this.dialoguePages.length) {
      this.dialoguePage += 1;
      this.onDialogue(this.pendingName, this.dialoguePages[this.dialoguePage]);
      this.onState('dialogue', `${this.current().scenario.name} · page ${this.dialoguePage + 1}/${this.dialoguePages.length}`);
      this.onDialogueReady({ id: this.currentMessageId, wasRead: this.currentMessageWasRead });
      return;
    }
    this.waiting = false;
    this.refreshGhostAction();
    this.pendingText = [];
    this.pendingName = '';
    this.pendingVoice = null;
    this.dialoguePages = [];
    this.dialoguePage = 0;
    this.currentMessageId = '';
    this.currentMessageWasRead = false;
    this.onDialogueClose();
    await this.run();
  }

  async exportState() {
    // Clone every canvas synchronously before awaiting PNG encoding. Otherwise
    // later script operations could mutate a surface while a checkpoint is
    // still being encoded in the background.
    const surfaceCaptures = [];
    for (const [index, canvas] of this.surfaces) {
      const version = this.surfaceVersions.get(index) || 0;
      let capture = this.surfaceSnapshots.get(index);
      if (!capture || capture.version !== version) {
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        const blob = canvasBlob(copy).catch(error => {
          if (this.surfaceSnapshots.get(index)?.blob === blob) this.surfaceSnapshots.delete(index);
          throw error;
        });
        capture = { version, blob };
        this.surfaceSnapshots.set(index, capture);
      }
      surfaceCaptures.push({ index, blob: capture.blob });
    }
    const snapshot = {
      version: 1,
      frames: this.frames.map(frame => ({
        scenario: frame.scenario.name,
        ip: frame.ip,
        calls: [...frame.calls],
      })),
      variables: this.variables.slice(),
      flags: this.flags.slice(),
      systemFlags: this.systemFlags.slice(),
      surfaces: [],
      pendingText: [...this.pendingText],
      pendingName: this.pendingName,
      pendingVoice: this.pendingVoice,
      dialoguePages: [...this.dialoguePages],
      dialoguePage: this.dialoguePage,
      currentMessageId: this.currentMessageId,
      currentMessageWasRead: this.currentMessageWasRead,
      backlog: this.backlog.map(({ checkpoint, checkpointError, ...entry }) => ({ ...entry })),
      inputHandlers: this.inputHandlers.map(handler => handler ? { ...handler } : null),
      choice: this.choice ? {
        ...this.choice,
        handlers: this.choice.handlers.map(handler => ({ ...handler })),
      } : null,
      commandOptions: [...this.commandOptions.values()].map(option => ({ ...option })),
      commandWindow: { ...this.commandWindow },
      activePortrait: this.activePortrait,
      waiting: this.waiting,
      running: this.running,
      delay: this.delay,
      unsupported: [...this.unsupported],
      effectName: this.effectName,
      specialActionMode: this.specialActionMode,
      ghostActionArmed: this.ghostActionArmed,
      possessionActive: this.possessionActive,
      nativeTitleInitialization: 1,
      externalState: { ...this.getExternalState() },
    };
    snapshot.surfaces = await Promise.all(surfaceCaptures.map(async capture => ({
      index: capture.index,
      blob: await capture.blob,
    })));
    return snapshot;
  }

  async importState(state) {
    if (!state || state.version !== 1) throw new Error('This save uses an unsupported format');
    // A restore replaces the current input context completely. Clear its DOM
    // and decision notifications before any asynchronous scenario/image work;
    // a choice contained in the restored state is rendered again below.
    this.onChoiceClose();
    this.emitDecision('dialogue', false);
    this.emitDecision('map', false);
    this.running = false;
    this.waiting = true;
    this.frames = [];
    this.migrations = [];
    const savedFrames = state.frames || [];
    const legacyOpening = savedFrames.length === 1
      && savedFrames[0].scenario.toUpperCase() === 'NT_OP01.ISF';
    if (legacyOpening) {
      const main = this.frameFor(await this.scenario('MAIN.isf'));
      const prologueCall = main.scenario.operations.findIndex(operation => (
        operation.opcode === 0x02 && operation.text?.toUpperCase() === 'NT_OP01'
      ));
      if (prologueCall < 0) throw new Error('Could not migrate legacy opening save: MAIN entry was not found');
      main.ip = prologueCall + 1;
      this.frames.push(main);
      this.migrations.push('legacy-NT_OP01-root');
    }
    for (const saved of savedFrames) {
      const frame = this.frameFor(await this.scenario(saved.scenario));
      frame.ip = saved.ip;
      frame.calls = [...(saved.calls || [])];
      this.frames.push(frame);
    }
    this.variables = new Int32Array(state.variables || 8192);
    // Saves from browser builds before 20261009-46 skipped TITLE.isf and
    // therefore stored an empty possession gauge. Migrate only those saves;
    // new saves retain a legitimately depleted zero value.
    if (!state.nativeTitleInitialization && this.variables[0x0A] === 0) {
      this.setVariable(0x0A, 100);
      this.migrations.push('native-title-possession-gauge');
    }
    // Saves made before scripted transition timing was restored contain zero
    // here because the browser-native title bypassed TITLE.isf initialization.
    if (this.variables[0x20] <= 0) this.variables[0x20] = 8;
    if (this.variables[0x21] <= 0) this.variables[0x21] = 8;
    this.flags = new Uint8Array(state.flags || 8192);
    await this.mergeGlobalFlags();
    this.systemFlags = new Uint8Array(8192);
    if (state.systemFlags) this.systemFlags.set(new Uint8Array(state.systemFlags).subarray(0, this.systemFlags.length));
    if (legacyOpening) {
      // Early runtime saves began directly in NT_OP01 and therefore missed
      // the original event lookup table and MAIN's fresh-game variables.
      const eventSetup = await this.scenario('EV_SET.isf');
      for (const operation of eventSetup.operations) {
        if (operation.opcode !== 0x41) continue;
        const data = bytes(operation.dataHex);
        this.setVariable(word(data), this.value(data, 2));
      }
      this.setVariable(0xC8, 0);
      this.setVariable(0xC9, 1);
      this.setVariable(0xCA, 0);
    }
    this.surfaces.clear();
    this.surfaceVersions.clear();
    this.surfaceSnapshots.clear();
    this.colorKeySurfaces.clear();
    const restoredSurfaces = await Promise.all((state.surfaces || []).map(async saved => {
      const canvas = document.createElement('canvas');
      await drawBlob(canvas, saved.blob);
      return { saved, canvas };
    }));
    for (const { saved, canvas } of restoredSurfaces) {
      this.surfaces.set(saved.index, canvas);
      this.surfaceVersions.set(saved.index, 0);
      this.surfaceSnapshots.set(saved.index, { version: 0, blob: Promise.resolve(saved.blob) });
    }
    if (!this.surfaces.has(CLEAN_VIEW_SURFACE)) {
      const fallback = this.surfaces.get(2) || this.surfaces.get(0);
      const cleanView = this.surface(CLEAN_VIEW_SURFACE, fallback?.width, fallback?.height);
      if (fallback) cleanView.getContext('2d').drawImage(fallback, 0, 0);
      this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
    }
    this.pendingText = [...(state.pendingText || [])];
    this.pendingName = state.pendingName || '';
    this.pendingVoice = state.pendingVoice
      || (state.waiting ? state.backlog?.[state.backlog.length - 1]?.voice : null)
      || null;
    this.dialoguePages = [...(state.dialoguePages || [])];
    this.dialoguePage = Math.min(state.dialoguePage || 0, Math.max(0, this.dialoguePages.length - 1));
    this.currentMessageId = state.currentMessageId || '';
    this.currentMessageWasRead = this.currentMessageId
      ? this.isMessageRead(this.currentMessageId)
      : Boolean(state.currentMessageWasRead);
    this.backlog = (state.backlog || []).map(entry => ({ ...entry })).slice(-100);
    this.inputHandlers = (state.inputHandlers || []).map(handler => handler ? { ...handler } : null);
    this.choice = state.choice ? {
      ...state.choice,
      kind: state.choice.kind || 'map',
      handlers: (state.choice.handlers || []).map(handler => ({ ...handler })),
    } : null;
    this.commandOptions = new Map((state.commandOptions || []).map(option => [option.id, { ...option }]));
    this.commandWindow = { x: 0, y: 0, width: 640, height: 480, ...(state.commandWindow || {}) };
    this.choiceCallback = null;
    this.choiceBusy = false;
    this.activePortrait = state.activePortrait || null;
    this.onBacklogChange(this.backlog);
    this.delay = state.delay || 0;
    this.unsupported = new Set(state.unsupported || []);
    this.effectName = state.effectName || 'YUS_01.wav';
    // Saves made before ghost-action support did not serialize this field;
    // MAIN mirrors the mode in flag 0x56, so use it as the migration source.
    this.specialActionMode = Boolean(state.specialActionMode ?? this.flags[0x56]);
    // Old saves did not persist this transient state. Leave those disarmed;
    // the next authored TUKI_ON call will open the correct action window.
    this.ghostActionArmed = Boolean(state.ghostActionArmed);
    this.possessionActive = Boolean(state.possessionActive);
    this.onPossessionChange(this.possessionActive);
    this.ghostActionBusy = false;
    this.running = Boolean(state.running);
    this.waiting = Boolean(state.waiting);
    this.present();
    if (this.current()) this.onScenario(this.current().scenario);
    if (this.waiting && this.choice) {
      this.onDialogueClose();
      this.refreshGhostAction();
      this.onChoice(this.choice.handlers);
      this.emitDecision(
        this.choice.kind === 'command' ? 'dialogue' : 'map',
        true,
        this.choice.handlers.map(handler => ({ ...handler })),
      );
      this.onState('choice', `${this.current()?.scenario.name || 'Saved game'} · choose a destination`);
    } else if (this.waiting && this.dialoguePages.length) {
      this.onDialogue(this.pendingName, this.dialoguePages[this.dialoguePage]);
      this.refreshGhostAction();
      if (this.pendingVoice) {
        this.voiceCompletion = Promise.resolve(this.playVoice(this.pendingVoice));
      }
      this.onState('dialogue', `${this.current()?.scenario.name || 'Saved game'} · restored`);
      this.onDialogueReady({ id: this.currentMessageId, wasRead: this.currentMessageWasRead });
    } else {
      this.onDialogueClose();
      this.refreshGhostAction();
      await this.run();
    }
  }

  appendMessage(message) {
    for (const token of message.tokens || []) {
      if (token.type === 'clear') {
        this.pendingText = [];
        this.pendingName = '';
        this.pendingVoice = null;
      } else if (token.type === 'text') {
        const match = token.text.match(/^【(.+)】$/u);
        if (match) this.pendingName = match[1];
        else this.pendingText.push(token.text);
      } else if (token.type === 'break') {
        // The original scripts place a line-break token directly after a
        // speaker tag. It separates the tag from the message internally; it
        // is not a visible blank dialogue line.
        if (this.pendingText.length) this.pendingText.push('\n');
      } else if (token.type === 'voice') {
        this.playVoice(token.name);
      }
    }
  }

  compare(left, operator, right) {
    return [left === right, left < right, left <= right, left > right, left >= right, left !== right][operator] ?? false;
  }

  pauseForChoice(data) {
    this.clearAnimationSkip();
    const enteringChoice = !this.choice;
    const hoverVariable = word(data);
    const actionVariable = word(data, 2);
    const count = word(data, 4);
    const handlers = this.inputHandlers.slice(0, count).filter(Boolean).map(handler => {
      const surface = this.surfaces.get(30 + handler.id);
      return { ...handler, enabled: Boolean(surface && surface.width > 1 && surface.height > 1) };
    });
    // SCREEN_MOUSE_INPUT is also reached by route scenarios immediately
    // before MAP2 has installed its handler table. Recover the one visible
    // character's original rectangle from the map availability variables.
    const active = MAP_DESTINATION_HITBOXES
      .map((bounds, id) => ({ bounds, id, value: this.variables[0xDD + id] }))
      .filter(item => item.value && item.bounds[2] > item.bounds[0]);
    const isSchoolMap = this.current()?.scenario.name.toUpperCase() === 'MAP2.ISF' && count === 11;
    if (isSchoolMap && active.length) {
      const activeIds = new Set(active.map(item => item.id));
      handlers.forEach(handler => { handler.enabled = activeIds.has(handler.id); });
    }
    const inheritedFullScreenHandler = handlers.length === 1
      && handlers[0].x1 === 0 && handlers[0].y1 === 0
      && handlers[0].x2 >= 640 && handlers[0].y2 >= 480;
    if (active.length && (!handlers.length || inheritedFullScreenHandler) && count > 0) {
      handlers.length = 0;
      for (const { bounds: [x1, y1, x2, y2], id } of active) {
        handlers.push({ id, x1, y1, x2, y2, enabled: true });
      }
    }
    if (!isSchoolMap && handlers.length && !handlers.some(handler => handler.enabled)) {
      handlers.forEach(handler => { handler.enabled = true; });
    }
    this.choice = { kind: 'map', hoverVariable, actionVariable, handlers };
    this.waiting = true;
    this.onDialogueClose();
    // Closing dialogue hides the browser toolbar. Refresh afterwards so a
    // TUKI_ON window attached to this input pause can restore it.
    this.refreshGhostAction('screen-input-pause');
    // Hover/clear paths loop back through SCREEN_MOUSE_INPUT. Keep the
    // existing DOM hit targets in place during that loop: rebuilding them
    // underneath a stationary pointer generates another pointerenter and can
    // retrigger the map script indefinitely.
    if (enteringChoice) this.onChoice(handlers);
    if (enteringChoice) this.emitDecision('map', true, handlers.map(handler => ({ ...handler })));
    this.onState('choice', `${this.current().scenario.name} · choose a destination`);
  }

  async hoverChoice(id) {
    if (!this.choice || !this.waiting || this.choiceBusy) return;
    const handler = this.choice.handlers.find(item => item.id === id && item.enabled);
    if (!handler) return;
    if (this.choice.kind === 'command') return;
    this.setVariable(this.choice.hoverVariable, id);
    this.setVariable(this.choice.actionVariable, 0);
    this.choiceBusy = true;
    this.waiting = false;
    this.refreshGhostAction();
    try {
      // SCREEN_MOUSE_INPUT returns the hovered handler id to the scenario.
      // The following script selects the matching destination plate and then
      // loops back to the input opcode. Jumping to handler.target here would
      // execute click/route logic merely by hovering.
      await this.run();
    } finally {
      this.choiceBusy = false;
    }
  }

  async selectChoice(id) {
    if (!this.choice || !this.waiting || this.choiceBusy) return;
    const handler = this.choice.handlers.find(item => item.id === id && item.enabled);
    if (!handler) return;
    if (this.choice.kind === 'command') {
      this.setVariable(this.choice.variable, id);
      this.choice = null;
      this.waiting = false;
      this.refreshGhostAction();
      this.onChoiceClose();
      this.emitDecision('dialogue', false);
      await this.run();
      return;
    }
    this.variables[this.choice.hoverVariable] = id;
    this.variables[this.choice.actionVariable] = 1;
    this.choice = null;
    this.waiting = false;
    this.refreshGhostAction();
    this.onChoiceClose();
    this.emitDecision('map', false);
    await this.run();
  }

  async clearChoiceHover() {
    if (!this.choice || !this.waiting || this.choiceBusy) return;
    if (this.choice.kind === 'command') return;
    this.setVariable(this.choice.hoverVariable, -1);
    this.setVariable(this.choice.actionVariable, 0);
    this.choiceBusy = true;
    this.waiting = false;
    this.refreshGhostAction();
    try {
      // The MAP script handles a negative hover index by restoring the blank
      // destination plate, then loops back to SCREEN_MOUSE_INPUT.
      await this.run();
    } finally {
      this.choiceBusy = false;
    }
  }

  async execute(frame, operation, data) {
    switch (operation.opcode) {
      case 0x00: // END
        this.frames.pop();
        break;
      case 0x01: { // LOAD_SCENARIO
        const next = this.frameFor(await this.scenario(cstring(data)));
        this.frames[this.frames.length - 1] = next;
        this.onScenario(next.scenario);
        break;
      }
      case 0x02: { // LOAD_SUBSCENARIO
        const target = cstring(data);
        if (/^TUKI_(?:ON|OFF|NOW|TBL)$/i.test(target) || /^TORITUKI$/i.test(target)) {
          this.ghostDebug('script-load', { target, offset: operation.offset });
        }
        if (/^TUKI_NOW$/i.test(target)) this.setPossessionActive(true);
        else if (/^TUKI_OFF$/i.test(target)) this.setPossessionActive(false);
        const next = this.frameFor(await this.scenario(target));
        this.frames.push(next);
        this.onScenario(next.scenario);
        break;
      }
      case 0x03:
        if (frame.scenario.operations.some(item => (
          item.opcode === 0x02 && String(item.text || '').toUpperCase() === 'TUKI_ON'
        ))) {
          this.ghostDebug('ghost-capable-scenario-return', {
            offset: operation.offset,
            remainingInstructionIndex: frame.ip,
          });
        }
        if (frame.scenario.name.toUpperCase() === 'TORITUKI.ISF') this.setPossessionActive(false);
        this.frames.pop();
        if (this.current()) this.onScenario(this.current().scenario);
        break;
      case 0x04:
        this.jump(frame, word(data));
        break;
      case 0x05: { // CALL
        const target = word(data);
        // Scenario files use local display-wrapper subroutines at many jump
        // indices, not only index 0. If text is buffered, the CALL is the
        // script's flush point; the browser dialogue UI replaces that legacy
        // wrapper and resumes immediately after this instruction.
        if (this.pauseForDialogue(operation.offset)) break;
        frame.calls.push(frame.ip);
        this.jump(frame, target);
        break;
      }
      case 0x06:
        if (this.choiceCallback
            && this.choiceCallback.frame === frame
            && frame.calls.length === this.choiceCallback.callDepth) {
          frame.ip = this.choiceCallback.returnIp;
          this.choiceCallback = null;
          this.waiting = true;
        } else {
          frame.ip = frame.calls.pop() ?? frame.scenario.operations.length;
        }
        break;
      case 0x07: { // JUMP_CONDITIONAL
        const selected = this.value(data, 0);
        const count = data[4];
        if (selected >= 0 && selected < count) this.jump(frame, word(data, 5 + selected * 2));
        break;
      }
      case 0x08: { // CALL_CONDITIONAL
        const selected = this.value(data, 0);
        const count = data[4];
        if (selected >= 0 && selected < count) {
          frame.calls.push(frame.ip);
          this.jump(frame, word(data, 5 + selected * 2));
        }
        break;
      }
      case 0x10: // COMMAND_WINDOW_POSITION
        if (data.length >= 16) {
          this.commandWindow = {
            x: this.value(data, 0),
            y: this.value(data, 4),
            width: this.value(data, 8),
            height: this.value(data, 12),
          };
        }
        break;
      case 0x11: // COMMAND_FRAME
        this.commandOptions.clear();
        break;
      case 0x15: { // COMMAND_SET
        if (data.length < 17) break;
        const id = data[0];
        let end = 17;
        while (end < data.length && data[end]) end += 1;
        const text = new TextDecoder('shift_jis').decode(data.subarray(17, end));
        this.commandOptions.set(id, {
          id,
          x1: this.commandWindow.x + this.value(data, 1),
          y1: this.commandWindow.y + this.value(data, 5),
          x2: this.commandWindow.x + this.value(data, 1) + this.value(data, 9),
          y2: this.commandWindow.y + this.value(data, 5) + this.value(data, 13),
          text,
          enabled: true,
        });
        break;
      }
      case 0x17: // COMMAND_WINDOW_CLOSE
        break;
      case 0x18: { // COMMAND_SELECT
        const windowId = data[0];
        const variable = word(data, 1);
        if (windowId !== 0 || !this.commandOptions.size) break;
        const handlers = [...this.commandOptions.values()]
          .sort((left, right) => left.id - right.id)
          .map(option => ({ ...option }));
        this.choice = { kind: 'command', variable, handlers };
        this.clearAnimationSkip();
        this.waiting = true;
        this.refreshGhostAction();
        this.onChoice(handlers);
        this.emitDecision('dialogue', true, handlers.map(handler => ({ ...handler })));
        this.onState('choice', `${frame.scenario.name} · choose a response`);
        break;
      }
      case 0x2B:
      case 0x2C:
        this.appendMessage(operation.message || { tokens: [] });
        break;
      case 0x31: { // FLAG_SET
        const index = word(data);
        if (data[2] === 2) this.flags[index] ^= 1;
        else this.flags[index] = data[2] ? 1 : 0;
        if (index === 0x50) {
          // TUKI_ON clears this flag; TUKI_OFF and TORITUKI set it. This is
          // the original action-window protocol and is independent of F5.
          this.ghostActionArmed = this.flags[index] === 0;
          this.refreshGhostAction('flag-0x50');
        }
        break;
      }
      case 0x32: { // FLAGS_SET
        const start = word(data);
        const end = word(data, 2);
        for (let index = start; index < end; index += 1) {
          if (data[4] === 2) this.flags[index] ^= 1;
          else this.flags[index] = data[4] ? 1 : 0;
        }
        if (start <= 0x50 && end > 0x50) {
          this.ghostActionArmed = this.flags[0x50] === 0;
          this.refreshGhostAction();
        }
        break;
      }
      case 0x33:
        if (this.flags[word(data)]) this.jump(frame, word(data, 2));
        break;
      case 0x38: { // FLAGS_SAVE
        const start = word(data);
        const end = word(data, 2);
        await this.saveGlobalFlags(start, end, this.flags.slice(start, end));
        break;
      }
      case 0x39: // FLAGS_LOAD
        // GAME.SAV's route/completion bank is represented by browser-global
        // data, independently of manual save slots.
        this.flags.fill(0);
        await this.mergeGlobalFlags();
        break;
      case 0x37:
        this.systemFlags[data[0]] = data[1] ? 1 : 0;
        break;
      case 0x3A:
        if (this.systemFlags[word(data)]) this.jump(frame, word(data, 2));
        break;
      case 0x3B:
        if (!this.flags[word(data)]) this.jump(frame, word(data, 2));
        break;
      case 0x41:
        this.setVariable(word(data), this.value(data, 2));
        break;
      case 0x42:
        this.setVariable(word(data), this.variables[word(data)] + 1);
        break;
      case 0x43:
        this.setVariable(word(data), this.variables[word(data)] - 1);
        break;
      case 0x44: { // CALCULATE
        // Ikura expressions store a three-byte destination followed by a
        // value and optional (operator, value) pairs, terminated by 0x05.
        if (data.length < 8) break;
        let result = this.value(data, 3);
        let offset = 7;
        while (offset < data.length && data[offset] !== 0x05) {
          const operator = data[offset];
          if (offset + 5 > data.length) break;
          const operand = this.value(data, offset + 1);
          if (operator === 0x00) result += operand;
          else if (operator === 0x01) result -= operand;
          else if (operator === 0x02) result *= operand;
          else if (operator === 0x03 && operand) result = Math.trunc(result / operand);
          else if (operator === 0x04 && operand) result %= operand;
          offset += 5;
        }
        this.setVariable(word(data), result);
        break;
      }
      case 0x45: {
        const start = word(data);
        const end = word(data, 2);
        const value = this.value(data, 4);
        for (let index = start; index < end; index += 1) this.setVariable(index, value);
        break;
      }
      case 0x46: {
        const source = word(data);
        const destination = word(data, 2);
        const count = word(data, 4);
        for (let index = 0; index < count; index += 1) this.variables[destination + index] = this.variables[source + index];
        break;
      }
      case 0x47: { // IF
        for (let offset = 0; offset + 9 < data.length; offset += 10) {
          const left = this.value(data, offset);
          const operator = data[offset + 4];
          const right = this.value(data, offset + 5);
          const passed = this.compare(left, operator, right);
          const action = data[offset + 9];
          const jumpIndex = action === 0 && offset + 11 < data.length ? word(data, offset + 10) : null;
          if (jumpIndex === 1 && frame.scenario.operations.some(item => (
            item.opcode === 0x02 && String(item.text || '').toUpperCase() === 'TUKI_ON'
          ))) {
            this.ghostDebug('possession-gate', {
              offset: operation.offset,
              leftVariable: dword(data, offset) & 0x7fffffff,
              left,
              operator,
              rightVariable: dword(data, offset + 5) & 0x7fffffff,
              right,
              passed,
              jumpIndex,
            });
          }
          if (!passed) break;
          if (action === 0 && offset + 11 < data.length) this.jump(frame, jumpIndex);
          else if (action === 1 && offset + 15 < data.length) this.setVariable(word(data, offset + 10), this.value(data, offset + 12));
          if (action !== 2) break;
        }
        break;
      }
      case 0x50: { // VRAM_SET
        const index = this.value(data);
        const width = this.value(data, 4);
        const height = this.value(data, 8);
        const canvas = this.surface(index);
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        this.markSurfaceDirty(index);
        break;
      }
      case 0x53: { // GRAPHICS_CLEAR
        const canvas = this.surface(data[0]);
        const target = canvas.getContext('2d');
        const color = `rgb(${data[4]},${data[5]},${data[6]})`;
        target.fillStyle = color;
        target.fillRect(0, 0, canvas.width, canvas.height);
        this.markSurfaceDirty(data[0]);
        if (data[0] === 0 || data[0] === 1 || data[0] === 2) {
          const cleanView = this.surface(CLEAN_VIEW_SURFACE);
          const cleanTarget = cleanView.getContext('2d');
          cleanTarget.fillStyle = color;
          cleanTarget.fillRect(0, 0, cleanView.width, cleanView.height);
          this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
        }
        if (data[0] === 0) this.present();
        break;
      }
      case 0x55: // GRAPHICS_FADE_OUT
        await this.fadeOut(data, frame, operation);
        break;
      case 0x56: { // GRAPHICS_LOAD
        const index = this.value(data);
        const imageName = cstring(data, 4);
        const image = await this.fetchImage(`${imageName}.GGD`);
        if (/^FA/i.test(imageName)) {
          this.activePortrait = /^FANOML$/i.test(imageName) ? null : imageName;
        }
        const canvas = this.surface(index, image.width, image.height);
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        this.markSurfaceDirty(index);
        if (index === 0 && !INTERFACE_SURFACES.has(index)) {
          const cleanView = this.surface(CLEAN_VIEW_SURFACE, image.width, image.height);
          cleanView.width = image.width;
          cleanView.height = image.height;
          cleanView.getContext('2d').drawImage(image, 0, 0);
          this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
        }
        if (index === 0) this.present();
        break;
      }
      case 0x57:
        if (data[0] === 0x13) await this.transitionCopy(data, frame, operation);
        else this.blit(data);
        break;
      case 0x70:
        // HTMLMediaElement.play() can remain pending while a large WAV is
        // buffered (notably in Firefox). BGM startup must never stall script
        // execution or leave the game on its transition frame.
        void Promise.resolve(this.playMusic(cstring(data))).catch(() => {});
        break;
      case 0x73:
        this.stopMusic();
        break;
      case 0x74:
        this.effectName = cstring(data);
        if (!this.effectName.toLowerCase().endsWith('.wav')) this.effectName += '.wav';
        break;
      case 0x75:
        this.playEffect(this.effectName);
        break;
      case 0x76:
      case 0x7B:
        this.stopEffects();
        break;
      case 0x77:
        this.pendingVoice = cstring(data);
        this.voiceCompletion = Promise.resolve(this.playVoice(this.pendingVoice));
        break;
      case 0x79:
        this.stopVoice();
        this.waitForVoice = false;
        break;
      case 0x7A:
        // The following click wait may display immediately, but it must not
        // advance until the current voiced line has finished.
        this.waitForVoice = true;
        break;
      case 0x84: { // INPUT_HANDLER
        const id = data[0];
        this.inputHandlers[id] = {
          id,
          x1: this.value(data, 1),
          y1: this.value(data, 5),
          x2: this.value(data, 9),
          y2: this.value(data, 13),
          target: word(data, 18),
        };
        break;
      }
      case 0x85: // SCREEN_MOUSE_INPUT
        // The opcode is used for both map destinations and smaller
        // route-specific click targets.  Treat every occurrence as an input
        // pause; MAP2 gets its normal hitboxes while other scenes use the
        // handlers/fallback prepared by the surrounding script.
        this.pauseForChoice(data);
        break;
      case 0x86: // MOUSE_INPUT_INIT
      case 0x87: // MOUSE_INPUT_RELEASE
        this.inputHandlers = [];
        this.choice = null;
        this.onChoiceClose();
        this.emitDecision('map', false);
        break;
      case 0x8D:
        this.pauseForDialogue(operation.offset);
        break;
      case 0xF1:
        this.delay = this.value(data);
        break;
      case 0xF2:
        if (this.delay > 0) {
          // The CARD.GGD map wipe was authored around the original renderer's
          // per-tile drawing overhead. Browser canvas completes those steps
          // much faster, so restore its observed pacing without slowing any
          // other scripted wait or transition.
          const tileWipeScale = /^UZU[23]\.isf$/i.test(frame.scenario.name) ? 2 : 1;
          await this.waitAnimationDelay(Math.min(this.delay * tileWipeScale, 2000));
        }
        break;
      case 0xF5: // SAVE_DISABLE
        this.specialActionMode = Boolean(data[0]);
        break;
      default:
        this.unsupported.add(operation.name);
        break;
    }
  }

  blit(data) {
    if (data.length < 33) return;
    const command = data[0];
    const sourceIndex = this.value(data, 1);
    const sourceX = this.value(data, 5);
    const sourceY = this.value(data, 9);
    const width = this.value(data, 13);
    const height = this.value(data, 17);
    let destinationIndex = this.value(data, 21);
    const destinationX = this.value(data, 25);
    const destinationY = this.value(data, 29);
    if ([7, 15, 16, 17, 19].includes(command)) destinationIndex = 0;
    if (width <= 0 || height <= 0) return;
    const source = this.surface(sourceIndex);
    const destination = this.surface(destinationIndex);
    const renderedSource = command === 1 ? this.colorKeySurface(sourceIndex, source) : source;
    destination.getContext('2d').drawImage(
      renderedSource,
      sourceX, sourceY, width, height,
      destinationX, destinationY, width, height,
    );
    this.markSurfaceDirty(destinationIndex);
    if ((destinationIndex === 0 || destinationIndex === 1)
        && sourceIndex !== 1
        && !INTERFACE_SURFACES.has(sourceIndex)) {
      const cleanView = this.surface(CLEAN_VIEW_SURFACE);
      cleanView.getContext('2d').drawImage(
        renderedSource,
        sourceX, sourceY, width, height,
        destinationX, destinationY, width, height,
      );
      this.markSurfaceDirty(CLEAN_VIEW_SURFACE);
    }
    if (destinationIndex === 0) this.present();
  }
}
