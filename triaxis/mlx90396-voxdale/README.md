# MLX90396 Web UI

An industrial-grade, dark-themed WebSerial GUI and diagnostic toolkit for the **Melexis MLX90396 3D Hall-effect magnetic sensor**. 

This application runs directly in Chromium-based browsers without requiring backend servers, native drivers, or software installation. It communicates with an intermediate bridge microcontroller over WebSerial using an asynchronous **SCPI command tunneling protocol** to execute low-level SPI transfers, manage chip registers, perform 3D joystick calibration, and render real-time vector graphics.

---

## Key Features

### 1. 3D Joystick Visualizer & Emulation
* **3D Perspective Rendering:** Uses dynamic CSS variables (`--tx`, `--ty`) to translate 3D magnetic position data into a smooth, spring-loaded 3D joystick animation.
* **28-LED Radial Ring:** Features a 360° perimeter ring with 28 virtual LEDs that highlight the current vector angle and magnitude in real-time.
* **Emulation Mode:** Includes a trigonometric wave simulator for UI testing without physical hardware attached.
* **Toggleable Debug Terminal:** Integrated collapsible debug output window on the main joystick view.

### 2. NVRAM / Register Map Editor (0x00 – 0x3F)
* **Full Register Scan (0x00 – 0x3F):** Read or write individual 16-bit words or perform a full 64-register memory dump.
* **Interactive Data Table:** Synchronized view showing register addresses, raw hexadecimal values, decimal values, and transfer statuses.
* **Hardware EEPROM Operations:** Dedicated controls for **Memory Store (`HS`)** (RAM $\rightarrow$ EEPROM) and **Memory Recall (`HR`)** (EEPROM $\rightarrow$ RAM).

### 3. SCPI Terminal & Serial Engine
* **Command Queue (Mutex):** Prevents packet collisions and stream desynchronization by wrapping requests in individual 1.5-second timeout promises.
* **Tokenizer Stream Parser:** Parses token responses like `(OK)>`, `(ERR)>`, `(E2BIG)>`, and `(ERANGE)>` in real-time[cite: 1].
* **Dual Console Logging:** High-performance log buffer with `requestAnimationFrame` DOM batching and automatic memory truncation to prevent browser slowdowns.
* **Interactive Shell:** SCPI command history with Up/Down arrow navigation, customizable EOL line endings (`LF`, `CR`, `CRLF`), local echo toggles, and one-click macro buttons (`*IDN?`, `:SYST:INFO`, `*RST`)

---

## Architecture & Hardware Communication

The application uses a 3-tier hardware abstraction architecture:

+-----------------------------------------------------------------------+
|                       Web Frontend (Browser)                          |
|   HTML5 Dashboard  |  3D Joystick Canvas  |  NVRAM Table / Wizard     |
+-----------------------------------------------------------------------+
|
WebSerial API (115200 Baud)
+-----------------------------------------------------------------------+
|                 Bridge Microcontroller (CDC-ACM)                       |
|   Executes SCPI commands (e.g., :SPI:WriteReaD, :SPI:CS0)    |
+-----------------------------------------------------------------------+
|
4-Wire SPI Bus + CS0
|
+-----------------------------------------------------------------------+
|                    MLX90396 3D Hall Sensor                            |
|   Measures Bx, By, Bz magnetic field & die temperature     |
+-----------------------------------------------------------------------+

### SCPI Commands Used by Bridge Firmware
* `:SPI:Init 0` — Initialize primary SPI peripheral.
* `:CON:CS1:GPIO:INIT:OUT 0` — Configure Chip Select pin as GPIO output.
* `:SPI:BUFfer 1,1,1,1,0` — Configure buffer parameters.
* `:VDD:3V3` / `:VDD:OFF` — Power rail control.
* `:SPI:CS0 0` / `:SPI:CS0 1` — Manual CS line assertion and de-assertion.
* `:SPI:WriteReaD <bytes>` — Full-duplex SPI transfer of comma-separated decimal bytes.

---

## File Structure

```text
MLX90396-WebUI/
├── index.html        # Main HTML structure, styles, SVG assets, and view tabs
├── app.js            # Main application controller, UI event bindings, WebSerial manager
├── sfi_demo.js       # 3D dome + radar visuals; re-exports the α/β calibration engine
├── mlx_api.js        # MLX90396 device class, command builder, and CRC-8 calculator
├── ../angle_calib.js # Shared Desmos calibration engine (calculate1px/2px, defaults,
│                     # setCalibrationParams) — one source of truth, also used by the Thumbstick page
└── resources/
    ├── background.jpg# UI background image asset
    └── 1317-500-JoystickDemonstratorMLX90396.glb  # CAD joystick/dome model (3D Joystick Model tab)
```
Getting Started
Prerequisites

  A Chromium-based browser supporting the WebSerial API:
  Google Chrome (v89+)
  Microsoft Edge (v89+)
  Opera (v75+)
  A connected USB-to-Serial bridge device programmed with SCPI firmware.
  Note: The WebSerial API requires a secure context. The site must be served over https:// or hosted locally at http://localhost.
