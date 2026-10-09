# Lien browser preservation runtime

This is a private, clean browser runtime for **Lien ～終わらない君の唄～**.
It reads the original installed archives and raw game CD image without changing
or copying them.

## Make it portable

Run the one-time extractor before moving or archiving this folder:

```bash
python3 extract_assets.py
```

This creates `assets/` containing every individual image, scenario, cursor,
effect, music track, and voice file (about 0.8–0.9 GB). Once the command reports
completion, the entire `lien-web` folder can be moved by itself; `server.py`
automatically prefers the portable assets. The `.complete.json` marker is only
written after every file has been exported, so an interrupted extraction safely
falls back to the original game data and can be resumed by rerunning the command.

## Improvements
- Implemented backlog with portrait icon, voice repeat and jump back mechanic.
- Sound configuration, included cut voice on line advancing.
- Save anywhere. (In the original its only possible to save in map choices). Added more save slots
- Skip button with option to only skip already read text.
- Better shortcuts (original only has left click to advance text).
- Text speed slider, textbox transparency slider. TODO: color
- The ghost-action icon glows during the original scripted `TUKI_ON` windows.
- Auto Walkthrough route selection is available from the title screen. The
  Minamo good-ending policy automatically resolves dialogue choices, map
  destinations, and timed ghost actions; the other three route slots are
  present for future policies.
- Added a complete walkthrough of the game, original base taken from: https://web.archive.org/web/20021212073805/http://www5.ocn.ne.jp:80/~misaki-b/kouryaku/lien.htm

## TODO:
Launch without python (For Windows)


## Run

From this directory:

```bash
python3 server.py --open
```

Then open <http://127.0.0.1:8787/> if the browser does not open automatically.
The server binds only to the local computer.

## Test

```bash
python3 -m unittest discover -s tests -v
```

## Current milestone

- Parses Ikura GDL format-1 archives.
- Reads the `VOICE` archive directly from the MODE1/2352 game CD image.
- Decodes every Lien GGD image into browser-native PNG on demand.
- Decrypts all 321 ISF scenarios into their real jump tables and opcodes.
- Serves original PCM music, effects, and voice without conversion.
- Runs the original title screen, music, hover states, and hit regions.
- Runs the original fresh-game chain (`LOAD` → `MAIN` → `NT_OP01` →
  `MO_OP01`) with scenario/subscenario stacks,
  indexed jumps and calls, variables, flags, VRAM surfaces, graphics loads and
  copies, music selection, timers, and click waits.
- Decodes Lien's compact Japanese message alphabet and presents playable
  opening dialogue with speaker names and keyboard/pointer advancement.
- Uses the original 483×111 message frame and 483×29 system bar at their
  original 640×480 coordinates, with fixed-size automatic text pagination.
- Provides 20 browser-native save slots with screenshots and complete VM,
  graphics, flag, variable, call-stack, dialogue, and music-position state.
- Provides a translucent dialogue backlog retaining the latest 100 entries and
  preservation-runtime settings independent of the original executable. The
  backlog window is draggable, opens with an upward wheel gesture, and remembers
  its position and user-resized dimensions relative to the game screen. Its
  header remains visible while scrolling; Escape or right-click closes it.
- Adds per-line in-session Backlog checkpoints. Jump Back restores the script,
  graphics, variables, flags, dialogue, music, and truncated backlog to the
  selected line. Checkpoints deliberately remain session-local rather than
  recursively inflating normal save-slot data.
- Tracks read dialogue globally across routes and save slots. Skip mode can be
  configured to stop automatically when it reaches unread text.
- Provides persistent independent volume controls for BGM, voices, and sound
  effects, including the original effect and PCM playback instructions. A
  voice-only preamp and limiter compensate for the unusually quiet source
  recordings without changing BGM or effect levels.
- Organizes the resizable Settings popup into graphics, sound, and text
  sections with a fixed header. Text speed and textbox transparency are
  persistent, resettable, and keep dialogue glyphs fully opaque and crisp.
- Records voice IDs with backlog entries and provides a replay control beside
  the speaker name for voiced lines.
- Restarts a voiced line when its save is loaded. A persistent setting controls
  whether voice continues after advancing (the default) or stops immediately.
- Supports a persistent 1×–4× presentation resolution from 640×480 to
  2560×1920. The game area grows with the setting and the workspace scrolls
  when it exceeds the browser window. Game logic remains at 640×480 and DOM
  dialogue text stays crisp and independent of the raster scaling path.
- Makes the original Skip, Load, Title, and Close toolbar regions hoverable and
  interactive while retaining the original disabled Save artwork.
- Implements the original map-selection handlers: available character chips,
  resolution-independent hit regions, destination-plate hover callbacks, and
  click routing all come from the original scenario instructions.
- Restores the original timed scene fades and the `CARD.GGD` tiled map
  transition (`UZU3` cover followed by the `UZU2` reveal) instead of collapsing
  their scripted frames into an immediate background swap.
- Implements the original browser-global route/completion flag bank. These
  monotonic unlocks are merged across manual slots, new games, backlog jumps,
  and portable save-data transfers so an older save cannot relock progress.
- Implements timed ghost actions from `TUKI_ON`/`TORITUKI`, including the
  original alternate B-event dispatch and an animated glow while the action is
  available. Dialogue, map, and ghost decisions share a programmatic decision
  interface intended for a future route-aware automatic-playthrough mode.
- Keeps the original archives and `GAME.SAV` read-only.
- Supports a self-contained, lossless portable asset export.
- Includes a deterministic headless scenario audit which verifies all 321
  scripts end on exact instruction boundaries, every jump-table destination is
  an instruction, and the real opening reaches voices C0001/C0002 before any
  interactive choice. Run it directly with `python3 scenario_audit.py`.

The runtime now advances through dialogue choices, map selections, and timed
ghost-action branches. Remaining compatibility work includes validating every
route and ending, several transition effects, and complete later-game visual
and audio sequencing. Diagnostics can be opened from the toolbar or with F12;
unknown behavior remains visible rather than being silently approximated.

Click the dialogue box, press Enter, or press Space to advance text.
Right-click toggles a clean view of the current background without the message
interface or face portrait; a left click restores the interface without
advancing. The browser context menu is suppressed while using the runtime.

Save data is stored locally in the browser profile with IndexedDB. It does not
modify the original `GAME.SAV`, and it stays on this computer. Clearing site
data for `127.0.0.1:8787` also clears these preservation-runtime save slots.
The Settings popup can export all slots, global read history, and runtime
settings to a portable JSON archive and import that archive in another browser.

The bundled Mincho and MS Gothic-style settings use game-character subsets of
Noto Serif CJK JP and Noto Sans Mono CJK JP. They are distributed under the
SIL Open Font License 1.1; its text is included at `web/fonts/OFL-1.1.txt`.

## Browser requirements

A current Firefox, Chromium, or Safari release is recommended. No files are
uploaded: the browser talks only to the loopback Python server.
