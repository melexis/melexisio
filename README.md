# Melexis.IO

Single‑page Melexis.IO demo application that runs in your browser using the Web Serial API. Open `index.html` over HTTPS or `http://localhost` in Chrome/Edge (desktop), connect to a serial device, and send/receive text commands.

## What’s inside

`index.html` contains everything:
- UI with a main pane (connection controls, log, input area) and an integrated right sidebar (quick commands + history)
- Single compact input row (Clear / Save... / TX field / Send) — input behavior toggles moved to Settings
- Web Serial logic (connect / disconnect with robust stream teardown, read/write piping)
- Command history persisted in a cookie (newest first)
- Color‑coded log rendering (customizable via CSS variables)

## Features

- Serial connection settings:
  - Baud rate (default 115200)
  - Data bits: 7 or 8
  - Parity: none/even/odd (default odd)
  - Stop bits: 1 or 2 (default 2)
  - Flow control: none or hardware (RTS/CTS)
- Quick commands (enabled when connected):
  - `*IDN?`, `:SYST:INFO`, `:SYST:LOG`, `:SYST:HELP`, `*RST`
  - Reset flow: waits for `*RESET*` and then `(OK)>`, disconnects, waits ~5s, and auto‑reconnects to the same VID:PID
- Log viewer with colors (dark theme):
  - Local echo (TX): bright blue (#4db2ff)
  - Device responses (RX): light gray
  - `(OK)>` prompt: mint green (#59ffb0)
  - Non‑OK prompts: soft red
  - Errors: vivid red
    - Status line shows USB VID:PID (hex), serial (if available) and the first *IDN? response line (device description). (OS COM port name/path isn't exposed by Web Serial.)
- Clear / Save... buttons in Terminal; input behavior options relocated to Settings tab and persisted.
- Command history:
  - Stores only typed input (not button/auto commands)
  - Newest‑first; up/down arrows to navigate; click a history item to resend
  - Clearable; persisted in a cookie (bounded size)
  
**IR Image tab (thermal heatmap)**

- 32×24 grid fed by device frames (or single reads). Read sends `mv:66` and parses 769 floats (first ignored + 768 cell values) into a 32×24 frame. Continuous uses device mode (see Protocol below).
- Color gradient legend (dynamic mapping of min/max, vertical bar plus numeric min/max labels)
- Scale selector: x1 (nearest / blocky), x2 & x4 (bicubic interpolation for smoothness) – canvas size stays constant; scale refines visual detail only
- Read button: requests one new frame from the device via `mv:66`
- Continuous toggle: engages device continuous mode; UI auto-syncs with device mode lines. Button turns green and a small glowing status indicator lights up
- Running indicator: always visible; dim when inactive, mint glow when active
- Save image: exports composited PNG (heatmap + legend + labels)
- Export data: CSV with header row (rows, cols, min, max) then one row per heatmap row (values with 2 decimals)
- Video recording: Start/Stop recording buttons capture a WebM video (composite: heatmap + legend + labels) using MediaRecorder. Recording is enabled only while Continuous mode is active.
- Bicubic interpolation implementation: Catmull‑Rom style 4×4 neighborhood sampling per output pixel for smooth upscale
- Legend & export automatically reflect current scale and value range
 - Hover tooltip shows raw cell (row/col) value and interpolated value under the cursor (updates in real time)
 - Optional grid overlay (x1/x2 scales) and numeric cell values (x1 only) toggles for inspection
 - Scaling controls: Auto‑scale (fit to current frame) and manual Min/Max inputs (0.0–50.0).
   - Auto‑scale ON: inputs display computed min/max and are disabled (read‑only).
   - Auto‑scale OFF: user‑entered Min/Max are used for visualization and are not overwritten by new frames. Settings are persisted.
  - Continuous updates are not paused on hover (no hover‑to‑pause behavior).

<!-- People Detection tab has been removed -->

**IR Chart tab (min/mean/max lines)**

- Line chart of per‑frame statistics: Minimum, Mean, Maximum
- Read button for a one‑shot frame; Continuous toggle to start/stop device stream (state synced with IR Image)
- Export CSV with columns: `time_ms,min,mean,max` (time_ms = device timestamp; min/mean/max printed to 2 decimals)
- Save image downloads the chart canvas as PNG (solid background with axes/grid visible)
- Fixed chart height (~400 px); up to 300 points retained (older points dropped)
- X‑axis in the chart shows elapsed milliseconds from the start of Continuous for display only
- No video recording on this tab

**Settings tab**

- Two-column responsive layout:
  - Left: Connection fieldset (baud, data bits, parity, stop bits, flow control) – persisted automatically.
  - Right: Input options fieldset + Actions fieldset.
- Input options (persisted): End‑of‑line (No EOL / LF / CR / CRLF), Local echo, Enter sends, Auto‑scroll. Defaults: LF, echo ON, enter sends ON, auto‑scroll ON.
- Actions fieldset: Reset to defaults, Export settings, Import settings, (future) Save/Load EEPROM.
- Reset to defaults button: 115200 baud, 7 data bits, odd parity, 2 stop bits, no flow control, and input options (EOL=LF, Local echo ON, Enter sends ON, Auto‑scroll ON).
- Export settings button: downloads a JSON bundle (version 5) containing command history (newest‑first), connection parameters, IR settings, and input options.
- Import settings button: restores history, connection parameters, IR settings, and input options. Backward‑compatible with older files (v4 restores scale only; v1–v3 restore history and, where present, connection parameters).

IR settings persisted/exported:
- autoScale (boolean)
- min (number)
- max (number)
- scale (1, 2, or 4)

## Requirements

- Browser: Chrome or Edge on desktop with Web Serial support
- Context: HTTPS or `http://localhost` (file:// will NOT work for Web Serial)
- Only one app can hold a given serial port at a time
 - For video recording: MediaRecorder with WebM support (modern Chrome/Edge)

## Run locally

Serve the folder with any static web server and open in Chrome/Edge.

PowerShell (Python 3):

```powershell
python -m http.server 8000
```

Then visit: http://localhost:8000/

Node.js (npx serve):

```powershell
npx serve -l 8000
```

Then visit: http://localhost:8000/

Tip: If your server serves directory indexes, `index.html` at the project root will open automatically.

## How to use

1. Start a local server (see above) and open the page in Chrome/Edge.
2. Click “Connect…”, pick your serial device, and adjust settings if needed.
3. Type in the input box; choose EOL (LF/CR/CRLF) if your device expects it.
4. Press Enter (when “Enter sends” is checked) or click Send.
5. Use quick command buttons for `*IDN?`, `:SYST:INFO`, `:SYST:LOG`, `:SYST:HELP`, `*RST` (not stored in history).
6. Toggle Local echo and Auto‑scroll as desired; use Clear / Save... to manage the log.

IR Image basics:
- Click Read to request one IR frame (`mv:66`).
- Click Continuous to start device continuous mode (UI will show a green button and a glowing indicator). Click again to stop.
- While Continuous is active, you can Start rec to capture a WebM video (Stop rec will download it). Recording is disabled when Continuous is inactive.
- Use Auto‑scale for dynamic color mapping per frame, or uncheck it and enter Min/Max manually (persisted across reloads and included in settings export).

IR Chart basics:
- Click Read to compute and plot min/mean/max for one frame.
- Click Continuous to stream frames; the chart appends a point each frame. Stopping Continuous in either IR tab stops it for both.
- Export CSV or Save image from the chart toolbar.

## Keyboard

- Enter: send (when “Enter sends” is enabled)
- Arrow Up/Down: navigate history (newest → oldest)

## Troubleshooting

- “Web Serial API not supported” → Use Chrome/Edge desktop, latest version.
- “Failed to connect” or no ports listed → Ensure your device driver is installed and the port isn’t in use by another app.
- No output / device doesn’t respond → Check baud/format and the EOL option (many devices require LF or CR).
- Opened from file system and Connect is disabled → Serve over HTTPS or `http://localhost`.
- Recording button disabled → Recording is only available when Continuous mode is active (device is streaming frames).

## Privacy & data

## Layout & UI specifics

| Region | Description |
|--------|-------------|
| Connection controls | Top fieldset with only Connect / Disconnect + status line. |
| Tabs | Terminal, Settings, Scan, IR Image, IR Chart |
| Log | Monospaced scrollback (`#log`) at fixed height (50vh; capped by viewport calc). |
| Input row | Single compact row: Clear, Save..., TX field, Send (behavior options moved to Settings). |
| Sidebar (right) | Quick command buttons + history list + clear history. |
| IR Image tab | Heatmap canvas, legend, toolbar (Grid size display, Scale selector, Read, Continuous, Save image, Export data, running indicator). |
| IR Chart tab | Line chart of min/mean/max; controls: Read, Continuous, Clear, Export CSV, Save image, running indicator. |

## Android

See `android/README.md` for the native USB CDC (ACM) prototype, build instructions, limitations, and future task list.

On very narrow screens, wrapping will stack controls; the TX + Send pair stays together while secondary controls wrap.

## Theming & customization

Theme is implemented with CSS custom properties near the top of `index.html`:

```css
:root {
  --theme-green: #1066CC; /* primary theme accent (blue) */
  --bg-green: #133D73;    /* lighter navy background */
  --text-on-green: #E9F2FF;
  --panel-bg: rgba(255,255,255,0.06);
  --panel-border: rgba(255,255,255,0.18);
}
```

You can adjust:
- Background: change `--bg-green`.
- Accent color: update `--theme-green` (used in prompts, some buttons before overrides).
- Log height: edit `#log { height: 50vh; ... }`.
- Prompt colors: modify `.log-okprompt`, `.log-badprompt`, `.log-error`.
 - Heatmap size: adjust `IR_BASE_CELL_SIZE` (in `index.html`) and/or grid constants `IR_ROWS`, `IR_COLS` (ensure legend/canvas recalculations match).
 - Interpolation: modify/replace the bicubic code path inside `drawIrHeatmap()` for performance (WebGL, workers) or alternative filters.

### Replacing simulated IR data with real values

The IR tab is wired to a device protocol. For single reads, the app sends `mv:66` and parses 769 floats into a 32×24 frame. For continuous mode, the device streams `mv:66` frames (optionally prefixed with `@66:01:`). Lines may be quoted; the parser tolerates whitespace and CR/LF/CRLF.

## Connection behavior

- The app always requests a new port selection on Connect (simplifies stale handle issues).
- Disconnect waits for stream piping promises (readable/writable) before closing the port to avoid `InvalidStateError` / "port already open" problems.
- Auto query (`*idn?`) sent immediately after successful open (not added to history).

## Device IR protocol (summary)

- Single frame read: send `mv:66` (with selected EOL). Expect a line like `mv:66:<timestamp_ms>:f0,f1,...,f768` (769 floats; first float ignored).
- Continuous mode:
  - Start: send `;` and wait for `;:continuous mode`.
  - Stop: send `!` and wait for `:interactive mode`.
  - Streamed frames: lines like `mv:66:...` or `@66:01:mv:66:...` (quoted or unquoted). UI auto‑activates/deactivates Continuous when corresponding mode lines are seen in RX.

## Accessibility & UX notes

- High contrast dark palette with sufficient differentiation for prompts and errors.
- Auto‑scroll can be disabled for manual review.
- History buttons are regular `<button>` elements; keyboard users can tab through and press Enter/Space to resend.

## Future ideas (not implemented yet)

- Light/dark theme toggle
- Search/filter within the log
- Live sensor integration for IR data (replace random generator)
- Adjustable continuous interval (dropdown: 0.2 / 0.5 / 1.0 s)
- Additional IR visualization enhancements (e.g., adaptive min/max autoscaling)
<!-- Removed People Detection related future items -->

Contributions or suggestions welcome via issues / pull requests.

- Command history is stored locally in a browser cookie for this site; you can clear it from the UI.

---

This project is intentionally minimal: a single `index.html` with inline CSS/JS for easy drop‑in use. Customize by editing that one file.
