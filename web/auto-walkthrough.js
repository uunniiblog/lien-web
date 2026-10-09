// Route policies are kept separate from presentation so later routes can be
// added without teaching the runtime about their individual flags or scenes.
// Destination ids are MAP2's original handler ids. MAP2 maps those handlers
// to the corresponding label rows in PLACE.GGD when a character is hovered.
export const MAP_DESTINATIONS = Object.freeze({
  '中庭': 6,
  '教室（２年）': 0,
  '教室（３年）': 1,
  '剣道場': 4,
  '屋上': 7,
  '廊下': 5,
  '桜の木': 8,
  '職員室': 2,
  '図書室': 3,
  '教室（１年）': 10,
});
const MAP_DESTINATION_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(MAP_DESTINATIONS).map(([name, id]) => [id, name]),
));
const MAP_PHASES = Object.freeze({ 2: '午前', 3: '午後', 4: '放課後' });

const map = (day, time, destination, ghost = false) => ({
  day, time, destination, id: MAP_DESTINATIONS[destination], ghost,
});
const choice = (scenario, text) => ({ scenario, text });

export const AUTO_ROUTES = Object.freeze({
  minamo: Object.freeze({
    id: 'minamo',
    name: '笹木 みなも',
    ending: '笹木みなも GOOD END',
    // Transcribed from Ｌｉｅｎ攻略.html. Day/time metadata makes
    // route divergences useful in diagnostics and future route maintenance.
    maps: Object.freeze([
      map(0, '午前', '教室（２年）'), map(0, '午後', '教室（２年）'), map(0, '放課後', '教室（２年）'),
      map(1, '午後', '教室（２年）'),
      map(2, '午前', '教室（２年）'), map(2, '午後', '図書室'),
      map(3, '午前', '桜の木'),
      map(4, '午前', '職員室', true),
      map(5, '午前', '教室（２年）'), map(5, '午後', '教室（２年）'), map(5, '放課後', '教室（２年）'),
      map(6, '午前', '廊下'), map(6, '放課後', '中庭'),
      map(8, '午前', '廊下'), map(8, '午後', '中庭'), map(8, '放課後', '剣道場'),
      map(9, '午前', '桜の木'), map(9, '午後', '教室（２年）'),
      map(10, '午前', '廊下'), map(10, '午後', '桜の木'), map(10, '放課後', '剣道場'),
      map(11, '午前', '中庭'), map(11, '午後', '廊下'), map(11, '放課後', '中庭'),
      map(12, '午前', '桜の木'), map(12, '午後', '桜の木'), map(12, '放課後', '廊下'),
      map(13, '午前', '桜の木'), map(13, '放課後', '廊下'),
      map(15, '午前', '教室（２年）'), map(15, '放課後', '中庭'),
      map(16, '午前', '中庭'), map(16, '放課後', '教室（２年）'),
      map(17, '午後', '教室（２年）'), map(17, '放課後', '教室（２年）'),
      map(18, '午後', '桜の木'), map(18, '放課後', '教室（２年）'),
      map(19, '午前', '中庭'), map(19, '放課後', '教室（１年）'),
      map(20, '放課後', '教室（１年）'),
      map(22, '午前', '教室（１年）'), map(22, '午後', '中庭'), map(22, '放課後', '教室（１年）'),
      map(23, '午後', '教室（１年）', true), map(23, '放課後', '廊下', true),
      map(24, '午後', '教室（１年）'), map(24, '放課後', '桜の木'),
      map(25, '午前', '教室（３年）'), map(25, '午後', '教室（１年）'), map(25, '放課後', '中庭', true),
      map(29, '放課後', '教室（２年）'),
      map(30, '放課後', '教室（２年）'),
      map(31, '午後', '教室（２年）'), map(31, '放課後', '中庭'),
      map(32, '放課後', '教室（２年）'),
      map(33, '放課後', '教室（１年）'),
    ]),
    choices: Object.freeze([
      choice('MO_AK01.isf', '「晶、俺が嬉しいと思うか？」'),
      choice('MO_AK01.isf', '「そうかな？」'),
      choice('ASA01.isf', '「は～い、起きま～す……」'),
      choice('MO_AK03.isf', '眠い……もう少し'),
      choice('AF_AK02.isf', '「大丈夫、大丈夫。晶に頼むから」'),
      choice('AF_AK03.isf', '「あの、とりあえず晶に頼んどくから」'),
      choice('ASA02.isf', '幽霊の生理について説明する'),
      choice('ASA03.isf', '「居間に降りるか…」'),
      choice('AF_AK08.isf', '「好みと言うよりは…」'),
      choice('PM_AK03.isf', '「ム！？」'),
      choice('PM_AK03.isf', '「これは…ッ！？」'),
      choice('PM_AK03.isf', '「これは───ッ！？」'),
      choice('ASA04.isf', '粘ってみる'),
      choice('AF_AK06.isf', '「…ああ、覚えてる覚えてる」'),
      choice('AM_MI03.isf', 'この件は無かったことに'),
      choice('AM_MI03.isf', 'ワケを聞いてみる'),
      choice('AF_MI01.isf', 'みなもちゃんを探す'),
      choice('AF_MI02.isf', '今はまだ様子を探る'),
      choice('AF_MI02.isf', '掴まえる'),
      choice('AF_MI13.isf', '横になってもらう'),
    ]),
  }),
});

export function normalizeRouteText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[「」『』\s]/gu, '')
    .replace(/(?:\.{2,}|[…⋯・‥]+)/gu, '…')
    .replace(/[─—―ー]+/gu, '—')
    .replace(/[~〜～]/gu, '~');
}

export function createAutoWalkthrough(routeId, saved = {}) {
  const route = AUTO_ROUTES[routeId];
  if (!route) return null;
  return {
    routeId,
    mapIndex: Math.max(0, Math.min(route.maps.length, Number(saved.mapIndex) || 0)),
    choiceIndex: Math.max(0, Math.min(route.choices.length, Number(saved.choiceIndex) || 0)),
    ghostPending: Boolean(saved.ghostPending),
    standaloneGhostDone: Boolean(saved.standaloneGhostDone),
    history: Array.isArray(saved.history) ? saved.history.slice(-256).map(entry => ({ ...entry })) : [],
  };
}

export function autoWalkthroughState(walkthrough) {
  if (!walkthrough) return null;
  return {
    routeId: walkthrough.routeId,
    mapIndex: walkthrough.mapIndex,
    choiceIndex: walkthrough.choiceIndex,
    ghostPending: Boolean(walkthrough.ghostPending),
    standaloneGhostDone: Boolean(walkthrough.standaloneGhostDone),
    history: walkthrough.history.slice(-256).map(entry => ({ ...entry })),
  };
}

export function resolveAutoDecision(walkthrough, decision, scenarioName = '', context = {}) {
  const route = walkthrough && AUTO_ROUTES[walkthrough.routeId];
  if (!route || !decision?.available) return { status: 'inactive' };
  if (decision.kind === 'ghost') {
    if (walkthrough.ghostPending) {
      return { status: 'select', id: 0, label: 'とりつく', consumeGhost: true };
    }
    // Minamo's Day 28 action occurs in a story-only block, with no map entry
    // of its own in the walkthrough. Use MAIN's original calendar variable,
    // not route progress: forced maps omitted by the guide make counters an
    // unreliable proxy, particularly in saves created by older builds.
    if (!walkthrough.standaloneGhostDone && context.day === 28) {
      return {
        status: 'select', id: 0, label: 'Day 28 とりつく', consumeStandaloneGhost: true,
      };
    }
    return { status: 'ignore' };
  }
  if (decision.kind === 'map') {
    // SCREEN_MOUSE_INPUT also implements the original message-window input
    // loop in nearly every event scenario. Those one-target gates are not a
    // destination choice and must not consume an entry from the walkthrough.
    // Actual school-map selection is owned by MAP2.
    if (String(scenarioName || '').toUpperCase() !== 'MAP2.ISF') {
      // Some authored ghost windows exist only inside this post-scene input
      // loop. Let the ghost decision win instead of immediately activating
      // the full-screen ordinary-continue target.
      if (walkthrough.ghostPending
          || (!walkthrough.standaloneGhostDone && context.day === 28)) {
        return { status: 'ignore' };
      }
      const option = decision.options.find(item => item.enabled !== false);
      if (!option) return { status: 'error', message: `No input target is available in ${scenarioName || 'this scene'}.` };
      return { status: 'select', id: option.id, label: `continue ${scenarioName || 'scene'}` };
    }
    const enabledOptions = decision.options.filter(item => item.enabled !== false);
    const currentTime = MAP_PHASES[context.phase];
    const calendarIndex = Number.isInteger(context.day) && currentTime
      ? route.maps.findIndex(item => item.day === context.day && item.time === currentTime)
      : -1;
    const hasCalendarContext = Number.isInteger(context.day) && Boolean(currentTime);
    const expected = calendarIndex >= 0 ? route.maps[calendarIndex] : route.maps[walkthrough.mapIndex];

    // No walkthrough row at this exact day/phase means this is one of the
    // original forced visits omitted by the guide. It is safe only when the
    // game exposes a single destination.
    if (hasCalendarContext && calendarIndex < 0) {
      if (enabledOptions.length !== 1) {
        const enabledIds = enabledOptions.map(item => item.id).join(', ') || 'none';
        return {
          status: 'error',
          message: `Day ${context.day} ${currentTime}: an unlisted map has multiple targets (${enabledIds}).`,
        };
      }
      const option = enabledOptions[0];
      return {
        status: 'select',
        id: option.id,
        label: MAP_DESTINATION_NAMES[option.id] || `forced destination ${option.id}`,
        forced: true,
      };
    }
    if (!expected) return { status: 'error', message: 'The route has no remaining map destination.' };
    // The original scenario contains forced one-character map visits which
    // are omitted from the walkthrough table. Select them, but do not consume
    // the next authored route entry; doing so shifts every later destination.
    if (!hasCalendarContext && enabledOptions.length === 1 && enabledOptions[0].id !== expected.id) {
      const option = enabledOptions[0];
      return {
        status: 'select',
        id: option.id,
        label: MAP_DESTINATION_NAMES[option.id] || `forced destination ${option.id}`,
        forced: true,
      };
    }
    const option = decision.options.find(item => item.id === expected.id && item.enabled !== false);
    if (!option) {
      const enabledIds = enabledOptions.map(item => item.id).join(', ') || 'none';
      return {
        status: 'error',
        message: `Day ${expected.day} ${expected.time}: ${expected.destination} is not available (enabled targets: ${enabledIds}).`,
      };
    }
    return {
      status: 'select',
      id: option.id,
      counter: calendarIndex < 0 ? 'mapIndex' : null,
      mapIndexValue: calendarIndex < 0 ? null : Math.max(walkthrough.mapIndex, calendarIndex + 1),
      expected,
      label: expected.destination,
    };
  }
  if (decision.kind === 'dialogue') {
    const expected = route.choices[walkthrough.choiceIndex];
    if (!expected) return { status: 'error', message: 'The route has no remaining dialogue answer.' };
    const actualScenario = String(scenarioName || '').toUpperCase();
    if (actualScenario && actualScenario !== expected.scenario.toUpperCase()) {
      return { status: 'error', message: `Expected ${expected.scenario}, but the choice appeared in ${scenarioName}.` };
    }
    const wanted = normalizeRouteText(expected.text);
    const option = decision.options.find(item => normalizeRouteText(item.text) === wanted && item.enabled !== false);
    if (!option) return { status: 'error', message: `The planned answer is unavailable: ${expected.text}` };
    return { status: 'select', id: option.id, counter: 'choiceIndex', expected, label: expected.text };
  }
  return { status: 'inactive' };
}
