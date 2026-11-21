# MY SMART TV

**Download the Windows installer:** [MY-SMART-TV-Setup-1.0.0.exe](https://github.com/YutFi/My-Smart-TV/releases/latest) (GitHub Releases)

Turn a Windows 10/11 PC into a Smart TV box. Connect it to your television over HDMI, pick that input, and MY SMART TV opens full screen with Live TV (IPTV + guide), movies & series, sports, YouTube, streaming-app shortcuts, music and your own media — all navigable from a sofa with a keyboard, air mouse, game controller or a phone remote such as **Unified Remote**.

## Install (end user)

1. Run `release\MY-SMART-TV-Setup-1.0.0.exe` (no admin needed; installs per user, adds Desktop + Start-menu shortcuts).
2. The **first-run wizard** walks through: TV display → picture size/overscan → audio output → remote test → internet → IPTV playlist → streaming apps → profile.
3. Settings → General → **Start with Windows (TV mode)** launches it full screen at every sign-in. Turn it off any time. Power menu (⏻ top-right) → *Exit TV mode* returns to the desktop; *Quit* closes the app.

Windows SmartScreen may warn because the installer is not code-signed; choose *More info → Run anyway*.

## Build from source

Requires Node.js 22+ (portable copy used during development lives in `_tools\`).

```powershell
npm install
npm run start      # build + launch in development
npm run dist       # build the NSIS installer into release\
```

Layout: `electron/` (main process: SQLite via `node:sqlite`, IPTV/M3U/XMLTV, TMDB, sports, launcher, library scanner), `src/` (React + TypeScript + Tailwind UI, spatial-navigation engine in `src/lib/nav.ts`, player in `src/components/PlayerHost.tsx`), `shared/` (types).

## Remote control

| Input | Action |
|---|---|
| Arrow keys / D-pad / left stick | move focus |
| Enter / A | select |
| Esc / Backspace / BrowserBack / B | back |
| Space, Media Play/Pause | play / pause |
| PageUp / PageDown, Media Next/Prev | channel up / down (live) |
| Number keys | jump to a channel number |
| ← → in player | seek ±10 s; media FF/Rewind ±30 s |
| F (on a channel/station) | toggle favorite |
| Menu / Tab | context action |
| Home, **Ctrl+Alt+H** | return to MY SMART TV from a streaming app |

**Touchpad / air mouse / phone remote with no Esc key:** every screen has an on-screen **◀ Back** button (top-left), **right-click = Back**, and while a streaming app or VLC is on screen a small **⌂ MY SMART TV** button floats in the top-left corner — click it to come straight back.

**Unified Remote:** use *Basic Input* (arrows/Enter/Esc), *Media* (play/pause, seek), *Keyboard* and the touchpad (air mouse — hovering focuses items). Add a custom button that sends Ctrl+Alt+H to jump back from Netflix etc.

## What needs your own setup

* **Live TV** – bring an M3U/M3U8 playlist you are entitled to use (URL, file, USB, network). Optional XMLTV guide URL. The *Public channel lists* button offers community iptv-org lists of publicly available channels; nothing is bundled.
* **Movies & series metadata** – free TMDB API key (Settings → Network). Without it the Movies/Series tabs show setup prompts plus your local library.
* **YouTube in-app search/trending** – optional YouTube Data API key; otherwise search opens YouTube's own page.
* **Netflix, Disney+, Prime Video, etc.** – open in the PC's Edge/Chrome (Widevine DRM) in a fullscreen app window with its own persistent profile; you sign in with your own accounts. DRM, regional limits and subscriptions are never bypassed.
* **Sports** – live scores/fixtures via ESPN's public scoreboard feed and BBC Sport RSS (free, unofficial, may change). No free feed exists for badminton/cricket in-app, so those show news + official broadcaster links.
* **VLC** – optional external engine (Settings → Player) for formats Chromium cannot play (AVI, some MKV codecs).

## Known limits (honest list)

* Built-in player = Chromium: MP4/H.264/AAC, WebM, HLS, MPEG-TS, MP3/AAC/FLAC and many MKVs. Embedded subtitle tracks in MKV are not read; external `.srt/.vtt` files are (with sync adjust). Use VLC for the rest.
* Refresh rate and resolution are detected and shown, but changed in Windows Display settings.
* UI language: metadata and navigation bar are translated (English, Malay, Chinese, Tamil); other screens are English.
* Voice search: no built-in speech engine; use Windows voice typing (**Win + H**) in the search box.
* Catch-up works only for channels whose playlist advertises `catchup` attributes.
* UPnP/DLNA browsing is not built in; use SMB/UNC shares or mapped drives in *My Media*.
* Auto-update uses `electron-updater` against an update-server URL you provide (Settings → Network); none is preconfigured.
* Streaming-app tiles are stylized wordmarks, not official logos.
* Installer is unsigned.

Data lives in `%APPDATA%\MY SMART TV` (SQLite database, logs). PINs are stored as salted scrypt hashes; API keys are encrypted with Windows DPAPI.

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
