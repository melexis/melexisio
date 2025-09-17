# httpterminal — MIP Terminal (Web Serial)

Single‑page serial terminal that runs in your browser using the Web Serial API. Open `index.html` over HTTPS or `http://localhost` in Chrome/Edge (desktop), connect to a serial device, and send/receive text commands.

## What’s inside

`index.html` contains everything:
- UI with a sidebar (quick commands + history) and a main pane (connection controls, log, input row)
- Web Serial logic for connect/disconnect, read/write streams, and error handling
- Command history persisted in a cookie (newest first)
- Color‑coded log rendering

## Features

- Serial connection settings:
  - Baud rate (default 115200)
  - Data bits: 7 or 8
  - Parity: none/even/odd (default odd)
  - Stop bits: 1 or 2 (default 2)
  - Flow control: none or hardware (RTS/CTS)
- Quick commands (enabled when connected):
  - `*IDN?`, `:SYST:INFO`, `*RST`
- Log viewer with colors:
  - Local echo (TX): blue
  - Device responses (RX): gray
  - Prompts like `(OK)>`: light green; any other prompt `(…)>`: red
  - Errors: red
- Input options:
  - End‑of‑line: No EOL, LF, CR, or CRLF
  - Local echo toggle; “Enter sends” toggle; Auto‑scroll toggle
  - Clear log; Save log to file (`serial-log-YYYY-MM-DDTHH-MM-SS.txt`)
- Command history:
  - Stores only typed input (not button/auto commands)
  - Newest‑first; up/down arrows to navigate; click a history item to resend
  - Clearable; persisted in a cookie (bounded size)

## Requirements

- Browser: Chrome or Edge on desktop with Web Serial support
- Context: HTTPS or `http://localhost` (file:// will NOT work for Web Serial)
- Only one app can hold a given serial port at a time

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
5. Use quick command buttons for `*IDN?`, `:SYST:INFO`, `*RST` (not stored in history).
6. Toggle Local echo and Auto‑scroll as desired; use Clear/Save to manage the log.

## Keyboard

- Enter: send (when “Enter sends” is enabled)
- Arrow Up/Down: navigate history (newest → oldest)

## Troubleshooting

- “Web Serial API not supported” → Use Chrome/Edge desktop, latest version.
- “Failed to connect” or no ports listed → Ensure your device driver is installed and the port isn’t in use by another app.
- No output / device doesn’t respond → Check baud/format and the EOL option (many devices require LF or CR).
- Opened from file system and Connect is disabled → Serve over HTTPS or `http://localhost`.

## Privacy & data

- Command history is stored locally in a browser cookie for this site; you can clear it from the UI.

---

This project is intentionally minimal: a single `index.html` with inline CSS/JS for easy drop‑in use.
