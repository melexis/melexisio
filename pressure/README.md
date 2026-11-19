# Pressure Tools (MLX90835)

A lightweight web UI and companion scripts for interacting with the Melexis MLX90835 pressure sensor over I²C/SPI. Includes example helpers, a simple terminal script, and documentation assets.

## Overview
- Web app served from `index.html` for quick interaction and visualization.
- JavaScript helpers for MLX90835 over I²C/SPI and example flows.
- Minimal Node.js script for basic I²C reads via a terminal bridge.
- Documentation assets (EEPROM map) and static media.

## Project Structure
- `index.html` — Main web UI entry point.
- `js/` — MLX90835 device libraries and examples:
  - `MelexisIO.js` — Generic I/O utilities and helpers.
  - `mlx90835_i2c.js` / `mlx90835_spi.js` — Core device access over I²C/SPI.
  - `mlx90835_i2c_examples.js` / `mlx90835_spi_examples.js` — Example operations and flows.
- `mipterminal/` — Simple terminal-based scripts:
  - `i2c_read.js` — Minimal I²C read example using a terminal/bridge.
- `doc/` — Reference materials (e.g., EEPROM map workbook).
- `img/`, `media/` — Static assets (icons, diagrams).

## Prerequisites
- Browser: Any modern Chromium/Firefox/Edge browser for the web UI.
- Node.js (optional, for scripts): v18+ recommended.
- Hardware: MLX90835 device reachable over I²C/SPI via your chosen adapter/bridge.

## Quick Start (Web UI)
You can open the UI directly or serve it locally to avoid any browser file-access limitations.

### Option A — Open directly
1. Open `index.html` in your browser.
2. If the browser blocks local file access or certain APIs, use Option B.

### Option B — Serve locally
From the project root:

Using Python (if available):
```bash
# Windows PowerShell / CMD
cd c:\Projects\html\pressure
python -m http.server 5500
```
Then open http://localhost:5500/ in your browser.

Using Node.js (no setup needed):
```bash
# Uses a one-off static server
npx serve -l 5500 .
# or
npx http-server -p 5500 .
```

## Using the Web UI
- Load the page and follow on-screen controls to connect/interact.
- Select transport (I²C/SPI) as supported by your adapter/bridge.
- Execute example actions (read/write registers, run example flows) found in the Examples sections.

Note: Exact controls depend on your connected hardware and adapter capabilities.

## Measurements chart (mlx90835.html)
- **Values** — *Raw values* plots the counts the chip sends [LSB]; *Decoded values* plots pressure [bar] and temperature [°C] through the selected transfer curve.
- Pressure is on the left axis; TMED (the NTC / media temperature) and TDEV (device temperature) share the right axis and appear only when REG2 enables them.
- **Sensor version** — the default transfer curves from `sensors.ini`; *Custom…* takes a curve typed in by hand (kept in the browser).
- **Fixed scale** — raw: the full output range of each field at its configured width; decoded: P1..P2 and T1..T2 of the curve. Off: auto scale.
- Export CSV writes both the raw counts and the decoded values.

### Adding a sensor version (`sensors.ini`)
Copy a `[PressureSensorInfo_<version>]` section in `sensors.ini`, rename it and change the numbers — no code change needed. `Out*`, `TMED*` and `TDEV*` are counts at `default_resolution` bits; a chip configured for a different output width is bit-shifted to that width before the curve is applied.

## CLI Script (Terminal)
A minimal I²C read example is provided at `mipterminal/i2c_read.js`.

### Run
```bash
cd c:\Projects\html\pressure
node mipterminal\i2c_read.js
```

### Configure
- Open `mipterminal/i2c_read.js` and set the target bus/address/register as needed for your setup.
- If the script references a serial or HID bridge (e.g., a Melexis interface/terminal), ensure it is connected and available.
- If Node reports a missing module (e.g., `serialport`), install it:
```bash
npm install serialport
```

## Tips (Windows)
- If device access is denied, close other apps using the same COM/USB device and try again.
- For drivers, install the vendor-provided USB/bridge drivers and verify the device appears in Device Manager.
- Some browsers require a secure context (https) for advanced hardware APIs. Use a local server when in doubt.

## Troubleshooting
- Web page can’t access device: Serve over `http://localhost` and try again; ensure permissions are granted.
- No data from I²C/SPI: Verify wiring/voltage levels and correct slave address; check that your adapter supports the selected mode.
- Node script errors:
  - Missing module → install via `npm install <module>`.
  - Access denied/port busy → close other serial tools, unplug/replug the adapter.

## Notes
- The `doc/EEPROM_map_90343AA (4).xlsm` workbook contains a reference EEPROM map; use it to interpret raw reads/writes.
- The example scripts are intentionally small and are meant to be adapted to your hardware/transport layer.

## License
This project is licensed under the Mozilla Public License 2.0 (MPL-2.0). See [LICENSE](LICENSE) for details.

## Disclaimer
Use at your own risk. Validate all writes to device registers and confirm according to the device datasheet.
# Pressure Tools (MLX90835)

A lightweight web UI and companion scripts for interacting with the Melexis MLX90835 pressure sensor over I²C/SPI. Includes example helpers, a simple terminal script, and documentation assets.

## Overview
- Web app served from `index.html` for quick interaction and visualization.
- JavaScript helpers for MLX90835 over I²C/SPI and example flows.
- Minimal Node.js script for basic I²C reads via a terminal bridge.
- Documentation assets (EEPROM map) and static media.

## Project Structure
- `index.html` — Main web UI entry point.
- `js/` — MLX90835 device libraries and examples:
  - `MelexisIO.js` — Generic I/O utilities and helpers.
  - `mlx90835_i2c.js` / `mlx90835_spi.js` — Core device access over I²C/SPI.
  - `mlx90835_i2c_examples.js` / `mlx90835_spi_examples.js` — Example operations and flows.
- `mipterminal/` — Simple terminal-based scripts:
  - `i2c_read.js` — Minimal I²C read example using a terminal/bridge.
- `doc/` — Reference materials (e.g., EEPROM map workbook).
- `img/`, `media/` — Static assets (icons, diagrams).

## Prerequisites
- Browser: Any modern Chromium/Firefox/Edge browser for the web UI.
- Node.js (optional, for scripts): v18+ recommended.
- Hardware: MLX90835 device reachable over I²C/SPI via your chosen adapter/bridge.

## Quick Start (Web UI)
You can open the UI directly or serve it locally to avoid any browser file-access limitations.

### Option A — Open directly
1. Open `index.html` in your browser.
2. If the browser blocks local file access or certain APIs, use Option B.

### Option B — Serve locally
From the project root:

Using Python (if available):
```bash
# Windows PowerShell / CMD
cd c:\Projects\html\pressure
python -m http.server 5500
```
Then open http://localhost:5500/ in your browser.

Using Node.js (no setup needed):
```bash
# Uses a one-off static server
npx serve -l 5500 .
# or
npx http-server -p 5500 .
```

## Using the Web UI
- Load the page and follow on-screen controls to connect/interact.
- Select transport (I²C/SPI) as supported by your adapter/bridge.
- Execute example actions (read/write registers, run example flows) found in the Examples sections.

Note: Exact controls depend on your connected hardware and adapter capabilities.

## CLI Script (Terminal)
A minimal I²C read example is provided at `mipterminal/i2c_read.js`.

### Run
```bash
cd c:\Projects\html\pressure
node mipterminal\i2c_read.js
```

### Configure
- Open `mipterminal/i2c_read.js` and set the target bus/address/register as needed for your setup.
- If the script references a serial or HID bridge (e.g., a Melexis interface/terminal), ensure it is connected and available.
- If Node reports a missing module (e.g., `serialport`), install it:
```bash
npm install serialport
```

## Tips (Windows)
- If device access is denied, close other apps using the same COM/USB device and try again.
- For drivers, install the vendor-provided USB/bridge drivers and verify the device appears in Device Manager.
- Some browsers require a secure context (https) for advanced hardware APIs. Use a local server when in doubt.

## Troubleshooting
- Web page can’t access device: Serve over `http://localhost` and try again; ensure permissions are granted.
- No data from I²C/SPI: Verify wiring/voltage levels and correct slave address; check that your adapter supports the selected mode.
- Node script errors:
  - Missing module → install via `npm install <module>`.
  - Access denied/port busy → close other serial tools, unplug/replug the adapter.

## Notes
- The `doc/EEPROM_map_90343AA (4).xlsm` workbook contains a reference EEPROM map; use it to interpret raw reads/writes.
- The example scripts are intentionally small and are meant to be adapted to your hardware/transport layer.

## License
This project is licensed under the Mozilla Public License 2.0 (MPL-2.0). See [LICENSE](LICENSE) for details.

## Disclaimer
Use at your own risk. Validate all writes to device registers and confirm according to the device datasheet.
