# Lien Web Browser Port.

Reimplementation of the game **Lien ～終わらない君の唄～** engine as a web port.
It reads the original installed archives and raw game CD image without changing or copying them.

## Improvements
- Implemented backlog with portrait icon, voice repeat and jump back mechanic.
- Sound configuration, included cut voice on line advancing.
- Save anywhere. (In the original its only possible to save in map choices). Added more save slots
- Skip button with option to only skip already read text.
- Better shortcuts (original only has left click to advance text).
- Text speed slider, textbox transparency slider.
- The ghost action icon glows when it is clickable.
- 1-4x resolution from 640×480 to 2560×1920 with fullscreen option with nearest neighbor upscale. The game text renders at native browser's resolution.
- Added a complete html walkthrough of the game, originally taken from: https://web.archive.org/web/20021212073805/http://www5.ocn.ne.jp:80/~misaki-b/kouryaku/lien.htm
- TODO: Auto Walkthrough route selection, scene skip.

Savedata is stored in the browser. Can be saved locally from settings menu.

## Run

Game data options:

- A completed `assets/` folder extracted with extract_assets.py from the cd files.
- `lien_inst.img` and `lien_game.img` (or renamed `.img` CD dumps) in the root folder; archives are identified and read directly from the images, with no extraction required.
- Game archives (`DATA`, `GGD`, `ISF`, `SE`, and `WMSC`) beside the launcher.
- A different game directory supplied through the `LIEN_GAME_DIR` environment variable.

### Windows

Run `Launch Lien.bat`.
Then open <http://127.0.0.1:8787/> if the browser does not open automatically.

### Linux, macOS, and development

From this directory, with Python 3.10 or newer:

```bash
python3 server.py --open
```

Then open <http://127.0.0.1:8787/> if the browser does not open automatically.
The server binds only to the local computer.

## Extract Assets, run without CD images

Run the one-time extractor:

```bash
python extract_assets.py --install-image lien_inst.img --game-image lien_game.img
```

This creates `assets/` containing every individual image, scenario, cursor,
effect, music track, and voice file (about 0.8–0.9 GB). Once the command reports
completion, the entire `lien-web` folder can be moved by itself; `server.py`
automatically prefers the portable assets. The `.complete.json` marker is only
written after every file has been exported, so an interrupted extraction safely
falls back to the original game data and can be resumed by rerunning the command.

## Test

```bash
python -m unittest discover -s tests -v
```

## Credits
**Lien ～終わらない君の唄～** was originally developed and published by Purple (パープル), a brand of JAST: https://ja.wikipedia.org/wiki/ジャスト_(ブランド)

Web runtime and port developed by GPT-5.6-Sol.

The HTML walkthrough was adapted from the archived guide originally published at: https://web.archive.org/web/20021212073805/http://www5.ocn.ne.jp/~misaki-b/kouryaku/lien.htm

The bundled Mincho and MS Gothic-style settings use game-character subsets of Noto Serif CJK JP and Noto Sans Mono CJK JP. They are distributed under the SIL Open Font License 1.1; its text is included at web/fonts/OFL-1.1.txt.

The Windows package includes the CPython 3.10.11 embeddable runtime, distributed under the Python Software Foundation License. Its license and third-party notices are included at `python/LICENSE.txt`.

Original game graphics, audio, scenarios, characters, names, and trademarks remain the property of their respective rights holders. They are not covered by any license applied to the web runtime.
