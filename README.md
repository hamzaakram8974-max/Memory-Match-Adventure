# Memory Match Adventure

## Project files

- `memory match copy.html` — semantic game interface and accessible screen/dialog markup.
- `memory-match.css` — responsive game styling.
- `memory-match.js` — modern browser ES module for game state, audio, progress, UI events, and gameplay.
- `manifest.json` — install name, launch URL, display mode, and app icon.
- `service-worker.js` — versioned app-shell cache with network-first updates and offline fallback.
- `app-icon.svg` — scalable app icon.
- `features/` — individual HTML pages for background settings, themes, power-ups, rewards, stats, daily streak, accessibility, and backup.
- `multiplayer/` — standalone local 2–3 player mode with fresh randomized boards and pass-the-device turn flow.

The app intentionally remains dependency-free and self-contained. Game progress and preferences are stored locally in the browser; there is no account or server.

## Run and test in VS Code

The game uses a JavaScript ES module and must be served over HTTP or HTTPS; opening the HTML directly with `file://` will not load the module. From the project folder, start a local web server in the VS Code terminal:

```powershell
py -m http.server 8000
```

If the `py` launcher is unavailable, install/use the VS Code **Live Server** extension instead. Open:

```text
http://localhost:8000/memory%20match%20copy.html
```

Use `http://localhost` (or HTTPS), not `file://`, to test service workers and installation. For offline testing, load the game once while online, wait for the service worker to install, then use the browser's offline mode and reload.

## Included gameplay

- 280 levels across Easy, Medium, Hard, and Extra Hard (70 levels per tier), with the original card art, combo scoring, timer, and sequential level unlocks.
- Every level has a countdown based on its pair count (60 seconds plus 15 seconds per pair); matching the last pair wins immediately, while running out of time offers a one-click retry.
- Play opens the difficulty and stage selectors; completed stages stay replayable and the next stage unlocks after a win.
- Difficulty and stage selectors use a responsive, contained layout; the level grid scrolls independently on small screens.
- After a mismatch, unmatched cards are reshuffled so different cards take their previous positions.
- The install button is hidden in standalone app mode and after a successful install in the same browser profile.
- When Sound effects is enabled, Settings can add multiple local MP3s to a playlist. Click a track to play through the following tracks in order; with Ambient music enabled, the playlist repeats. Files stay in this browser's IndexedDB and are never uploaded.
- Settings can also preview local image files, choose one as the custom game background, and remove it later. The selected image is saved in this browser's IndexedDB and is never uploaded.
- Daily challenge: match 10 pairs in one local calendar day to earn three saved hint tokens and 30 coins. Each hint consumes one token; unused tokens carry over.
- Spend daily-achievement coins in the Main Menu Shop to unlock premium card backs, buy more hints, or upload your own PNG/JPG/WEBP/GIF/AVIF/BMP card-back image for 40 coins. Custom card designs are stored locally in IndexedDB and remain unlocked after a progress reset.
- Keyboard-operable cards, touch-friendly controls, pause/resume, confirmed restart, and daily-earned hint tokens.
- Three-star level ratings, saved personal bests, local achievements, sound/music controls, animation preference, and light/night themes.
- Completed levels remain replayable; first clears award 15–25 coins, and the feature shop lets players spend coins on card backs, hints, extra time, reveals, undo, and additional themes.
- Multiplayer setup asks for 2 or 3 players first, then lets each player choose a name and emoji before choosing the pair count. The active player is highlighted in red; after a mismatch, the turn moves directly to the next player without a handoff prompt.
- Separate pages in `features/` provide theme and power-up shops, background adjustments, rewards, statistics, daily streaks, accessibility controls, and JSON save backup import/export.
- A first-visit tutorial and a local reset-progress confirmation.
- Saved progress/settings survive reloads in the same browser profile. Clearing browser site data or using another browser/device removes or does not share that local save.

## Windows download and installation

- The Tauri Windows desktop project is in `desktop/`. Its NSIS setup prompts for acceptance of `desktop/INSTALL-AGREEMENT.txt` and installs for the current Windows user.
- To build the downloadable setup on Windows, install Node.js, Rust with the MSVC toolchain, and Microsoft C++ Build Tools, then run `npm install` and `npm run build` from `desktop/`. The installer is generated under `desktop/src-tauri/target/release/bundle/nsis/`.
- Tauri uses the Windows WebView2 runtime and packages a small bootstrapper that installs that runtime if it is missing. The setup includes the local game files and does not add artificial padding to reach a target size; actual download size depends on the Tauri build and runtime already installed on the PC.
- The desktop app hides the browser/PWA install button while running as the installed Windows app. The agreement screen appears during setup. Uninstall from Windows Settings > Apps > Installed apps. A public download link requires publishing the generated setup file on a website or file host.

## Android packaging

Android packaging has not been started or tested. Once the web version is validated, the next step is to add Capacitor to this existing web project, set its `webDir` to the web app's location, set a unique reverse-domain application ID, generate the Android project, and verify the game on Android emulators/devices. Then open the generated project in Android Studio, configure release signing, and build a signed Android App Bundle for Play Console. Do not commit signing keys or passwords.
