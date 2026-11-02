# How to use the MLX90396 demo

## Quick start

1. Plug the demo board into the computer with the USB cable.
2. Open this page in **Google Chrome** or **Microsoft Edge**. Other browsers cannot talk to the board.
3. Click **Connect USB**.
4. In the window that opens, keep the default settings and click **Open Serial Port**.
5. Pick the board in the browser's list and click **Connect**.
6. Click **Start**. The status changes to **Running** and the screen follows the magnet.
7. When you are done, click **Stop**, then **Disconnect** before you unplug the board.

**No board with you?** Click **Start** without connecting. The page plays a built-in simulation, so you can still show every screen.

## The top bar

- **Start** - starts reading the sensor and moving the pictures.
- **Stop** - stops reading. The pictures go back to the centre.
- **Status** - shows **Idle** (stopped), **Running** or **Error**.
- **Connect USB** - opens the connection window. Once connected, the same button reads **Disconnect**.
- **Help** - opens this page.

## Connecting to the board

The connection window has a few settings. The defaults are right for the standard demo kit.

- **Target Device Driver**
    - **SCPI Bridge** - the normal choice for the Melexis IO board. All controls work.
    - **Direct Arduino Telemetry** - only for the Arduino version of the kit. The pictures move, but the gain buttons do not reach the chip.
- **Serial Baud Rate** - leave it at **115200** unless someone tells you otherwise.
- **SPI Bus Type**
    - **Cable Connection** - the sensor is connected to the board with a cable.
    - **Header Connection** - the sensor is plugged straight onto the board's pin header.
- **Browser-Authorized Ports** - boards this browser has already been allowed to use.

If the connection fails, a red box in the window explains what went wrong.

## The three screens

Choose a screen with the tabs above the demo area. Only the screen you are looking at updates.

### Thumbstick with twist

- **The disk** is the magnet. It slides when you push the knob and turns when you twist it. The dark half is the north pole, the gold half the south pole.
- **The grid** shows 2.5 mm of travel in each direction from the centre.
- **Zero Position** - makes the knob's current position the new centre. Use it while **Running**, with your hand off the knob.
- **The motion selector** (next to Zero Position) chooses what the disk shows:
    - **XY + Twist** - sliding and turning (the default).
    - **XY only** - sliding only. The disk keeps its last angle.
    - **Twist only** - turning only. The disk stays in the centre, which is good for showing the twist on its own.

### Thumbstick

- **The 3D stick** tilts the way you push the knob.
- **The ring of lights** points in the direction of the push. It is dark when the knob is at rest.
- **Polar Radar** - the arrow shows the direction and how far the knob is pushed. Under it, **Azimuth** is the direction in degrees and **Range** is how far, in percent.
- **Signal & Calibration** - opens the settings panel described below.

### Sensor Diagnostics

Use this screen to check that the sensor is healthy. The numbers are for engineers. You only need the coloured messages:

- **Frame Health** - **Status clean** means all is well. Otherwise the message names the cause:
    - **ADC overflow** - the magnet signal is too strong for the sensor: choose the **1x** gain.
    - **Anything else that keeps coming back** - click **Stop**, **Disconnect**, unplug and replug the board, then connect again.
    - The **Flags** line remembers the last event and when it happened, so a short one is not missed.
- **Absolute Pixels** - **Within ADC range** is good. **ADC near full scale** means the magnet signal is too strong for the sensor: choose the **1x** gain.

## Signal & Calibration panel

Open it with the **Signal & Calibration** button on the **Thumbstick** screen.

- **Mode** (top right of the panel) - two ways for the sensor to measure the knob tilt. **1px mode** is the default.
- **The six boxes**
    - **Alpha** and **Beta** - the knob tilt in two directions, in degrees.
    - **calibrated** and **raw** - the angle with and without your calibration numbers. They are the same until you enter calibration numbers.
    - **Strength** - how strong the magnet signal is.
- **Gain** - how strongly the sensor amplifies the magnet signal.
    - **3x** is the default for 1px mode and **1x** for 2px mode. The **trim** box takes any value from 0 to 63, if you were given one.
    - **Device confirmed** shows the value the chip accepted. **Device: not read** means the value did not reach the chip, because there is no connection or the Arduino driver is in use.
- **Pixel pitch** - leave it at **1** unless an engineer gives you another value. It only changes the Strength numbers.
- **k1, k2, o11, o12, o21, o22** - fine-tuning numbers for the calibrated angles. The defaults (k = 1, o = 0) mean no correction. Type in the values you were given; they take effect immediately.

The formula under these fields and the **How the calibration works** box are background for engineers. You can ignore them.

## When to stop before changing something

- **Gain needs the demo stopped.** The chip cannot take a new gain while it is measuring, so the gain buttons are greyed out while the demo runs.
    1. Click **Stop**.
    2. Pick the gain.
    3. Click **Start**. Start always sends the gain settings to the chip.
    4. Check that **Device confirmed** shows the value you picked.
- **You can pick the gain before connecting.** It is sent to the chip when you click **Start**.
- **Change any time, even while running:** **1px / 2px mode**, the calibration numbers, pixel pitch, the motion selector, and switching screens.
- **Only while running:** **Zero Position**, because it needs a live reading.

## If something goes wrong

- **The browser says Web Serial is not supported** - use Chrome or Edge on a computer.
- **The board is not in the browser's list** - try another USB cable (some cables only charge), or unplug and replug the board.
- **"Port already in use"** - close any other program or browser tab that has the board open, then connect again.
- **Status shows Error** - click **Stop** and **Disconnect**, unplug and replug the board, then connect and start again.
- **The picture sits off centre when you are not touching the knob** - click **Zero Position** while running.
- **The gain buttons are greyed out** - the demo is running. Click **Stop** first.
- **Help says it could not load** - the page was opened as a file. Open it through its web address instead.
