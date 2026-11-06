import { MLX90396_API, FLAG_TEXT } from './mlx_api.js';
import { Arduino_API } from './arduino_api.js';
import { 
  initSfiDemo, 
  initCoilControls,
  setCoilState,
  clampCoilDwellS,
  resizeSfiCanvases, 
  updateSfiDomeKinematics, 
  updateSfiHardwareTelemetry,
  setDifferentialFormula,
  setHardwareCoilCallback, 
  resetPlotLines,
  setSfiHardwareTracking,
  setCalibrationParams,
  resetCalibrationParams,
  getCalibrationParams
} from './sfi_demo.js';
import {
  setSensorPixelPitchMm,
  getSensorPixelPitchMm,
  DEFAULT_SENSOR_PIXEL_PITCH_MM
} from '../angle_calib.js';
// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const btnStartDemo = document.getElementById('btn-start-demo');
const btnStopDemo = document.getElementById('btn-stop-demo');
const btnToggleDebug = document.getElementById('btn-toggle-debug');
const miniLogWindow = document.getElementById('mini-log-window');
const statusModeTxt = document.getElementById('status-mode-txt');

// Modal Elements
const connectModal = document.getElementById('connect-modal');
const selDriverType = document.getElementById('sel-driver-type');
const wrapConnType = document.getElementById('wrap-conn-type');
const selConnType = document.getElementById('sel-conn-type');
const selBaudRate = document.getElementById('sel-baud-rate');
const btnModalConnect = document.getElementById('btn-modal-connect');
const btnCloseModal = document.getElementById('btn-close-modal');

// State Variables
let port = null, reader = null, writer = null;
let isConnected = false, isReading = false, isDemoRunning = false;
let textDecoder, textEncoder;
let readableStreamClosed, writableStreamClosed;

let activeDevice = null;
let currentDriverType = 'scpi';

let scpiLock = Promise.resolve();
let scpiWaiter = null;
let rxBuffer = '';
let lastDataLine = '';
let lastScalarLine = '';

const magnetOffsets = { x: 0, y: 0 };
const latestRawMagnet = { x: 0, y: 0 };

window.addEventListener('DOMContentLoaded', () => {
  setHardwareCoilCallback(handleHardwareCoilCommand);
  initCoilControls();
  initSfiDemo();
  initTabNavigation();
  initMenuToggle();
  initSerialPortEvents();
  updateStatusText();
  window.addEventListener('resize', resizeSfiCanvases);
  window.addEventListener('pagehide', releaseCoilOnUnload);
});

function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.view-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      setTimeout(resizeSfiCanvases, 40);
    });
  });
}

// "Hide menus" in the tab bar: hides the title, connection and stream
// controls so the active tab gets the whole screen. The canvases follow
// through their ResizeObserver.
function initMenuToggle() {
  const btn = document.getElementById('btn-toggle-menus');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('menus-hidden');
    btn.textContent = hidden ? 'Show menus' : 'Hide menus';
    btn.setAttribute('aria-pressed', String(hidden));
    resizeSfiCanvases();
  });
}

function getSpiPrefix() {
  return selConnType ? selConnType.value : ':SPI';
}

function appendLog(text, cls = 'log-rx') {
  if (!text) return;

  // Mirror every message to the browser console before the on-page log's
  // hidden check: an error swallowed silently is worse than a noisy console.
  const clean = String(text).replace(/\s+$/, '');
  if (cls === 'log-badprompt') console.warn(clean);
  else console.log(clean);

  if (!miniLogWindow) return;

  // Stop processing debug logs if the window is hidden (Massive Lag Fix)
  if (miniLogWindow.classList.contains('hidden')) return;

  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  miniLogWindow.appendChild(span);
  
  // Keep only the last 100 lines so the browser doesn't freeze
  while (miniLogWindow.childNodes.length > 100) {
    miniLogWindow.removeChild(miniLogWindow.firstChild);
  }
  miniLogWindow.scrollTop = miniLogWindow.scrollHeight;
}

// The prompt is the only reliable end-of-response marker: `\n(<status>)>`, where the
// status is OK on success and a HAL/errno string otherwise (ERROR, BUSY, TIMEOUT,
// CRC, ERR:<n>). Matching the shape rather than a fixed list is what lets a rejected
// command surface as an error instead of as a timeout.
const SCPI_PROMPT_RE = /\(([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9]+)?)\)>\s*$/;

function processRx(text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\n' || char === '\r') {
      if (rxBuffer.trim() !== '') {
        const line = rxBuffer.trim();
        if (currentDriverType === 'arduino' && activeDevice) {
          // Parse only; runJoystickDemo() polls getSample() and is the single
          // driver of the dome/UI. Pushing updateSfiDomeKinematics() here too
          // raced the loop and used a different scaling (rawZ/1000 vs the
          // loop's DOME_LIVE_LSB_SCALE), so the dome jittered between the two.
          const sample = activeDevice.processLine(line);
          // The sketch streams from the moment the port opens; only take over
          // the views while a session runs, so Auto-Pattern keeps going before
          // Start and comes back after Stop.
          if (!sample.error && isDemoRunning) setSfiHardwareTracking(true);
        } else {
          handlePrompt(line);
        }
      }
      rxBuffer = '';
    } else {
      rxBuffer += char;
      if (currentDriverType === 'scpi' && SCPI_PROMPT_RE.test(rxBuffer)) {
        handlePrompt(rxBuffer.trim());
        rxBuffer = '';
      }
    }
  }
}

function handlePrompt(line) {
  const prompt = SCPI_PROMPT_RE.exec(line);
  const status = prompt ? prompt[1] : null;

  if (status === 'OK') {
    let dataPart = line.slice(0, prompt.index).trim();
    if (dataPart.includes(':SPI') || dataPart.includes(',') || dataPart.includes('0x')) {
      lastDataLine = dataPart;
    }
    if (dataPart) appendLog(dataPart + '\n', 'log-rx');
    appendLog('(OK)>\n', 'log-okprompt');

    if (scpiWaiter) {
      clearTimeout(scpiWaiter.timeoutId);
      scpiWaiter.resolve(scpiWaiter.scalar ? lastScalarLine : lastDataLine);
      const rel = scpiWaiter.release;
      scpiWaiter = null;
      if (rel) rel();
    }
    lastDataLine = '';
    lastScalarLine = '';
  } else if (status) {
    appendLog(line + '\n', 'log-badprompt');
    if (scpiWaiter) {
      clearTimeout(scpiWaiter.timeoutId);
      scpiWaiter.reject(new Error("Hardware Error: " + line));
      const rel = scpiWaiter.release;
      scpiWaiter = null;
      if (rel) rel();
    }
    lastDataLine = '';
    lastScalarLine = '';
  } else {
    appendLog(line + '\n', 'log-rx');
    // Bare payload lines, e.g. the "1"/"0" that :A0:GPIO? answers with, carry no
    // comma and no 0x, so they have to be captured separately for scalar reads.
    if (!line.startsWith(':') && !line.startsWith('*')) {
      if (line.includes(',')) lastDataLine = line;
      lastScalarLine = line;
    }
  }
}

async function sendCommand(cmd) {
  if (!writer) return;
  const raw = cmd.trim();
  if (!raw) return;
  try {
    await writer.write(raw + '\n');
  } catch (err) {
    appendLog(`[TX ERROR]: ${err.message}\n`, 'log-badprompt');
  }
}

async function scpiQuery(cmd, options = {}) {
  let releaseLock;
  const nextLock = new Promise(resolve => { releaseLock = resolve; });

  // Join the queue before awaiting. Reading scpiLock after the await let every
  // caller queued behind the same in-flight query wake together and overwrite
  // each other's scpiWaiter - one reply went to the wrong caller and the other
  // caller never settled (reproduced on the bench with two gain clicks).
  const prevLock = scpiLock;
  scpiLock = nextLock;
  await prevLock;

  return new Promise((resolve, reject) => {
    lastDataLine = '';
    lastScalarLine = '';

    // The timeout has to recognise its own waiter: a slow reply arriving after the
    // 2.5 s deadline would otherwise be handed to (or discarded by) the next query.
    const waiter = { resolve, reject, release: releaseLock, scalar: Boolean(options.scalar) };
    scpiWaiter = waiter;
    sendCommand(cmd);

    waiter.timeoutId = setTimeout(() => {
      if (scpiWaiter !== waiter) return;
      scpiWaiter = null;
      waiter.reject(new Error("Device Timeout on command: " + cmd));
      releaseLock();
    }, 2500);
  });
}

// --- Stray field coil: Melexis IO A0 drives the MOSFET gate ---
// :A0:GPIO:INIT:OUT arms the pin and drives the level given as its argument, so a
// single command both configures the pin and leaves it in a known state. The coil
// is only ever a timed pulse: every path that can end the session (pulse expiry,
// explicit abort, Stop, disconnect, tab close) drives A0 low, so the MOSFET cannot
// be left energised.
const COIL_PIN = 'A0';

let coilPinReady = false;
let coilEnergised = false;
let coilPulseTimer = null;

function coilPinCmd(on) {
  return `:${COIL_PIN}:GPIO ${on ? 1 : 0}`;
}

async function armCoilPin() {
  if (coilPinReady) return;
  const cmd = `:${COIL_PIN}:GPIO:INIT:OUT 0`;
  appendLog(`[COIL] > ${cmd} (pin armed as output, level LOW)\n`, 'log-okprompt');
  await scpiQuery(cmd);
  coilPinReady = true;
}

// The firmware answers :A0:GPIO? with a bare "1" or "0" line, so this needs the
// scalar read path rather than the comma-separated data one.
async function readCoilPinLevel() {
  const raw = await scpiQuery(`:${COIL_PIN}:GPIO?`, { scalar: true });
  const match = /([01])\s*$/.exec(String(raw || '').trim());
  return match ? match[1] === '1' : null;
}

async function driveCoil(on) {
  await armCoilPin();
  appendLog(`[COIL] > ${coilPinCmd(on)}\n`, 'log-rx');
  await scpiQuery(coilPinCmd(on));

  let level = null;
  try {
    level = await readCoilPinLevel();
  } catch (err) {
    appendLog(`[COIL] readback failed: ${err.message}\n`, 'log-badprompt');
  }

  if (level === null) {
    appendLog(`[COIL] ${COIL_PIN} level unconfirmed — no usable reply to :${COIL_PIN}:GPIO?\n`, 'log-badprompt');
  } else if (level !== on) {
    throw new Error(`${COIL_PIN} read back ${level ? 'HIGH' : 'LOW'} after commanding ${on ? 'HIGH' : 'LOW'}`);
  } else {
    appendLog(`[HARDWARE COIL] ${COIL_PIN} confirmed ${level ? 'HIGH — MOSFET gate driven, coil energised' : 'LOW — coil off'}\n`, 'log-okprompt');
  }
  return level;
}

function startCoilPulse(dwellS, hardware) {
  if (coilPulseTimer !== null) clearTimeout(coilPulseTimer);
  const dwellMs = dwellS * 1000;
  coilPulseTimer = setTimeout(() => {
    coilPulseTimer = null;
    endCoilPulse(hardware);
  }, dwellMs);
  setCoilState({ active: true, hardware, endsAt: Date.now() + dwellMs });
}

async function endCoilPulse(hardware) {
  if (coilEnergised && hardware) {
    try {
      await driveCoil(false);
    } catch (err) {
      appendLog(`[COIL] FAILED to switch the coil off: ${err.message}\n`, 'log-badprompt');
    }
  }
  coilEnergised = false;
  setCoilState({ active: false, hardware });
}

async function handleHardwareCoilCommand(request) {
  const action = request && request.action === 'off' ? 'off' : 'pulse';
  const hardware = isConnected && currentDriverType === 'scpi';

  if (coilPulseTimer !== null) {
    clearTimeout(coilPulseTimer);
    coilPulseTimer = null;
  }

  if (!hardware) {
    if (action === 'pulse') {
      appendLog('[COIL] No SCPI link to the Melexis IO board — pulsing in simulation only, no pin is driven.\n', 'log-badprompt');
      startCoilPulse(clampCoilDwellS(request && request.dwellS), false);
    } else {
      setCoilState({ active: false, hardware: false });
    }
    return true;
  }

  if (action === 'off') {
    try {
      await driveCoil(false);
    } catch (err) {
      appendLog(`[COIL] abort failed: ${err.message}\n`, 'log-badprompt');
    }
    coilEnergised = false;
    setCoilState({ active: false, hardware: true });
    return true;
  }

  const dwellS = clampCoilDwellS(request && request.dwellS);
  try {
    await driveCoil(true);
  } catch (err) {
    appendLog(`[COIL] could not energise the coil: ${err.message}\n`, 'log-badprompt');
    // A rejected set can still have reached the pin, so force it low before
    // reporting the fault rather than leaving the level unknown.
    try {
      await scpiQuery(coilPinCmd(false));
    } catch (cleanupErr) {
      appendLog(`[COIL] could not force ${COIL_PIN} low afterwards: ${cleanupErr.message}\n`, 'log-badprompt');
    }
    coilEnergised = false;
    setCoilState({ active: false, hardware: true, fault: true });
    return false;
  }

  coilEnergised = true;
  startCoilPulse(dwellS, true);
  return true;
}

// Fires on tab close and on bfcache navigation, so the state is pushed as well as
// the pin: a page restored from the back/forward cache must not come back claiming
// the coil is still on. The write itself cannot be awaited here.
function releaseCoilOnUnload() {
  if (coilPulseTimer !== null) {
    clearTimeout(coilPulseTimer);
    coilPulseTimer = null;
  }
  if (coilEnergised) {
    coilEnergised = false;
    if (writer) {
      try {
        writer.write(coilPinCmd(false) + '\n').catch(() => {});
      } catch (err) {
        // Port already closed: there is nothing left to drive the pin with.
      }
    }
  }
  setCoilState({ active: false, hardware: false });
}

async function releaseCoilBeforeDisconnect() {
  if (coilPulseTimer !== null) {
    clearTimeout(coilPulseTimer);
    coilPulseTimer = null;
  }

  if (isConnected && currentDriverType === 'scpi' && coilEnergised) {
    try {
      await driveCoil(false);
    } catch (err) {
      appendLog(`[COIL] could not confirm the coil is off before closing the port: ${err.message}\n`, 'log-badprompt');
    }
  }

  coilEnergised = false;
  coilPinReady = false;
  setCoilState({ active: false, hardware: false });
}

function setUIConnected(connected) {
  isConnected = connected;
  btnConnect.textContent = connected ? 'Disconnect' : 'Connect USB';
  btnConnect.className = connected ? 'ds-button ds-button--danger ds-button--md' : 'ds-button ds-button--primary ds-button--md';
  updateStatusText();
}

// Says whether the views show real measurements or the simulation, so
// nobody mistakes the Auto-Pattern for the sensor.
function updateStatusText() {
  if (!statusModeTxt) return;
  const link = `${currentDriverType.toUpperCase()}, ${selBaudRate ? selBaudRate.value : ''} baud`;
  if (isConnected && isDemoRunning) {
    statusModeTxt.textContent = `Live measurements (${link})`;
  } else if (isConnected) {
    statusModeTxt.textContent = `Connected (${link}) - simulation shown, press Start for live`;
  } else {
    statusModeTxt.textContent = 'Simulation - connect USB and press Start for live';
  }
}

// Ends a session's hold on the views: back to the simulation, keeping the
// Zero Position for the next Start on the same board.
function returnToSimulation() {
  setSfiHardwareTracking(false, { keepZero: isConnected });
  updateStatusText();
}

async function connectSerial() {
  try {
    currentDriverType = selDriverType ? selDriverType.value : 'scpi';
    const baudRate = selBaudRate ? parseInt(selBaudRate.value, 10) : 115200;

    port = await navigator.serial.requestPort();
    await port.open({ baudRate });

    textDecoder = new TextDecoderStream();
    textEncoder = new TextEncoderStream();
    readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    writableStreamClosed = textEncoder.readable.pipeTo(port.writable);

    reader = textDecoder.readable.getReader();
    writer = textEncoder.writable.getWriter();
    isReading = true;

    if (currentDriverType === 'arduino') {
      activeDevice = new Arduino_API();
      appendLog(`[SYSTEM] Direct Arduino telemetry connected at ${baudRate} baud.\n`, 'log-okprompt');
    } else {
      activeDevice = new MLX90396_API(scpiQuery, getSpiPrefix);
      appendLog(`[SYSTEM] MLX90396 SCPI API connected on ${getSpiPrefix()} at ${baudRate} baud.\n`, 'log-okprompt');
    }

    setUIConnected(true);

    (async () => {
      try {
        while (isReading) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) processRx(value);
        }
      } catch (err) {
        appendLog(`[RX ERROR]: ${err.message}\n`, 'log-badprompt');
      } finally {
        reader.releaseLock();
      }
    })();

    // The reader has to be live before the pin can be armed, and a previous
    // session must not be able to leave the MOSFET energised.
    if (currentDriverType === 'scpi') {
      try {
        await armCoilPin();
      } catch (err) {
        appendLog(`[COIL] could not arm ${COIL_PIN} as an output: ${err.message}\n`, 'log-badprompt');
      }
    }

  } catch (err) {
    appendLog(`[CONN ERROR]: ${err.message}\n`, 'log-badprompt');
  }
}

let disconnectInFlight = false;

async function disconnectSerial(reason = 'manual') {
  // Guard against the unplug listener and the button both firing at once.
  if (disconnectInFlight) return;
  disconnectInFlight = true;

  try {
    isDemoRunning = false;
    // Before the streams go away, so the shut-off can still be sent and confirmed.
    await releaseCoilBeforeDisconnect();
    isReading = false;

    // Fail any in-flight SCPI query so the demo loop stops waiting on a promise
    // a closed port can no longer answer.
    if (scpiWaiter) {
      clearTimeout(scpiWaiter.timeoutId);
      const waiter = scpiWaiter;
      scpiWaiter = null;
      waiter.reject(new Error('Port closed'));
      if (waiter.release) waiter.release();
    }
    scpiLock = Promise.resolve();

    // Guarded: after an unplug these reject with NetworkError, and an unguarded
    // await would abort teardown before the UI is reset - leaving the button
    // stuck on "Disconnect".
    try { if (reader) { await reader.cancel(); reader.releaseLock(); } } catch (_) { /* stream already gone */ }
    try { if (writer) { await writer.close(); writer.releaseLock(); } } catch (_) { /* stream already gone */ }
    if (readableStreamClosed) await readableStreamClosed.catch(() => {});
    if (writableStreamClosed) await writableStreamClosed.catch(() => {});
    try { if (port) await port.close(); } catch (_) { /* port already gone */ }

    port = null; reader = null; writer = null; activeDevice = null;
    readableStreamClosed = null; writableStreamClosed = null;
    rxBuffer = '';
    lastDataLine = '';

    setSfiHardwareTracking(false);
    setUIConnected(false);
    btnStartDemo.disabled = false;
    btnStopDemo.disabled = true;
    appendLog(`[SYSTEM] Port closed${reason === 'unplugged' ? ' (device removed)' : ''}.\n`, 'log-badprompt');
  } finally {
    disconnectInFlight = false;
  }
}

// The board can be pulled out mid-stream. navigator.serial reports that on its
// own `disconnect` event; without this the UI keeps claiming "Connected" and
// the demo loop keeps retrying a dead port every 150 ms.
function initSerialPortEvents() {
  if (!navigator.serial || typeof navigator.serial.addEventListener !== 'function') return;

  navigator.serial.addEventListener('disconnect', (event) => {
    if (!port || event.target !== port) return;
    appendLog('[SYSTEM] Serial device disconnected.\n', 'log-badprompt');
    disconnectSerial('unplugged');
  });

  navigator.serial.addEventListener('connect', () => {
    appendLog('[SYSTEM] Serial device available - press Connect USB.\n', 'log-okprompt');
  });
}

// Best effort on tab close so the OS/CDC port is released promptly. The coil is
// NOT handled here: `pagehide` -> releaseCoilOnUnload already writes the pin low
// synchronously, which is the part that actually matters on unload.
window.addEventListener('beforeunload', () => {
  if (port) { try { port.close(); } catch (_) { /* nothing left to close */ } }
});

// --- EXACT UNCHANGED ORIGINAL LIVE STREAMING LOOP ---
// The gain controls stay locked for the whole session, released only once the
// loop below has returned (see lockGainControls).
async function runJoystickDemo() {
  lockGainControls(+1);
  try {
    await runDemoSession();
  } finally {
    lockGainControls(-1);
  }
}

async function runDemoSession() {
  btnStartDemo.disabled = true;
  btnStopDemo.disabled = false;
  isDemoRunning = true;
  updateStatusText();

  if (isConnected && activeDevice) {
    try {
      appendLog('[SYSTEM] Starting Live Demo...\n', 'log-okprompt');

      if (currentDriverType === 'scpi') {
        const prefix = getSpiPrefix(); 
        await new Promise(r => setTimeout(r, 200));

        if (prefix.includes('SPI2') || prefix === ':SPI2') {
          console.log('[INIT] Configuring Melexis IO SPI2 Header Connection...');
          await scpiQuery(`${prefix}:Init 0`);
          await scpiQuery(`${prefix}:SET:CS0 0`);
          await scpiQuery(":A3:GPIO:INIT:OUT 0");
        } else {
          console.log('[INIT] Configuring Melexis IO Cable Connection...');
          await scpiQuery(`${prefix}:Init 0`);
          await scpiQuery(":CON:CS1:GPIO:INIT:OUT 0");
          await scpiQuery(`${prefix}:BUFfer 1,1,1,1,0`);
          await scpiQuery(":VDD:3V3");
        }

        // Clear what latched before this session (RST is always set after a
        // power-up) so Diagnostics only reports events from here on.
        lastFlagEvent = null;
        const startFlags = await activeDevice.readFlags();
        if (startFlags.warn.length || startFlags.error.length) {
          appendLog(`[FLAGS] Cleared at start: ${describeFlags(startFlags)}\n`, 'log-okprompt');
        }

        // Apply each pixel's own trim before streaming. The chip powers up with
        // GAINSEL_2PX = 0, which leaves the differential (2px) channels near
        // zero: the SFI radar then flags "no magnet" while the 1px legacy path
        // still reads fine. The two fields are independent, so both are written
        // here with whatever value the user trimmed for that pixel.
        await setVoxGain('1px', voxGains['1px']);
        await setVoxGain('2px', voxGains['2px']);
      }

      const K_ROT_X = 0.10, K_ROT_Y = 0.10;
      const SCALE_X = 0.02, SCALE_Y = 0.02;
      // Live absolute-pixel LSB are normalized to joystick throw by this
      // divisor (then clamped to ±1 in updateSfiDomeKinematics). 1000 == the
      // original throw (≈12° for a typical stick sweep); raise it (e.g. 2000)
      // for a softer response at full tilt.
      const DOME_LIVE_LSB_SCALE = 500;
      let diagPeriodMs = null;
      let diagCyclePrev = null;

      while (isDemoRunning) {
        try {
          let posX_mm = 0, posY_mm = 0, angleDeg = 0;
          let rawX = 0, rawY = 0, rawZ = 0;
          let absRaw = { x: 0, y: 0, z: 0 };
          let diffRaw = { x: 0, y: 0, z: 0 };
          let hasLiveSample = false;

          if (currentDriverType === 'scpi') {
            await activeDevice.sm(0xFC000);
            await activeDevice.awaitReady();
            const res01 = await activeDevice.rm(false, 0xFC000);
            
            await activeDevice.sm(0x03F00);
            await activeDevice.awaitReady();
            const res23 = await activeDevice.rm(false, 0x03F00);

            // Request the dedicated 2px channels: X02, Z02, Y13 and Z13.
            await activeDevice.sm(0x000AC);
            await activeDevice.awaitReady();
            const resDiff = await activeDevice.rm(false, 0x000AC);

            // ERROR (bit 2) or WARN (bit 1) in any good reply: read the register
            // that latched it, which names the cause and clears the flag.
            const statusBits = [res01, res23, resDiff]
              .reduce((acc, r) => acc | (r && !r.error ? r.status : 0), 0);
            let flags = null;
            if (statusBits & 0x06) {
              flags = await activeDevice.readFlags({ warn: !!(statusBits & 0x02), error: !!(statusBits & 0x04) });
              noteFlagEvent(flags);
            }

            if (!res01.error && !res23.error && !resDiff.error) {
              hasLiveSample = true;
              const avgX = (res01.x0 + res01.x1 + res23.x2 + res23.x3) / 4;
              const avgY = (res01.y0 + res01.y1 + res23.y2 + res23.y3) / 4;
              const avgZ = (res01.z0 + res01.z1 + res23.z2 + res23.z3) / 4;

              angleDeg = Math.atan2(-avgY, avgX) * (180 / Math.PI);

              const rawGradX = resDiff.x02;
              const rawGradY = resDiff.y13;
              const rawGradZx = resDiff.z02;
              const rawGradZy = resDiff.z13;

              const cleanGradX = rawGradX - (avgX * K_ROT_X);
              const cleanGradY = rawGradY - (avgY * K_ROT_Y);

              latestRawMagnet.x = cleanGradX * SCALE_X;
              latestRawMagnet.y = cleanGradY * SCALE_Y;

              posX_mm = latestRawMagnet.x - magnetOffsets.x;
              posY_mm = latestRawMagnet.y - magnetOffsets.y;
              rawX = avgX; rawY = avgY; rawZ = avgZ;

              // The stray-sensitive side: the absolute field averaged over the
              // four pixels, i.e. at the chip's centre, where the differential
              // channels also measure. (Pixel 0 alone sat off to one side.)
              // Still fully stray-sensitive: a uniform field reaches all four.
              absRaw = { x: avgX, y: avgY, z: avgZ };
              diffRaw = { x: rawGradX, y: rawGradY, z: rawGradZx, bzY: rawGradZy };
            }

            if (diagCyclePrev !== null) {
              const cycleMs = performance.now() - diagCyclePrev;
              diagPeriodMs = diagPeriodMs === null ? cycleMs : diagPeriodMs * 0.8 + cycleMs * 0.2;
            }
            diagCyclePrev = performance.now();
            updateDiagnosticsFrame(res01, res23, resDiff, diagPeriodMs, flags);
          } else {
            const sample = await activeDevice.getSample();
            if (!sample.error) {
              hasLiveSample = true;
              latestRawMagnet.x = sample.posX_mm;
              latestRawMagnet.y = sample.posY_mm;
              posX_mm = latestRawMagnet.x - magnetOffsets.x;
              posY_mm = latestRawMagnet.y - magnetOffsets.y;
              angleDeg = sample.angleDeg;
              rawX = sample.rawX; rawY = sample.rawY; rawZ = sample.rawZ;
              absRaw = { x: rawX, y: rawY, z: rawZ };
              if (Array.isArray(sample.points) && sample.points.length === 4) {
                // The Arduino frame carries the four absolute pixels; derive the
                // differential pair (X02, Y13, Z02, Z13) exactly as 2px mode
                // does, so the dome's diffRaw matches the SCPI path instead of
                // reusing the absolute field for all four channels.
                const [a, b, c, d] = sample.points;
                diffRaw = {
                  x: ((c.x ?? 0) - (a.x ?? 0)) / 2,
                  y: ((d.y ?? 0) - (b.y ?? 0)) / 2,
                  z: ((c.z ?? 0) - (a.z ?? 0)) / 2,
                  bzY: ((d.z ?? 0) - (b.z ?? 0)) / 2,
                };
              }
            }
          }

          // A valid sample takes the dome seamlessly from its idle pattern to hardware tracking.
          // Not once Stop was pressed: a read still in flight must not take the
          // views back from the simulation.
          if (hasLiveSample && isDemoRunning) {
            setSfiHardwareTracking(true);
            if (currentDriverType === 'scpi') {
              updateSfiHardwareTelemetry({ absRaw, diffRaw, hasDifferential: true });
            } else {
              updateSfiDomeKinematics(
                rawX / DOME_LIVE_LSB_SCALE,
                rawY / DOME_LIVE_LSB_SCALE,
                rawZ / DOME_LIVE_LSB_SCALE,
                { absRaw, diffRaw, hasDifferential: false }
              );
            }
          }

          await new Promise(r => setTimeout(r, currentDriverType === 'scpi' ? 10 : 25));
        } catch (loopErr) {
          console.warn('[DEMO LOOP WARNING]', loopErr);
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } catch (err) {
      appendLog(`[DEMO ERROR]: ${err.message}\n`, 'log-badprompt');
      isDemoRunning = false;
      returnToSimulation();
      btnStartDemo.disabled = false;
      btnStopDemo.disabled = true;
    }
  }
}

// Connection Modal Event Handlers
selDriverType?.addEventListener('change', (e) => {
  if (wrapConnType) {
    wrapConnType.style.display = e.target.value === 'scpi' ? 'block' : 'none';
  }
});

btnConnect?.addEventListener('click', () => {
  if (isConnected) disconnectSerial();
  else connectModal?.classList.remove('hidden');
});

btnCloseModal?.addEventListener('click', () => connectModal?.classList.add('hidden'));

btnModalConnect?.addEventListener('click', async () => {
  connectModal?.classList.add('hidden');
  await connectSerial();
});

// Start means "read the sensor". Without a board there is nothing to read
// (the simulation runs on its own), so ask for the connection instead.
btnStartDemo?.addEventListener('click', () => {
  if (!isConnected || !activeDevice) {
    appendLog('[SYSTEM] Connect a board to stream live measurements.\n', 'log-badprompt');
    connectModal?.classList.remove('hidden');
    return;
  }
  runJoystickDemo();
});
btnStopDemo?.addEventListener('click', async () => {
  isDemoRunning = false;
  if (coilEnergised) {
    await handleHardwareCoilCommand({ action: 'off' });
  }
  // Back to the attract pattern until the next Start, connected or not.
  returnToSimulation();
  btnStartDemo.disabled = false;
  btnStopDemo.disabled = true;
  appendLog('[SYSTEM] Demo stopped.\n', 'log-badprompt');
});

btnToggleDebug?.addEventListener('click', () => {
  miniLogWindow?.classList.toggle('hidden');
});

// Append this function to app.js
export async function apply1PxGainBoost(targetGain = 37, persist = false) {
  if (!activeDevice || currentDriverType !== 'scpi') {
    appendLog('[GAIN ERROR] Active device must be connected in SCPI mode.\n', 'log-badprompt');
    return false;
  }
  try {
    const expectedGain = targetGain === 37 ? '~219' : '~72';
    appendLog(`[BAA GAIN] Writing GAINSEL_1PX = ${targetGain} (target gain ${expectedGain})...\n`, 'log-okprompt');
    const success = await activeDevice.setGain1Px(targetGain, persist);
    if (success) {
      appendLog(`[BAA GAIN] Successfully applied gain setting ${targetGain}!\n`, 'log-okprompt');
    } else {
      appendLog(`[BAA GAIN] Gain command sent with verification warning.\n`, 'log-badprompt');
    }
    return success;
  } catch (err) {
    appendLog(`[BAA GAIN ERROR] ${err.message}\n`, 'log-badprompt');
    return false;
  }
}

// Global hook for developer console or button triggers
window.apply1PxGainBoost = apply1PxGainBoost;

// --- 1. CALIBRATION PANEL & LIVE TUNING ---
const btnCalibToggle = document.getElementById('btn-calib-toggle');
const panelCalibration = document.getElementById('panel-calibration');
const btnCalibReset = document.getElementById('btn-calib-reset');

const calInputs = {
  k1: document.getElementById('cal-k1'),
  o11: document.getElementById('cal-o11'),
  o12: document.getElementById('cal-o12'),
  k2: document.getElementById('cal-k2'),
  o21: document.getElementById('cal-o21'),
  o22: document.getElementById('cal-o22')
};

const angleFormula = document.getElementById('sel-angle-formula');
angleFormula?.addEventListener('change', () => {
  setDifferentialFormula(angleFormula.value);
});

// Toggle drawer visibility
btnCalibToggle?.addEventListener('click', () => {
  panelCalibration?.classList.toggle('hidden');
  btnCalibToggle.classList.toggle('active');
});

// Sync input changes directly to sfi_demo live calculation
Object.entries(calInputs).forEach(([key, inputEl]) => {
  inputEl?.addEventListener('input', () => {
    const val = parseFloat(inputEl.value);
    if (!isNaN(val)) {
      setCalibrationParams({ [key]: val });
    }
  });
  // Initialise the live engine from the fields on load, so the numbers on
  // screen and the numbers in the formula can never disagree at startup.
  if (inputEl) {
    const val = parseFloat(inputEl.value);
    if (!isNaN(val)) setCalibrationParams({ [key]: val });
  }
});

// --- 1b. 2px DISPLAY SCALE (pixel pitch) ---
// The differential channels are raw counts; turning them into mT/mm needs the
// on-die pixel pitch (derivation and caveat in angle_calib.js). The datasheet we
// have does not publish it, so it is live-trimmable here, default 1.0 mm.
const calPitchInput = document.getElementById('cal-pitch');
if (calPitchInput) {
  calPitchInput.value = String(getSensorPixelPitchMm());
  calPitchInput.addEventListener('input', () => {
    setSensorPixelPitchMm(calPitchInput.value);
  });
}

// Reset calibration inputs to the documented engine defaults (K=1.0)
btnCalibReset?.addEventListener('click', () => {
  const defs = resetCalibrationParams();
  Object.entries(defs).forEach(([k, val]) => {
    if (calInputs[k]) calInputs[k].value = val;
  });
  setSensorPixelPitchMm(DEFAULT_SENSOR_PIXEL_PITCH_MM);
  if (calPitchInput) calPitchInput.value = String(DEFAULT_SENSOR_PIXEL_PITCH_MM);
  appendLog('[CALIBRATION] Reset parameters to default (K=1.0, Ortho=0.0, pitch=1.0 mm).\n', 'log-okprompt');
});

// --- 2. GAINSEL PRESET (1x / 3x), INDEPENDENT PER PIXEL ---
// Two factory presets plus a free 0-63 trim field for the AE's final-test
// value. PX1 and PX2 each have their own control and are written separately:
// GAINSEL_1PX lives in reg 0x00 bits [5:0], GAINSEL_2PX in bits [11:6], so a
// trim on one path must never overwrite the other.
const VOX_GAIN_COUNTS = { 9: '~72', 37: '~219' };
const VOX_GAIN_MODES = ['1px', '2px'];
// Defaults follow the AE's guidance for the two paths: 3x on the 1px legacy
// channel, factory 1x on the differential (2px) pair. Each is independently
// trimmable afterwards.
const VOX_GAIN_DEFAULTS = { '1px': 37, '2px': 9 };
let voxGains = { ...VOX_GAIN_DEFAULTS };

// The part rejects register writes while the stream has a measurement in
// flight (it latches BUS_ERROR and the write is lost), so the gain controls are
// locked from Start until the loop has actually exited - not merely until Stop
// is pressed. Start Live Stream writes both fields anyway. The depth count
// keeps an overlapping old loop from unlocking early.
let gainLockDepth = 0;
function lockGainControls(delta) {
  gainLockDepth = Math.max(0, gainLockDepth + delta);
  const locked = gainLockDepth > 0;
  document.querySelectorAll(
    '#vox-gain-seg-1px button[data-gain], #vox-gain-seg-2px button[data-gain], #vox-gain-custom-1px, #vox-gain-custom-2px'
  ).forEach((el) => {
    el.disabled = locked;
    el.title = locked ? 'Stop the stream to change the gain' : '';
  });
}

const voxGainUI = {
  '1px': {
    seg: document.getElementById('vox-gain-seg-1px'),
    hint: document.getElementById('vox-gain-hint-1px'),
    readback: document.getElementById('vox-gain-readback-1px'),
    custom: document.getElementById('vox-gain-custom-1px')
  },
  '2px': {
    seg: document.getElementById('vox-gain-seg-2px'),
    hint: document.getElementById('vox-gain-hint-2px'),
    readback: document.getElementById('vox-gain-readback-2px'),
    custom: document.getElementById('vox-gain-custom-2px')
  }
};

function gainBits(g) {
  return `0b${g.toString(2).padStart(6, '0')}`;
}

function syncVoxGainControl(mode) {
  const ui = voxGainUI[mode];
  if (!ui) return;
  const g = voxGains[mode];
  if (ui.seg) {
    ui.seg.querySelectorAll('button[data-gain]').forEach((btn) => {
      const on = parseInt(btn.dataset.gain, 10) === g;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.className = on
        ? 'ds-button ds-button--primary ds-button--sm'
        : 'ds-button ds-button--secondary ds-button--sm';
    });
  }
  if (ui.hint) {
    const counts = VOX_GAIN_COUNTS[g] ? ` → ${VOX_GAIN_COUNTS[g]}` : '';
    ui.hint.textContent = `${mode} gain = ${g} (${gainBits(g)})${counts}`;
  }
  if (ui.custom) ui.custom.value = g;
}

function syncAllVoxGainControls() {
  VOX_GAIN_MODES.forEach(syncVoxGainControl);
}

function setVoxGainReadback(mode, value) {
  const el = voxGainUI[mode]?.readback;
  if (!el) return;
  if (typeof value === 'number' && !isNaN(value)) {
    el.textContent = `Device confirmed: ${value} (${gainBits(value)})`;
    el.style.color = '#59FFB0';
  } else {
    el.textContent = 'Device: not read';
    el.style.color = 'var(--color-ink-muted)';
  }
}

async function setVoxGain(mode, gainVal, persist = false) {
  const targetMode = mode === '2px' ? '2px' : '1px';
  const requested = parseInt(gainVal, 10);
  // Accept any 0-63 code as well as the two presets: the AE's final-test trim
  // can sit between the factory 1x (9) and 3x (37) codes.
  const g = Number.isFinite(requested)
    ? Math.min(63, Math.max(0, requested))
    : voxGains[targetMode];
  voxGains[targetMode] = g;
  syncVoxGainControl(targetMode);

  if (!isConnected || currentDriverType !== 'scpi') {
    setVoxGainReadback(targetMode, null);
    return false;
  }

  try {
    appendLog(`[GAIN] Writing GAINSEL_${targetMode.toUpperCase()} = ${g} (${gainBits(g)})...\n`, 'log-okprompt');
    const res = await activeDevice.setGain(targetMode, g, persist);
    if (res.ok) {
      const rb = await activeDevice.readGain(targetMode);
      const v = rb && !rb.error ? rb.value : null;
      setVoxGainReadback(targetMode, v);
      const good = v === g;
      appendLog(
        good
          ? `[GAIN] Verified ${targetMode}=${v} on device.\n`
          : `[GAIN] Wrote ${targetMode}=${g} but readback returned ${v === null ? 'nothing' : v}.\n`,
        good ? 'log-okprompt' : 'log-badprompt'
      );
      return good;
    }
    setVoxGainReadback(targetMode, null);
    appendLog(`[GAIN] Write/verify failed for ${targetMode}=${g}.\n`, 'log-badprompt');
    return false;
  } catch (err) {
    appendLog(`[GAIN ERROR] ${err.message}\n`, 'log-badprompt');
    setVoxGainReadback(targetMode, null);
    return false;
  }
}

// Console hooks: setVoxGain('1px', 12), or the two pixel-specific shortcuts.
window.setVoxGain = setVoxGain;
window.setVoxGain1Px = (g, persist) => setVoxGain('1px', g, persist);
window.setVoxGain2Px = (g, persist) => setVoxGain('2px', g, persist);

VOX_GAIN_MODES.forEach((mode) => {
  const ui = voxGainUI[mode];
  ui.seg?.querySelectorAll('button[data-gain]').forEach((btn) => {
    btn.addEventListener('click', () => setVoxGain(mode, parseInt(btn.dataset.gain, 10)));
  });
  ui.custom?.addEventListener('change', () => {
    const v = parseInt(ui.custom.value, 10);
    if (Number.isFinite(v)) setVoxGain(mode, v);
  });
});

syncAllVoxGainControls();

// --- 3. SENSOR DIAGNOSTICS (thumbstick-style frame health + raw LSB) ---
// Mirrors the MLX90396 thumbstick diagnostics: status byte decode, per-transfer
// CRC line, raw 12-bit pixels, the four 2px gradient channels and the loop period.
const DIAG_STATUS_FN = { 3: 'Single', 2: 'Burst', 1: 'WOC', 0: 'Exit / Memory' };

function decodeStatus(s) {
  if (typeof s !== 'number') return null;
  const fn = (s >> 6) & 0x03;
  return {
    hex: '0x' + s.toString(16).toUpperCase().padStart(2, '0'),
    fn: DIAG_STATUS_FN[fn] ?? 'Unknown',
    fnBits: fn.toString(2).padStart(2, '0'),
    counter: (s >> 3) & 0x07,
    error: ((s >> 2) & 1) === 1,
    warn: ((s >> 1) & 1) === 1,
    drdy: (s & 1) === 1
  };
}

function diagText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function diagState(id, text, tone) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('diagnostics-state--warn', tone === 'warn');
  el.classList.toggle('diagnostics-state--bad', tone === 'bad');
}

// Latest WARN/ERROR event read back from the part. Reading the register clears
// the flag, so this is what keeps the cause visible in Diagnostics afterwards.
let lastFlagEvent = null;

function describeFlags(flags) {
  return [...flags.error, ...flags.warn]
    .map(n => (FLAG_TEXT[n] ? `${n} (${FLAG_TEXT[n]})` : n))
    .join(', ');
}

function noteFlagEvent(flags) {
  const names = [...flags.error, ...flags.warn].join(', ');
  if (!names) return;
  // A persistent cause (e.g. OVF on every frame) is logged once, not per frame.
  if (names !== lastFlagEvent?.names) {
    appendLog(`[FLAGS] ${describeFlags(flags)}\n`, flags.error.length ? 'log-badprompt' : 'log-okprompt');
  }
  lastFlagEvent = { names, at: new Date() };
}

function updateDiagnosticsFrame(res01, res23, resDiff, periodMs, flags = null) {
  const tab = document.getElementById('tab-diagnostics');
  if (tab && !tab.classList.contains('active')) return;

  diagText('diag-source', 'Live hardware (SCPI)');

  const st = decodeStatus(res01?.status);
  if (st) {
    // The loop reads 0x41/0x42 whenever any reply carried ERROR or WARN, so the
    // cause can be named here; the read also clears the latch for the next frame.
    const isError = st.error || !!flags?.error.length;
    const isWarn = st.warn || !!flags?.warn.length;
    const cause = flags ? describeFlags(flags) : '';
    const last = lastFlagEvent ? `  · last: ${lastFlagEvent.names} at ${lastFlagEvent.at.toLocaleTimeString()}` : '';
    diagText('diag-status', `${st.hex}  (${st.fnBits})`);
    diagText('diag-fn', `${st.fn} · counter ${st.counter}`);
    diagText('diag-drdy', st.drdy ? 'Ready' : 'Not ready');
    diagText('diag-flags', `ERROR=${isError ? 1 : 0}  WARN=${isWarn ? 1 : 0}${last}`);
    diagState('diag-health',
      isError ? `ERROR: ${cause || 'the part rejected a command'}` :
      !st.drdy ? 'DRDY clear - measurement not ready yet' :
      isWarn ? `WARN: ${cause || 'see register 0x42'}` : 'Status clean',
      isError ? 'bad' : (!st.drdy || isWarn) ? 'warn' : null);
  } else {
    diagText('diag-status', '--');
    diagText('diag-fn', '--');
    diagText('diag-drdy', '--');
    diagText('diag-flags', '--');
    diagState('diag-health', 'No measurement received', 'bad');
  }

  const transfers = { '01': res01, '23': res23, '2px': resDiff };
  diagText('diag-crc', ['01', '23', '2px'].map(k => {
    const r = transfers[k];
    if (!r) return `${k}:--`;
    return `${k}:${r.error ? 'FAIL' : 'ok'}`;
  }).join('   '));

  if (typeof periodMs === 'number') {
    diagText('diag-period', `${periodMs.toFixed(0)} ms`);
  } else {
    diagText('diag-period', '--');
  }

  const pixelRows = [
    ['diag-x0', res01?.x0], ['diag-y0', res01?.y0], ['diag-z0', res01?.z0],
    ['diag-x1', res01?.x1], ['diag-y1', res01?.y1], ['diag-z1', res01?.z1],
    ['diag-x2', res23?.x2], ['diag-y2', res23?.y2], ['diag-z2', res23?.z2],
    ['diag-x3', res23?.x3], ['diag-y3', res23?.y3], ['diag-z3', res23?.z3]
  ];
  pixelRows.forEach(([id, v]) => diagText(id, typeof v === 'number' ? String(v) : '--'));

  const finite = pixelRows.every(([, v]) => typeof v === 'number' && !isNaN(v));
  if (finite) {
    const vals = pixelRows.map(([, v]) => v);
    diagText('diag-avg-x', ((vals[0] + vals[3] + vals[6] + vals[9]) / 4).toFixed(2));
    diagText('diag-avg-y', ((vals[1] + vals[4] + vals[7] + vals[10]) / 4).toFixed(2));
    diagText('diag-avg-z', ((vals[2] + vals[5] + vals[8] + vals[11]) / 4).toFixed(2));
    diagText('diag-peak', String(Math.max(...vals.map(Math.abs))));
    diagState('diag-range',
      Math.max(...vals.map(Math.abs)) >= 2040 ? 'ADC near full scale (2048)' : 'Within ADC range',
      Math.max(...vals.map(Math.abs)) >= 2040 ? 'warn' : null);
  } else {
    diagText('diag-avg-x', '--');
    diagText('diag-avg-y', '--');
    diagText('diag-avg-z', '--');
    diagText('diag-peak', '--');
    diagState('diag-range', 'No measurement received', 'warn');
  }

  const gradRows = [
    ['diag-dx02', resDiff?.x02], ['diag-dz02', resDiff?.z02],
    ['diag-dy13', resDiff?.y13], ['diag-dz13', resDiff?.z13]
  ];
  gradRows.forEach(([id, v]) => diagText(id, typeof v === 'number' ? String(v) : '--'));
}
