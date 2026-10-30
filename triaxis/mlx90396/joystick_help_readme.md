# MLX90396 GUI Help

## Start screen / toolbar

- **Start** — begins the live demo loop. **Requires a connection first** — the button stays disabled until USB is connected.

- **Stop** — halts the loop, resets joystick + magnet disk to center, status returns to Idle.

- **Status badge** — Idle / Running / Error.

- **Connect USB (or Disconnect when active)** — opens the hardware connection dialog / tears the port down.

- **Help** — sits next to **Connect USB** in the toolbar. Opens this document in-app, read from `joystick_help_readme.md` at the moment you click.

## Connection modal

*Pick your setup before the Chrome port-picker appears:*

- **Target Device Driver** — two modes:

    - **SCPI Bridge (MLX90396 SPI API)** — full access: raw SPI register reads, NVRAM, pixel data.
    - **Direct Arduino Telemetry (Frame Stream)** — just receives the Arduino's field frame (angle comes from the TFLite model on the MCU; no register controls).

- **Serial Baud Rate** — 115200 default, also 230400 / 500000 / 9600.

- **SPI Bus Type (SCPI mode only)** — Cable Connection (`:SPI`) vs Header Connection (`:SPI2`); the loop initializes the bus accordingly.

- **Browser-Authorized Ports** — lists previously-permitted ports as `Serial Port · VID 0xXXXX · PID 0xXXXX`.

- **Open Serial Port** — triggers Chrome's device picker (lists all serial devices, nothing filtered).

- **✕ close button** — dismisses the dialog.

- *If something fails, a red error box appears inside the modal with an explanatory hint (e.g. port already held by another program, browser not supporting Web Serial).*

## Tabs (top of demo area): Thumbstick with twist · Thumbstick

*Only the active tab animates.*

### 1. Thumbstick tab

- **3D stick** — moves with X/Y position (X/20, Y/20), clamped to its max radius, with a 3D tilt effect.

- **28-LED ring** — outer LEDs; the one closest to the vector angle lights bright with dimmer neighbors on either side. Off when the stick is centered.

- **Polar radar** — SFI-style field-vector scope under the stick: dark reticle with 25% rings and compass labels (`0° (+X)`, `90° (+Y)`, `180° (-X)`, `270° (-Y)`), plus a teal measured vector with a glowing head. The radar XY is computed by the **angular formula (plain atan2 without calibration) applied to the averaged 4-pixel XYZ**; at rest the field is straight up, so the resting vector sits at the origin and grows in the direction of tilt. Readout line: **Azimuth: 0.0° | Range: 0.0%**, with `Azimuth = atan2(y, x)`.

- **Signal & Calibration button** — toggles the twist panel (live α/β readouts plus the GAINSEL and k/o calibration card) below the radar. Reviewer slide 4 scopes this panel to the no-twist Thumbstick tab.

### 2. Thumbstick with twist tab

- **Magnet disk** (half dark-charcoal **N** / half gold **S**, the Melexis magnet-render colours) — rides a **fixed ±2.5 mm 1 mm-pitch grid** laid out like the sensor die. It positions with X/Y and spins with the twist angle. A rightward physical rotation shows as clockwise on screen.

    - The grid never rescales, so a pure rotation doesn't jump the disk.

    - Position/angle are lightly smoothed (EMA) to damp tremor + model fuzz.

- **Zero Position button** — captures current raw X/Y as the reference; the disk recentres there.

- **Motion mode selector** — `XY + Twist` (default), `XY only` or `Twist only`. `XY only` keeps the disk tracking position and holds the twist angle where it was; `Twist only` stops the disk translating so it only spins, for a clean twist demo. Replaces the old `Lock XY (twist only)` checkbox. The smoother keeps tracking behind the scenes, so switching modes never snaps.

- Twist calibration on this tab is done with **Zero Position**; the Signal & Calibration panel (readouts + k/o) lives on the **Thumbstick** tab (reviewer slide 4).

**Signal & Calibration panel** (opened from the Thumbstick tab):

- **Mode selector**: 1px mode (single pixel · mT) — angles from pixel 0 fields; 2px mode (differential · mT/mm) — angles from gradient pairs between pixels.

- **Readouts (6 boxes)**: `Alpha (calibrated)` / `Beta (calibrated)` (post-calibration angles), `Alpha (raw)` / `Beta (raw)` (pure atan2), and `Alpha Strength` / `Beta Strength` (field magnitude, in mT or mT/mm). The strengths are true physical units: the raw counts are divided by the shared scale in `angle_calib.js` (20 counts/mT absolute, 20 × pitch counts per mT/mm differential).

**Gain & Calibration Config card** *(always visible in every motion mode so GAINSEL and the k/o constants stay reachable while tuning; per reviewer slide 4 the k/o formula itself applies to the no-twist XY demo, while twist calibration is covered by Zero Position.)*

- **GAINSEL presets** — electrical gain register with two factory presets, **1x** (gain 9 ≈ 72 counts) and **3x** (gain 37 ≈ 219 counts), plus a free **trim** field (0–63) for the final-test value. Applied per mode: **1px defaults to 3x (37)** per the AE's twist-demo guidance; **2px defaults to 1x (9)**. The hint shows the selected 6-bit value. Over SCPI choosing a value writes it to the active mode's field (unlock + readback verify) and confirms it in the "Device confirmed" line; without hardware it stays local. Switching 1px↔2px mode re-syncs the display; starting the demo writes the configured gain for the active mode.

- **Pixel pitch (mm)** — the 2px display scale. The differential channels are raw counts, so mT/mm = counts ÷ (20 × pitch). The pitch is not in the preliminary datasheet, so it is live-trimmable (default 1.0 mm) and shared with the SFI page through `angle_calib.js`. It rescales the strength readouts only; the angles are unaffected.

- **Calibration constants k1 k2 o11 o12 o21 o22** — edited live; every keystroke updates the calibrated readouts using the published Desmos cross-axis formula. Defaults `k1=k2=1, o=0` are an exact no-op: calibrated = raw, so nothing is "hidden". The live engine is initialised from these fields on load, so display and math always agree.