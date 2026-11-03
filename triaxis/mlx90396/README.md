# MLX90396 Multi-Demo Platform — Application Note (Web GUI)

A browser-based dashboard and diagnostic toolkit for the **Melexis MLX90396** 3D Hall-effect
magnetic sensor. Everything runs client-side in a Chromium browser (Chrome / Edge) over the
**Web Serial API** — no backend server, no native driver install. The GUI visualizes the
magnetic field live on three views (Joystick, Twist, 3D Plot), exposes the Twist-mode signal
math and calibration, and drives a third.js SFI dome visual.

> **Browser requirement:** Web Serial is implemented by **Chrome and Edge (desktop)** only.
> Firefox and Safari do not provide `navigator.serial` — the GUI detects this, disables the
> "Open Serial Port" button, and shows a clear message. The page must also run in a secure
> context (`https://` or `http://localhost`).

---

## 1. System Architecture & Data Paths

```
        Browser (this GUI)
   ┌─────────────────────────────────────────────┐
   │  Joystick view · Twist view · 3D Plot view   │
   └──────────────────────┬──────────────────────┘
                          │ Web Serial API
        ┌─────────────────┴──────────────────┐
        │  (a) SCPI Bridge  (b) Arduino API   │
        └─────────────────┬──────────────────┘
                          │
           Bridge MCU → SPI → MLX90396  (SCPI path)
           Arduino MCU → frame stream  (Arduino path)
           —————————————  Emulation      (no hardware)
```

Three interchangeable data sources feed the same UI pipeline (`app.js`):

| Path | Driver in modal | Data origin | Latency in live loop |
|---|---|---|---|
| **SCPI Bridge** (`scpi`) | `mlx_api.js` (`MLX90396_API`) | Raw 4-pixel register reads over SCPI-tunneled SPI | 50 ms sample (20 Hz) |
| **Direct Arduino** (`arduino`) | `arduino_api.js` (`Arduino_API`) | Firmware telemetry frame stream (angle from on-MCU TFLite model) | 25 ms sample (40 Hz) |
| **Emulation** (no connection) | n/a | Synthetic Lissajous signal | ~33 ms (30 Hz) |

**Emulation mode** activates automatically when **Start** is pressed while no serial device is
connected, so the full UI can be exercised without hardware.

---

## 2. Main Toolbar

| Control | Behaviour |
|---|---|
| **Start** | Begins the live demo loop. Enabled out of the box (this is how you reach the built-in emulator without hardware); after a connect/disconnect cycle it is disabled until a device is connected again. |
| **Stop** | Halts the loop, recentres joystick/magnet disk, demo status → Idle. |
| **Status badge** | `Idle` / `Running` / `Error`. |
| **Connect USB** | Toggles **Disconnect** when connected; otherwise opens the connection modal. |

---

## 3. Connection Modal

Opened by **Connect USB**. Chooses the driver, serial settings, and SPI bus *before* the
Chrome port picker appears.

- **Target Device Driver**
  - `SCPI Bridge (MLX90396 SPI API)` — full register/NVRAM + raw pixel control through the
    bridge firmware's SCPI tunnel (`:SPI:WriteReaD`, `:SPI:CS0`, `:SPI:Init`, `:VDD:3V3`, …).
  - `Direct Arduino Telemetry (Frame Stream)` — passive consumer of the Arduino's
    pipe-delimited frame telemetry (no SCPI / NVRAM controls; those stay disabled).
- **Serial Baud Rate** — 115200 (default), 230400, 500000, 9600.
- **SPI Bus Type** (SCPI only)
  - `:SPI` — **Cable Connection**; initializes `:CON:CS1:GPIO:INIT:OUT 0` and
    `:SPI:BUFfer 1,1,1,1,0`.
  - `:SPI2` — **Header Connection**; initializes `:SPI2:Init 0`, `:SPI2:SET:CS0 0`,
    and `:A3:GPIO:INIT:OUT 0`.
- **Browser-Authorized Ports** — shows previously-permitted ports as
  `Serial Port · VID 0xXXXX · PID 0xXXXX` (generic — no hardcoded VID→name table).
- **Open Serial Port** — calls `navigator.serial.requestPort()` with **no device filters**:
  the Chrome picker lists every serial device Windows detects.

**Error handling:** failures keep the modal open and display a visible `#connect-error`
message. "Failed to open serial port" maps to an actionable hint (another program holds the
port — close Arduino IDE Serial Monitor / vendor tools, replug). Unsupported browsers get an
explicit message instead of a silent failure. All diagnostics are also mirrored to the
browser DevTools console (there is no on-screen terminal window).

---

## 4. View 1 — Joystick

`view-joystick` (active sub-tab by default).

- **3D stick** — CSS-variable driven (`--tx`, `--ty`): translational offset plus
  `rotateX/rotateY` tilt. Fed by `rawX/20, rawY/20`; stick radius is clamped to a max of
  50 units.
- **28-LED radial ring** — 360°/28 ≈ 12.86° per LED. The LED nearest the vector **angle**
  lights `led-active` with a ±2-LED falloff (`led-low-1`, `led-low-2`). Active only when the
  deviation from center is > 5 units.
- **Polar Radar** (canvas) — a SFI-style field-vector scope: dark reticle with 25% rings
  and a crosshair, compass labels `0° (+X)` / `90° (+Y)` / `180° (-X)` / `270° (-Y)`, and a
  theme-coloured measured vector (glowing head) clamped to the rim. **+Y is up**, matching
  the joystick knob, because it is fed the same absolute-field coordinates. Readout:
  `Azimuth · Range`, where `Azimuth = atan2(y, x)` (0° at +X, 90° at +Y, CCW) and range is
  the vector magnitude as % of 50 (the knob rim).

---

## 5. View 2 — Twist

`view-magnet` — the diametrical twist demo. A half-blue/half-red magnet disk
(blue = N, red = S) rides a 1 mm grid printed on a stylized sensor overlay.

**Rendering**
- Grid is **fixed at ±2.5 mm** — it never auto-ranges. Earlier builds rescaled the map from
  live peak tracking, which made the disk appear to "jump" during a pure rotation; that was
  removed. `gridHalfPx()` reads the sensor element's live `clientWidth/2`, so
  `pxPerMm = halfPx / 2.5` adapts to window size without changing the physical meaning.
- **SVG unit mapping:** `viewBox="-75 -75 150 150"` over ±2.5 mm, so **1 mm = 30 user units**
  and the origin is the exact centre of the grid. The `grid-1mm` `<pattern>` is therefore
  `width/height="30"` at `x="0" y="0"` — lines fall on 0, ±30, ±60, so a line runs through the
  origin and every ±1 mm / ±2 mm tick mark. Keep the pattern pitch equal to `150 / mmSpan`;
  anything else silently shifts the mesh off the axes.
- XY position becomes `translate3d(transX, transY, 0)`, clamped to the grid edges.
- Twist angle becomes `rotate(-angle)` — the sign is deliberately inverted so a **rightward
  (CW) physical rotation renders as clockwise on screen** (CSS counts + as CW, but the raw
  device angle grows the other way).
- Both XY and angle pass through an **EMA filter** (`ALPHA = 0.4`) so tremor and model
  fuzz glide instead of snapping; the same filter runs on all modes.

**Controls**
- **Zero Position** — captures the current raw position as the offset
  (`magnetOffsets.x/y`); the disk recentres. Reported over console.
- **Motion mode** — one selector for all three demo cases (reviewer slide 4 asked for an
  "XY only" option beside twist-only). `XY + Twist` (default) tracks position and twist;
  `XY only` tracks position and holds the twist angle at its last value; `Twist only` pins
  `transX/transY` at center so the disk only spins, isolating rotation from position. The
  internal EMA keeps tracking in every mode, so switching back never snaps. It replaces the
  old `Lock XY (twist only)` checkbox, whose label was self-contradictory (locking XY is
  what makes it twist-only).
- **Signal & Calibration** — toggles the `#twist-panel` with live readouts and calibration
  inputs (below). Per reviewer slide 4 it belongs to the no-twist **Thumbstick** tab only, so
  the panel is reparented into `#view-joystick` at load; twist-mode calibration is covered by
  *Zero Position* instead.

### Twist panel — live signal

Six readouts (updating while the panel is open on the Thumbstick tab):

1. **Alpha (calibrated)** — Desmos-calibrated twist angle about the X axis, degrees.
2. **Beta (calibrated)** — Desmos-calibrated twist angle about the Y axis, degrees.
3. **Alpha (raw)** — raw `atan2` angle, degrees.
4. **Beta (raw)** — raw `atan2` angle, degrees.
5. **Alpha Strength** — `sqrt(Z² + X²)` (1px) or `sqrt(Z02² + X02²)` (2px), in the mode's unit.
6. **Beta Strength** — `sqrt(Z² + Y²)` (1px) or `sqrt(Z13² + Y13²)` (2px), in the mode's unit.

### Twist panel — mode selector

- **1px mode (single pixel · mT)** — uses pixel **0**: `X0, Y0, Z0`.
  `Alpha = atan2(Z0, X0)`, `Beta = atan2(Z0, Y0)`.
- **2px mode (differential · mT/mm)** — uses the differences between pixel pairs:
  `X02 = (x2 − x0)/2`, `Z02 = (z2 − z0)/2`, `Y13 = (y3 − y1)/2`, `Z13 = (z3 − z1)/2`.
  `Alpha = atan2(Z02, X02)`, `Beta = atan2(Z13, Y13)`. Cross-terms in the calibration
  consume the *other* axis' differential pair (alpha sees `Y13`, beta sees `X02`).
- **Units** — the raw LSB are converted to physical units before display, using the
  shared scale in `../angle_calib.js`: absolute `÷ 20` (mT), differential `÷ (20 × pixel
  pitch)` (mT/mm). The pitch is live-trimmable in the config card (default 1.0 mm) and is
  the same value the SFI page uses. Dividing a whole signal by one constant leaves
  every `atan2` angle untouched, so this only rescales the strength readouts.

### Twist panel — gain & calibration config

- **GAINSEL (electrical gain)** — Two factory presets, applied per mode through
  `twist_api.js` `setGainSel`: **1x** (`gain 9` ≈ 72 counts) and **3x** (`gain 37` ≈ 219),
  plus a free **trim** field (0–63) for the AE's final-test value. Per the AE, the 1px
  path defaults to **3x (37)** for the twist demo and 2px to **1x (9)**; the hint text
  shows the selected value and its 6-bit pattern live.
  - **Hardware write (SCPI only)** — `setGainSel` is the local table; the line below it,
    `Device confirmed: …`, is a readback of register `0x00` bits `[5:0]`/`[11:6]` via
    `MLX90396_API.setGain`/`readGain` (unlock `0x43=0x9952, 0x44=0x84DE`, field write,
    readback verify). Choosing a preset or entering a trim writes immediately while
    the demo is stopped; while it runs the controls are disabled, because the part
    rejects register writes mid-measurement (BUS_ERROR in register `0x41`). Starting
    the demo writes **both** fields from the table (the AE default 1px = 3x / 2px = 1x,
    or the values the user chose, also before connecting). Switching 1px↔2px mode
    re-syncs the display; while running, the readback shows what Start confirmed
    instead of reading the part. The `Device confirmed` line reports what the part
    actually holds.
    Without an SCPI device every value stays local and the readback shows `not read`.
- **Calibration constants** `k1, k2, o11, o12, o21, o22` — edited live; every change
  re-renders the readouts immediately. They feed the Desmos cross-axis model:

  ```
  a1 = atan2( sqrt(z1² + (k1·(y1 − o11·z1))²), (x1 − o12·z1) )
  b1 = atan2( sqrt(z1² + (k2·(x1 − o21·z1))²), (y1 − o22·z1) )
  ```

  **Defaults are not the raw angle.** With `k1 = k2 = 1, o11…o22 = 0` the cross-axis term is
  fully in, so the calibrated angle is the 3D direction angle (`atan2(√(z1² + y1²), x1)` for α),
  not the raw two-signal `atan2(z1, x1)`. The two columns match only when the cross term is
  zero; `k = 0` removes it (the calibrated angle then uses `|z1|`, raw keeps the sign).

---

## 6. View 3 — 3D Plot

`view-3dplot` — live Plotly `scatter3d` of the field vector components
`(Bx, By, Bz)` on axes fixed at ±1000 with 250-unit ticks.

- **Live ball** — current sample.
- **Trail** — last 60 samples as a connected line.
- **Reset Trail** — clears the history (data keeps streaming).
- The plot only redraws while this tab is the active view (performance); data continues to
  accumulate in the history buffer regardless.

---

## 7. How Each Data Source Feeds the GUI

### SCPI path (`scpi`)
Per loop iteration (~50 ms):
1. `sm(0xFC000)` + 15 ms settle → `rm(false, 0xFC000)` reads pixels **0–1**
   (`x0,y0,z0,x1,y1,z1`).
2. `sm(0x03F00)` + 15 ms settle → `rm(false, 0x03F00)` reads pixels **2–3**
   (`x2,y2,z2,x3,y3,z3`).
3. Averages of the four pixels become `avgX, avgY, avgZ`.
4. `angleDeg = atan2(-avgY, avgX)` (sign convention tuned for the demo orientation).
5. `sm(0x000FC)` → `rm(false, 0x000FC)` reads the six differential
   channels (X02 … Z13). They feed the **Diagnostics** tab and the Twist panel's **2px**
   readouts, so the transfer is issued only when one of those needs it
   (`needsDiffChannels()`); the thumbstick knob still uses the absolute average (see 7).
6. Magnet disk position is derived from **gradients** with crosstalk removal:
   `rawGradX = ((x1+x2) − (x0+x3))/2`, `rawGradY = ((y0+y1) − (y3+y2))/2`,
   `cleanGradX = rawGradX − avgX·K_ROT_X`, `cleanGradY = rawGradY − avgY·K_ROT_Y`
   (`K_ROT = 0.10`), finishing with `mm = cleanGrad · SCALE` (`SCALE = 0.02`).
7. The thumbstick knob reads the 4-pixel absolute average only:
   `joyX = avgX / 20`, `joyY = avgY / 20` (gradient/field source toggle removed).
8. All four pixels (plus `resDiff`, when fetched, for the 2px pair) are passed to
   `updateTwistUI` for the Twist panel.

### Arduino path (`arduino`)
The 15-field frame is parsed by `Arduino_API.parseLine`:

```
x0|y0|z0|x1|y1|z1|x2|y2|z2|x3|y3|z3|X_mm|Y_mm|angle
```

`X_mm / Y_mm` are the firmware's position estimate (mm) and `angle` is degrees **as computed
on the MCU** (TFLite model — fuzzy by nature). `rawX/Y/Z` here are the simple mean of the
four pixels. A legacy 6-field frame (`posX,posY,angle,rawX,rawY,rawZ`) is also accepted.
Position/angle are then offset by "Zero Position" and rendered identically to the other paths.

### Emulation path
Generates a Lissajous: `emulatedX = sin(a·0.7)·1.8`, `emulatedY = cos(a·0.9)·1.8`,
`emulatedAngle = a`. Feed the same UI functions; the Twist panel receives a synthetic rotating
4-pixel field (two sine-driven in-plane components + constant Z bias).

---

## 8. Data / Signal-Path Notes

- **Only the active view animates.** Every render function starts with
  `isViewActive(...)`, so off-screen widgets do no DOM/Plotly work.
- **Grid is static** (±2.5 mm fixed range, ±1 mm grid, corner labels ±2.5 mm highlighted).
  No auto-ranging.
- **Rotation sign:** GUI renders `rotate(-angle)` so physical CW twist → on-screen CW.
  If the MCU convention changes, flip the sign at that single render line.
- **Jitter handling:** EMA smoothing (`ALPHA 0.4`) is the only damping; the wobble you still
  see under a pure twist is real data — TFLite model output fuzz, mechanical play in the
  printed rig, and hand tremor over a ±2.5 mm travel — not a mapping bug.

---

## 9. Inactive/Unreachable Views (present in markup, no tab exposes them)

- **`view-calib` — Joystick Calibration Wizard** (steps: capture zero, boundary sweep,
  deadband filter, apply) with a Bx-vs-By motion trace canvas and telemetry offsets/span.
  Its zero/sweep/save buttons are HTML-enabled only via an **SFI demo tab** that is not
  wired into the current toolbar.
- **`view-memory` — NVRAM register editor** (read/write 16-bit words, full 0x00–0x3F dump,
  Store/Recall). Controls enable only in **SCPI** mode. Reachable only from a legacy SFI UI.

Both remain functional if a future tab navigator is added; they are simply not routed today.

---

## 10. Supporting Files

| File | Role |
|---|---|
| `index.html` | Structure, inline app CSS, SVG grid assets, modal, sub-views. |
| `app.js` | Controller: serial manager, SCPI wait/route, demo loop, all three views' renderers, tab routing, modal logic. |
| `twist_api.js` | Twist-specific layer: 1px/2px raw `atan2`, signal → formula mapping, GAINSEL table; delegates the Desmos calibration to `../angle_calib.js`. |
| `../angle_calib.js` | Shared α/β calibration engine (Desmos model). One source of truth, also used by the SFI page. |
| `mlx_api.js` | `MLX90396_API`: SPI command builder, CRC-8 (poly 0x2F) verify, register read/write, measurement mask handling. |
| `arduino_api.js` | `Arduino_API`: 15-/6-field frame parser, latest-sample store. |
| `sfi_demo.js` | Standalone SFI dome visual + `updateSfiDomeKinematics` (fed raw X/Y/Z, normalized to ±1). |
| `webdesign.css` | Shared design-token stylesheet ("ds-" classes). |
| `resources/background.jpg` | Page background. |

## 11. Quick Start

1. Serve locally (`python -m http.server` or VSCode Live Server) or push to GitHub Pages —
   any secure context.
2. Open in **Chrome/Edge**, click **Connect USB**, choose driver (SCPI Bridge or Arduino
   Telemetry + baud), click **Open Serial Port**, pick your COM device.
3. Click **Start**. Switch sub-tabs to watch the joystick, twist, and 3D plot.
4. No hardware? Click **Start** anyway — emulation mode drives everything.