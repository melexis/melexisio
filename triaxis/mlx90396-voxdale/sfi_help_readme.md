# MLX90396 SFI Demo Help

## Connection (top bar)

- **Connect USB** — Opens the hardware connection window. When already connected, the button toggles to disconnect instead.

- **Open Serial Port** — Confirms the serial baud rate/SPI settings and opens the available ports list to choose from. If no hardware is present, the app still runs in emulation mode.

- **?** — Closes the connection modal without connecting.

## Stream controls

These sit in the controls bar below the top bar, separate from **Connect USB** and **Help**.

- **Start Live Stream** — Starts the demo loop. With hardware connected it reads 4 pixels (X02/Z02/Y13/Z13 via SCPI) and drives the joystick with live telemetry; otherwise it runs a standalone joystick emulation.

- **Stop** — Stops the stream and releases the loop.

- **Auto-Pattern** — Toggles the idle showcase pattern (dome tilts/presses through a repeating 24s sequence). Dimmed = off. Clicking/dragging the dome knob also turns it off.

- **Stray Field Coil (5 mT)** — Toggles the simulated external uniform stray field that aims to interfere with the MLX90396's raw data readings. The purpose of the operation is to demonstrate that an external magnetic field does not alter the sensor's work.

- **pulse (seconds)** — Pulse width for the coil injection, 0.5–60 s, default 5. The coil is a *timed pulse, never a latch*: clicking **Stray Field Coil** energises it and counts the dwell down to 0, then releases the pin. Clicking again while a pulse is running aborts it early instead of queueing a second one.

- **Gain presets (1x / 3x)** (in the Calibration Tuning panel) — `GAINSEL_1PX` and `GAINSEL_2PX` have **separate** controls (SCPI only). Each offers the two factory presets, **1x** (gain 9 → ~72) and **3x** (gain 37 → ~219), plus its own free **trim** field (0–63) for the final-test value. Writing PX1 touches only reg 0x00 bits [5:0]; writing PX2 touches only bits [11:6], so a precise trim on one pixel never overwrites the other. Defaults are 3x on PX1 (per the AE's "1px needs 3×" guidance) and factory 1x on PX2. The gain literally re-ranges the chip's internal amplifier; the number in parentheses is the resulting full-scale count for the standard Bx channel.

- **Clear Trajectories** — Clears the plotted 3D field traces (streaming continues).

## Help

- **Help** — sits next to **Connect USB** in the top bar. Opens this document in-app, read from `sfi_help_readme.md` at the moment you click.

## Tabs

- **Stray Field Comparison** — Shows signal meters, magnitude gauges, the two 3D field plots (legacy mT and differential mT/mm, each with magnet head + trace, re-centred together by the **Zero Graphs** button in the controls bar), and the two radar plots. The magnet head and its trail ride a gimbal arc: the channel pair sets how far it swings out, the head tilts along that arm, and the press component slides it down its own tilted axis, matching the CAD model in the 3D Joystick Model tab. The magnet uses the same colours as the Twist panel (dark charcoal north, gold south). Each radar carries a field-strength readout (|B| for standard 3D Hall, |∇B| for differential), which flags **weak** or **no magnet** below 8/2 mT (standard) and 3/1 mT/mm (differential), plus α/β. The legacy dial plots the **in-plane field vector** (Bx, By), scaled so 16 mT reaches the rim. The differential dial is a **tilt scope**: its needle plots the same Tilt X/Y pair that drives the dome, so the dial, the model and the readout can never disagree (60° reaches the rim, centre is neutral), and α/β stay in the box as numbers. Both dials use the same convention — right = +X, up = +Y — and the 3D plots use the same, with no hidden mirroring. Differential angles default to **Enhanced** (cross-axis calibrated with k1/k2 and o11–o22); select Normal in Calibration Tuning for the plain `ATAN2(X02, Z02)` / `ATAN2(Y13, Z13)` form. The selected formula feeds the α/β readouts and the live gimbal.

- **3D Joystick Model** — The CAD GLB dome scene. In SCPI mode the gimbal follows the differential X02/Z02 and Y13/Z13 angles, not the absolute-field X/Y average. **Zero Position** captures current differential α/β as neutral; Tilt X/Y show commanded movement relative to this reference (bounded to ±90°). The stick gimbals about the middle of the sensor board (the blue EVB90396 PCB under the magnet), so it leans over the chip rather than swinging around the ball joint. Drag the knob to inspect it and scroll to zoom. Camera pan/rotate is disabled ("Fixed XYZ view"). **Press** reads **PUSHED** when `sqrt(Z02² + Z13²)` reaches ~10 mT/mm.

- **Simulated data (no hardware)** — The Auto-Pattern drives a fake field model so every readout animates. The absolute field *rotates* with the stick: `Bx = 18·joyX`, `By = 18·joyY`, `Bz = 22 − 8·tilt + 12·joyZ`, so Bz trades against the in-plane pair instead of sitting at a fixed 22.0 (it only had a press term before, so it looked frozen for the first half of the loop). The four 2px gradients rotate too: each pair is `R·(cos, sin)` of the stick displacement, `R = 6.5·(1 + 0.5·tilt)`, so dBx/dx and dBy/dy move rather than being pinned at a constant. At rest that reduces to `X02 = Y13 = 6.5`, `Z02 = Z13 = 0` (α = β = 90°, radar centred) — a uniform scale of a pair cannot move its `atan2` angle, so the angle math is untouched.

- **Sensor Diagnostics** — Mirrors the MLX90396 thumbstick diagnostics: a Frame Health card (source, decoded status byte, per-transfer CRC, averaged loop period), raw signed 12-bit LSB tables for the twelve absolute pixels and the four 2px gradient channels (X02, Z02, Y13, Z13, mask `0x000AC`), and a Dome Output card (tilt X/Y and press state). Frame-level cards populate while the SCPI stream runs; in simulation they stay at `--`.

## Calibration panel (hidden by default)

Not a tab — a drawer toggled by the **Calibration Tuning** button, which sits in the controls bar but renders inside the "Stray Field Comparison" section.

- **GAINSEL_1PX / GAINSEL_2PX (electrical gain)** — Independent controls for the two gain fields. Each has the two presets, **1x** (gain 9) and **3x** (gain 37), plus its own free **trim** field (0–63) for the final-test value. Choosing a value writes only that pixel's field over SCPI (`GAINSEL_1PX` = reg 0x00 bits [5:0], `GAINSEL_2PX` = bits [11:6]) with the unlock sequence + readback verify, and confirms it in that pixel's **Device confirmed** line; the other field is preserved. Without hardware the value stays local ("Device: not read"). Each hint shows its selected 6-bit value. The controls live in this Calibration Tuning panel next to the k/o constants.

- **Pixel pitch (mm)** — Sets the ∇B display scale: the chip's 2px channels are raw counts, converted to mT/mm by `20 × pitch` (`20` = the single-pixel LSB per mT). The preliminary datasheet does not publish the pitch, so it is **live-trimmable** here and defaults to **1.0 mm**. Both this page and the Thumbstick page read the same constant from `angle_calib.js`, so they can never disagree. Trim it until the ∇B magnitude matches the physics; changing it does **not** move the α/β angles (a uniform divide cancels in `atan2`). It only rescales the magnitude and therefore the weak/no-magnet and press thresholds.

- **Reset Defaults** — Restores K-factors to 1.0, orthogonality to 0.0 and the pixel pitch to 1.0 mm.

- **Differential angle formula** — Defaults to **Enhanced**, the cross-axis formula shown in the panel (`sqrt(X02² + (k1·(Z13 − o11·X02))²)` over `Z02 − o12·X02`, and its β sibling), so the k/o constants apply out of the box. Select **Normal** for the plain `ATAN2(X02, Z02)` / `ATAN2(Y13, Z13)` form. Note the two modes agree only inside the normal operating band: Enhanced folds the other plane's gradient into each magnitude, so switching with the magnet far off-centre jumps discontinuously by design (reviewer slide 12 specifies the cross terms explicitly).

- **k1/k2/o11/o12/o21/o22 inputs** — Enhanced formula parameters: α uses `sqrt(X02² + (k1·(Z13 − o11·X02))²)` over `Z02 − o12·X02`; β uses `sqrt(Y13² + (k2·(Z02 − o21·Y13))²)` over `Z13 − o22·Y13`. The selected formula feeds the radars, readouts and live gimbal.