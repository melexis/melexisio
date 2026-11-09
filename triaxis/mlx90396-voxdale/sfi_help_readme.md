# How to use the MLX90396 SFI demo

This demo shows that the MLX90396 ignores outside magnetic fields. A coil adds a stray field on purpose: the ordinary sensor on the left is disturbed, while the MLX90396 on the right is not.

## Quick start

1. Plug the demo board into the computer with the USB cable.
2. Open this page in **Google Chrome** or **Microsoft Edge**. Other browsers cannot talk to the board.
3. Click **Connect USB**, keep the default settings, and click **Open Serial Port**.
4. Pick the board in the browser's list and click **Connect**.
5. Click **Start Live Stream**. The plots and the 3D model start following the knob.
6. Click **Stray Field Coil** and watch the two sides of the **Stray Field Comparison** screen.
7. When you are done, click **Stop**, then **Disconnect** before you unplug the board.

**No board with you?** You do not need to click anything: until a live stream runs, the page plays a built-in simulation (the **Auto-Pattern**), so you can still show every screen.
## The buttons

- **Connect USB** - opens the connection window. Once connected, the same button disconnects.
- **Help** - opens this help beside the demo. The demo keeps working while it is open, so you can read a step and do it. Click **Help** again or **✕** to close it. **Open in new window** moves the help into its own window, for example on a second screen.
- **Start Live Stream** - starts reading the sensor. Without a board connected it opens the connection window instead.
- **Stop** - stops reading and goes back to the simulation. It also switches the coil off if it is on. The board stays connected.
- **Auto-Pattern** - in the simulation, moves the knob through a repeating pattern by itself. Click it to turn it off (the button dims). Dragging the knob in the 3D model also turns it off. While a live stream runs the board moves the knob, and the pattern comes back when you click **Stop**.
- **Stray Field Coil (5 mT)** - in the tab bar, next to **Hide menus**, so it is always on screen. Switches the coil on for a few seconds to add a stray field.
    - **coil pulse**, in the row of buttons, sets how long the coil stays on, from 0.5 to 60 seconds (default 5). You cannot change it while a pulse is running.
    - While the coil is on, the button counts down the seconds. Click it again to switch the coil off early.
    - Without a board connected, the pulse is only simulated.
    - If the button shows **Coil Fault**, the coil could not be switched on. Click it to try again.
- **Calibration Tuning** - opens the settings panel described below.
- **Clear Trajectories** - wipes the trails drawn in the 3D plots. Streaming continues.
- **Zero Graphs** - centres both 3D plots on the current position (the button then reads **Zeroed**). Click again to undo.
- **Debug** - shows a message log. Only needed when an engineer asks for it.

## Connecting to the board

The defaults in the connection window are right for the standard demo kit.

- **Target Device Driver** - **SCPI Bridge** for the Melexis IO board, which is the normal choice. **Direct Arduino Telemetry** is only for the Arduino version of the kit; with it, the gain and the coil do not work.
- **Serial Baud Rate** - leave it at **115200** unless someone tells you otherwise.
- **SPI Bus Type** - **Cable Connection** if the sensor is connected to the board with a cable, **Header Connection** if it is plugged straight onto the board's pin header.

## The three screens

Choose a screen with the tabs above the demo area.

**Hide menus**, at the right end of the tab bar, hides the title and the two rows of buttons so the screen shows only the tabs and the data. **Stray Field Coil** stays in the tab bar, so you can still pulse the coil; set the pulse length before hiding the menus. Click **Show menus** to bring them back. Streaming carries on either way.

### Stray Field Comparison

The screen is split in two, so the two sensors can be compared side by side. On a narrow window the Legacy side is on top instead of on the left.

- **Left - STRAY-SENSITIVE** - an ordinary 3D Hall sensor. It is disturbed when the coil is on.
- **Right - STRAY FIELD IMMUNE** - the MLX90396 differential reading. It keeps reading correctly while the coil is on.

Each side has:

- **A 3D plot** with a model of the magnet. It follows the knob and leaves a trail.
- **A radar** whose needle shows which way the knob is tilted. The centre means the knob is at rest.
- **Small readouts** above the radar: the magnet signal strength and two tilt angles (alpha and beta). The strength shows **weak** or **no magnet** if the magnet is too far away or missing.

**How to show the effect:** stream live, hold the knob still, click **Stray Field Coil**, and point out that the left side moves while the right side stays put.

### 3D Joystick Model

- A 3D model of the demo joystick that tilts the way the real knob does.
- **Zero Position** - makes the knob's current position the new centre, for the 3D model and both radars. Use it while streaming, with your hand off the knob.
- The line next to it shows **Tilt X**, **Tilt Y** and **Press**. Press reads **PUSHED** when the knob is pushed down.
- **push at** - how hard the knob has to be pushed before it reads **PUSHED** (default 10). The number in brackets after Press is the live value: push the knob, note the number, and set **push at** a little below it. The page remembers the setting.
- In the simulation you can drag the knob with the mouse. Scroll to zoom. The camera angle is fixed.

### Sensor Diagnostics

Use this screen to check that the sensor is healthy. The numbers are for engineers. You only need the coloured messages:

- **Frame Health** - **Status clean** means all is well. Otherwise the message names the cause:
    - **ADC overflow** - the magnet signal is too strong for the sensor: choose the **1x** gain.
    - **Anything else that keeps coming back** - click **Stop**, **Disconnect**, unplug and replug the board, then connect again.
    - The **Flags** line remembers the last event and when it happened, so a short one is not missed.
- **Absolute Pixels** - **Within ADC range** is good. **ADC near full scale** means the magnet signal is too strong for the sensor: choose the **1x** gain.

In the simulation this screen stays empty.

## Calibration Tuning panel

Open it with the **Calibration Tuning** button.

- **Gain** - how strongly the sensor amplifies the magnet signal. There are two separate gain settings:
    - **1px** - used by the left (Legacy) side. Default **3x**.
    - **2px** - used by the right (MLX90396 SFI) side. Default **1x**.
    - Each one has **1x** and **3x** buttons and a **trim** box that takes any value from 0 to 63, if you were given one.
    - **Device confirmed** shows the value the chip accepted. **Device: not read** means the value has not reached the chip yet.
- **Pixel pitch** - leave it at **1** unless an engineer gives you another value. It changes the strength readouts and when **weak**, **no magnet** and **PUSHED** appear.
- **k1, k2, o11, o12, o21, o22** - fine-tuning numbers for the MLX90396 angles. The defaults (k = 1, o = 0) mean no correction. Type in the values you were given; they take effect immediately.
- **Differential angle formula** - **Enhanced** (the default) uses the fine-tuning numbers above; **Normal** ignores them. Leave it on Enhanced unless you were told otherwise.
- **Reset Defaults** - puts the fine-tuning numbers and the pixel pitch back to their defaults. It does not change the gain.

The formulas shown in the panel are background for engineers. You can ignore them.

## When to stop before changing something

- **Gain needs the stream stopped** (both 1px and 2px). The chip cannot take a new gain while it is measuring, so the gain buttons are greyed out while streaming.
    1. Click **Stop**.
    2. Pick the gain.
    3. Click **Start Live Stream**. Starting always sends both gain settings to the chip.
    4. Check that **Device confirmed** shows the values you picked.
- **You can pick the gain before connecting.** It is sent to the chip when you click **Start Live Stream**.
- **Use while streaming:** **Stray Field Coil**. That is what it is for.
- **Change any time:** the fine-tuning numbers, pixel pitch, angle formula, **Reset Defaults**, **Clear Trajectories**, **Zero Graphs**, **Auto-Pattern** and switching screens.
- **Only while streaming:** **Zero Position**, because it needs a live reading.

## If something goes wrong

- **The browser says Web Serial is not supported** - use Chrome or Edge on a computer.
- **The board is not in the browser's list** - try another USB cable (some cables only charge), or unplug and replug the board.
- **"Port already in use"** - close any other program or browser tab that has the board open, then connect again.
- **The right-hand radar says no magnet while the left one works** - open **Calibration Tuning** and check that the **2px** gain shows **Device confirmed**. If not, click **Stop** and then **Start Live Stream** again.
- **The coil button says Coil Fault** - the board did not switch the coil on. Click it again; if that fails, disconnect and reconnect.
- **The picture sits off centre when you are not touching the knob** - click **Zero Graphs** (plots) or **Zero Position** (3D model and radars).
- **The gain buttons are greyed out** - the stream is running. Click **Stop** first.
- **Help says it could not load** - the page was opened as a file. Open it through its web address instead.
