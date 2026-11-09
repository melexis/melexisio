import { MLX90396_API, FLAG_TEXT } from './mlx_api.js';
import { Arduino_API } from './arduino_api.js';
import { resizeSfiCanvases } from './sfi_demo.js';
import {
  computeTwistSignals,
  deriveTwistInputsFromPoints,
  applyTwistCalibration,
  TWIST_CAL,
  getGainSel,
  setGainSel,
} from './twist_api.js';
import {
  setSensorPixelPitchMm,
  getSensorPixelPitchMm,
  SINGLE_PIXEL_LSB_PER_MT
} from '../angle_calib.js';

// --- DOM Elements (Declared first to avoid TDZ ReferenceErrors) ---
const btnConnect = document.getElementById('btn-connect');

const btnStartDemo = document.getElementById('btn-start-demo');
const btnStopDemo = document.getElementById('btn-stop-demo');
const demoStatus = document.getElementById('demo-status');

function setDemoStatus(text, isActive) {
  if (!demoStatus) return;
  demoStatus.textContent = text;
  demoStatus.classList.toggle('active', !!isActive);
}

// Modal Elements
const selDriverType = document.getElementById('sel-driver-type');
const wrapConnType = document.getElementById('wrap-conn-type');
const selConnType = document.getElementById('sel-conn-type');
const selBaudRate = document.getElementById('sel-baud-rate');
const connectModal = document.getElementById('connect-modal');
const btnModalConnect = document.getElementById('btn-modal-connect');
const btnCloseModal = document.getElementById('btn-close-modal');
const portGuideEl = document.getElementById('port-guide');
const connectErrorEl = document.getElementById('connect-error');

async function refreshPortGuide() {
  if (!portGuideEl || !navigator.serial || !navigator.serial.getPorts) return;
  try {
    const ports = await navigator.serial.getPorts();
    if (!ports.length) {
      portGuideEl.textContent = 'None yet \u2014 pick your device in the Open Serial Port dialog below.';
      return;
    }
    portGuideEl.innerHTML = '';
    ports.forEach((p) => {
      const info = typeof p.getInfo === 'function' ? p.getInfo() : {};
      const vid = info.usbVendorId;
      const pid = info.usbProductId;
      const row = document.createElement('div');
      row.textContent = `Serial Port  \u00b7  VID ${vid != null ? '0x' + vid.toString(16).toUpperCase().padStart(4, '0') : 'n/a'}  \u00b7  PID ${pid != null ? '0x' + pid.toString(16).toUpperCase().padStart(4, '0') : 'n/a'}`;
      portGuideEl.appendChild(row);
    });
  } catch (err) {
    portGuideEl.textContent = 'Unable to read authorized ports.';
  }
}

function showConnectError(msg) {
  if (connectErrorEl) {
    connectErrorEl.textContent = msg || 'Unknown error.';
    connectErrorEl.classList.remove('hidden');
  }
}

function clearConnectError() {
  if (connectErrorEl) {
    connectErrorEl.classList.add('hidden');
    connectErrorEl.textContent = '';
  }
}

function hintForSerialError(raw) {
  const s = String(raw);
  if (s.includes('Failed to open serial port')) {
    return 'Failed to open serial port. The port is almost certainly held open by another program \u2014 close the Arduino IDE Serial Monitor / vendor tools / other browser tabs, unplug & replug the device, then retry.';
  }
  if (s.includes('device not found') || s.includes('No such device')) {
    return 'Device not found. Unplug & replug it, verify its driver is installed, and retry.';
  }
  return raw;
}

// 2D Magnet & UI Elements
const magnetDisk = document.getElementById('magnet-disk');
const btnZeroMagnet = document.getElementById('btn-zero-magnet');
const selXyTwistMode = document.getElementById('sel-xy-twist-mode');
const joystickBase = document.getElementById('joystick-base');
const joystickStick = document.getElementById('joystick-stick');

// --- State Variables ---
let port = null, reader = null, writer = null;
let isConnected = false, isReading = false, isDemoRunning = false;
let textDecoder, textEncoder;
let readableStreamClosed, writableStreamClosed;

let activeDevice = null;
let currentDriverType = 'scpi';

let scpiLock = Promise.resolve();
let scpiWaiter = null;

// Serial RX chatter (every line / prompt) costs real time in the hot sampling
// loop, so it stays off unless you are debugging the wire protocol. Error and
// warning paths still log unconditionally.
const DEBUG_SERIAL_RX = false;

const magnetOffsets = { x: 0, y: 0 };
const latestRawMagnet = { x: 0, y: 0 };

// The twist panel is authored inside view-magnet in the markup, but per PDF
// slide 4 the twist demo is calibrated with Zero Position alone: the live
// alpha/beta readout (and its k/o window) belongs to the no-twist Thumbstick
// tab. Reparent it into #view-joystick so it can only ever be visible there.
const twistPanelEl = document.getElementById('twist-panel');
const viewJoystickEl = document.getElementById('view-joystick');
if (twistPanelEl && viewJoystickEl) viewJoystickEl.appendChild(twistPanelEl);

const leds = [];
const TOTAL_LEDS = 28;
const ANGLE_STEP = 360 / TOTAL_LEDS;
let lastLedKey = null;

function isViewActive(id) {
  const el = document.getElementById(id);
  return !!el && el.classList.contains('active');
}

// The 0x000FC differential transfer (x02/y02/z02/x13/y13/z13) is only consumed
// by the diagnostics tab and by the twist panel's 2px readouts. Skip it when
// neither needs it: it is a real SPI round-trip the other views would discard.
function needsDiffChannels() {
  if (isViewActive('view-diagnostics')) return true;
  const panel = document.getElementById('twist-panel');
  return twistMode === '2px'
    && isViewActive('view-joystick')
    && !!panel
    && !panel.classList.contains('hidden');
}

// --- Initialize on Startup ---
window.addEventListener('DOMContentLoaded', () => {
  initJoystickLEDs();
  initMagnetMotionMode();
  initSerialPortEvents();
  startRadarLoop();
  initGridReordering();
  initTwistControls();
  refreshPortGuide();
  initFitLayout();
  initMenuToggle();
});

// "Hide menus" in the tab bar: hides the title, connection and Start/Stop
// rows so the active view gets the whole screen. The resize event refits the
// grid, stick and radar to the new height.
function initMenuToggle() {
  const btn = document.getElementById('btn-toggle-menus');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const hidden = document.body.classList.toggle('menus-hidden');
    btn.textContent = hidden ? 'Show menus' : 'Hide menus';
    btn.setAttribute('aria-pressed', String(hidden));
    window.dispatchEvent(new Event('resize'));
  });
}

// --- Drag & Drop Reordering logic ---
function initGridReordering() {
  const makeReorderable = (containerId, selector) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let dragged = null;

    container.addEventListener('dragstart', (e) => {
      // Prevent drag from triggering when adjusting inputs or sliders
      if (['INPUT', 'BUTTON', 'LABEL', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        return;
      }

      const card = e.target.closest(selector);
      if (!card) return;

      dragged = card;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('is-dragging'), 0);
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const target = e.target.closest(selector);
      if (!target || target === dragged || target.parentNode !== container) return;

      const items = Array.from(container.children);
      const draggedIndex = items.indexOf(dragged);
      const targetIndex = items.indexOf(target);

      if (draggedIndex < targetIndex) {
        container.insertBefore(dragged, target.nextSibling);
      } else {
        container.insertBefore(dragged, target);
      }

      if (typeof resizeSfiCanvases === 'function') {
        resizeSfiCanvases();
      }
    });

    container.addEventListener('dragend', () => {
      if (dragged) {
        dragged.classList.remove('is-dragging');
        dragged = null;
      }
      if (typeof resizeSfiCanvases === 'function') {
        resizeSfiCanvases();
      }
    });
  };

  makeReorderable('pixels-grid', '.pixel-card');
  makeReorderable('sfi-dashboard-grid', '.draggable-card');
}

// --- Helper: SPI Bus Prefix ---
function getSpiPrefix() {
  return selConnType ? selConnType.value : ':SPI';
}

// --- Top-Level Demo Navigation (SFI vs JWT) ---
document.querySelectorAll('.demo-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.demo-tab-btn').forEach(b => b.classList.remove('active', 'ds-tabs__tab--active'));
    document.querySelectorAll('.demo-view').forEach(v => v.classList.remove('active'));

    btn.classList.add('active', 'ds-tabs__tab--active');
    const target = document.getElementById(btn.dataset.target);
    if (target) target.classList.add('active');

    if (btn.dataset.target === 'demo-sfi') {
      setTimeout(resizeSfiCanvases, 50);
    } else if (btn.dataset.target === 'demo-jwt' && window.Plotly && document.getElementById('view-3dplot')?.classList.contains('active')) {
      Plotly.Plots.resize('plot-3d-container');
    }
  });
});

// --- Sub-Tab Routing (JWT View) ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active', 'ds-tabs__tab--active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    btn.classList.add('active', 'ds-tabs__tab--active');
    const targetView = document.getElementById(btn.dataset.target);
    if (targetView) targetView.classList.add('active');

    if (btn.dataset.target === 'view-3dplot' && window.Plotly) {
      Plotly.Plots.resize('plot-3d-container');
    }

    // The Desmos calibration window & formula apply to the no-twist (XY) demo
    // only; the twist demo keeps just the live alpha/beta readouts + Zero
    // Position. Gate the shared panel's formula card to the active view.
    updateTwistPanelGating();
  });
});

// --- 2D Magnet Position & UI ---
const magnetSensorEl = document.querySelector('.magnet-sensor');
function gridHalfPx() {
  const w = magnetSensorEl ? magnetSensorEl.clientWidth : 340;
  return w / 2;
}
const magnetState = { emaX: 0, emaY: 0, emaAngle: 0, inited: false };
let lastMagnetScaleKey = '';

// Reviewer slide 4: beside "twist only", the twist demo also needs an "XY only"
// option. One selector covers all three so the old self-contradictory
// "Lock XY (twist only)" checkbox (locking XY is what *makes* it twist-only)
// can go away:
//   both   -> position and twist both track the magnet
//   xy     -> position tracks, twist angle is held at its last value
//   twist  -> twist tracks, position is pinned at the grid centre
let magnetMotionMode = 'both';

function initMagnetMotionMode() {
  if (!selXyTwistMode) return;
  magnetMotionMode = selXyTwistMode.value || 'both';
  selXyTwistMode.addEventListener('change', () => {
    magnetMotionMode = selXyTwistMode.value || 'both';
    updateTwistPanelGating();
  });
  updateTwistPanelGating();
}

function resetMagnetTracking() {
  magnetState.inited = false;
  updateMagnetScaleLabels(2.5);
}

function updateMagnetScaleLabels(mmRange) {
  const half = Math.round(gridHalfPx());
  // The range is constant and the width only changes on resize, so skip the
  // querySelectorAll + innerHTML rewrite when nothing actually changed.
  const key = half + '|' + mmRange;
  if (key === lastMagnetScaleKey) return;
  lastMagnetScaleKey = key;
  const travelLbl = document.getElementById('magnet-travel-lbl');
  if (travelLbl) {
    travelLbl.innerHTML = `Sensing Grid: &plusmn;${mmRange.toFixed(1)} mm (&plusmn;${half} px). N = dark charcoal, S = gold; the disk rotates with the twist angle.`;
  }
  const factor = mmRange / 2.5;
  document.querySelectorAll('.grid-tick').forEach(el => {
    const base = parseFloat(el.dataset.mm || '0');
    const v = base * factor;
    const sign = base > 0 ? '+' : '';
    const str = v === Math.round(v) ? v.toFixed(0) : v.toFixed(1);
    el.textContent = sign + str;
  });
}

btnZeroMagnet?.addEventListener('click', () => {
  magnetOffsets.x = latestRawMagnet.x;
  magnetOffsets.y = latestRawMagnet.y;
  resetMagnetTracking();
  appendLog(`[MAGNET] Zero Captured: Offset X=${magnetOffsets.x.toFixed(2)} mm, Y=${magnetOffsets.y.toFixed(2)} mm\n`, 'log-okprompt');
});

document.querySelectorAll('[data-twist-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = document.getElementById('twist-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      document.querySelectorAll('[data-twist-toggle]').forEach(b => b.classList.toggle('active', !panel.classList.contains('hidden')));
      updateTwistUI(latestTwistPoints);
    }
  });
});

function updateMagnetUI(posX_mm, posY_mm, angleDeg) {
  if (!magnetDisk || !isViewActive('view-magnet')) return;
  const safeX = typeof posX_mm === 'number' && !isNaN(posX_mm) ? posX_mm : 0;
  const safeY = typeof posY_mm === 'number' && !isNaN(posY_mm) ? posY_mm : 0;
  let safeAngle = typeof angleDeg === 'number' && !isNaN(angleDeg) ? angleDeg : 0;

  const ALPHA = 0.4;
  const posFrozen = magnetMotionMode === 'twist';
  const angleFrozen = magnetMotionMode === 'xy';

  if (!magnetState.inited) {
    magnetState.emaX = safeX;
    magnetState.emaY = safeY;
    magnetState.emaAngle = safeAngle;
    magnetState.inited = true;
  } else {
    if (!posFrozen) {
      magnetState.emaX += (safeX - magnetState.emaX) * ALPHA;
      magnetState.emaY += (safeY - magnetState.emaY) * ALPHA;
    }
    if (!angleFrozen) {
      const dA = ((safeAngle - magnetState.emaAngle + 540) % 360) - 180;
      magnetState.emaAngle = ((magnetState.emaAngle + dA * ALPHA) % 360 + 360) % 360;
    }
  }

  // Static grid: fixed +/-2.5 mm span. The scale never re-ranges, so a pure
  // rotation can't rescale the map and make the disk jump. Position motion is
  // EMA-smoothed and clamped at the grid edges; angle spins around the axis.
  // "Twist only" freezes position (angle-only spin) for twist demos.
  const locked = posFrozen;
  const mmRange = 2.5;
  const half = gridHalfPx();
  const pxPerMm = half / mmRange;

  const transX = locked ? 0 : Math.max(-half, Math.min(half, magnetState.emaX * pxPerMm));
  const transY = locked ? 0 : Math.max(-half, Math.min(half, -magnetState.emaY * pxPerMm));

  // Sign inverted so a right/CW physical rotation renders as clockwise on
  // screen (CSS rotate counts + as CW, but the raw angle from the device
  // increases for the opposite direction).
  magnetDisk.style.transform = `translate3d(${transX}px, ${transY}px, 0px) rotate(${-magnetState.emaAngle}deg)`;

  updateMagnetScaleLabels(2.5);
}

// --- Twist Signal & Calibration UI ---
let twistMode = '1px';

function initTwistControls() {
  const modeSel = document.getElementById('sel-twist-mode');
  const gainSeg = document.getElementById('twist-gain-seg');
  const unitLbl = document.getElementById('twist-unit-lbl');
  const calKeys = ['k1', 'k2', 'o11', 'o12', 'o21', 'o22'];

  modeSel?.addEventListener('change', async () => {
    twistMode = modeSel.value;
    if (unitLbl) unitLbl.textContent = `Units: ${twistMode === '2px' ? 'mT/mm' : 'mT'}`;
    // The switch does NOT push the table gain to the chip; it only re-syncs
    // the display. readSensorGain then adopts whatever the part actually holds
    // (no-op without an SCPI device attached).
    syncTwistGainSeg();
    // While the demo runs, the readback comes from what Start confirmed rather
    // than a register read squeezed between the loop's measurements.
    if (gainLockDepth > 0) setTwistGainReadback(confirmedGain[twistMode]);
    else await readSensorGain();
    updateTwistUI(latestTwistPoints);
  });

  // Two factory presets plus a free trim field; either writes the active
  // mode's gain field on the chip.
  gainSeg?.querySelectorAll('button[data-gain]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = parseInt(btn.dataset.gain, 10);
      if (TWIST_GAIN_PRESETS.includes(v)) setSensorGain(v);
    });
  });

  const gainCustom = document.getElementById('twist-gain-custom');
  gainCustom?.addEventListener('change', () => {
    const v = parseInt(gainCustom.value, 10);
    if (Number.isFinite(v)) setSensorGain(v);
  });

  calKeys.forEach(key => {
    const el = document.getElementById(`cal-${key}`);
    el?.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!isNaN(v)) TWIST_CAL[key] = v;
    });
    // Initialise the live math from the fields on load. TWIST_CAL otherwise
    // keeps the module defaults until the first keystroke, so the numbers on
    // screen and the numbers in the formula could disagree at startup.
    if (el) {
      const v = parseFloat(el.value);
      if (!isNaN(v)) TWIST_CAL[key] = v;
    }
  });

  // 2px display scale: the differential channels are raw counts, so the mT/mm
  // strength needs the on-die pixel pitch (derivation in angle_calib.js, shared
  // with the SFI page). Datasheet value unconfirmed, so it is trimmable.
  const calPitch = document.getElementById('cal-pitch');
  if (calPitch) {
    calPitch.value = String(getSensorPixelPitchMm());
    calPitch.addEventListener('input', () => setSensorPixelPitchMm(calPitch.value));
  }

  syncTwistGainSeg();
}

// Two factory presets (1x = gain 9 -> ~72 counts, 3x = gain 37 -> ~219 counts)
// plus a free 0-63 trim field for the AE's final-test value.
const TWIST_GAIN_PRESETS = [9, 37];
const TWIST_GAIN_COUNTS = { 9: '~72', 37: '~219' };
// The per-mode defaults (3x for 1px, 1x for 2px) live in the GAINSEL table in
// twist_api.js; Start writes both fields from that table every time.

// What the chip last confirmed for each field, so the readback line can follow
// a mode switch while the demo runs without reading the part mid-loop.
const confirmedGain = { '1px': null, '2px': null };

// The part rejects register writes while the demo loop has a measurement in
// flight (it latches BUS_ERROR and the write is lost), so the gain controls are
// locked from Start until the loop has actually exited - not merely until Stop
// is pressed. The depth count keeps an overlapping old loop from unlocking early.
let gainLockDepth = 0;
function lockGainControls(delta) {
  gainLockDepth = Math.max(0, gainLockDepth + delta);
  const locked = gainLockDepth > 0;
  document.querySelectorAll('#twist-gain-seg button[data-gain], #twist-gain-custom').forEach((el) => {
    el.disabled = locked;
    el.title = locked ? 'Stop the demo to change the gain' : '';
  });
}

function syncTwistGainSeg() {
  const g = getGainSel(twistMode);
  const seg = document.getElementById('twist-gain-seg');
  if (seg) {
    seg.querySelectorAll('button[data-gain]').forEach((btn) => {
      const on = parseInt(btn.dataset.gain, 10) === g;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.className = on
        ? 'ds-button ds-button--primary ds-button--sm'
        : 'ds-button ds-button--secondary ds-button--sm';
    });
  }
  const hint = document.getElementById('twist-gain-hint');
  if (hint) {
    const counts = TWIST_GAIN_COUNTS[g] ? ` → ${TWIST_GAIN_COUNTS[g]}` : '';
    hint.textContent = `${twistMode} gain = ${g} (0b${g.toString(2).padStart(6, '0')})${counts}`;
  }
  const custom = document.getElementById('twist-gain-custom');
  if (custom) custom.value = g;
}

function setTwistGainReadback(value) {
  const el = document.getElementById('twist-gain-readback');
  if (!el) return;
  if (typeof value === 'number' && !isNaN(value)) {
    el.textContent = `Device confirmed: ${value} (0b${value.toString(2).padStart(6, '0')})`;
    el.style.color = '#59FFB0';
  } else {
    el.textContent = 'Device: not read';
    el.style.color = 'var(--color-ink-muted)';
  }
}

// --- GAINSEL hardware write/read (SCPI only) ---
// setSensorGain writes one mode's gain field (reg 0x00 bits [5:0] for 1px,
// [11:6] for 2px; the current twistMode unless told otherwise) through
// MLX90396_API.setGain, which performs the unlock sequence and a readback
// verify. Without a connected SCPI device the local table still updates and
// the readback reads "not read".
async function setSensorGain(gainVal, mode = twistMode) {
  const requested = parseInt(gainVal, 10);
  // Accept any 0-63 code as well as the two presets: the AE's final-test trim
  // can sit between the factory 1x (9) and 3x (37) codes.
  const g = Number.isFinite(requested)
    ? Math.min(63, Math.max(0, requested))
    : getGainSel(mode);
  setGainSel(mode, g);
  syncTwistGainSeg();

  const confirm = (v) => {
    confirmedGain[mode] = v;
    if (mode === twistMode) setTwistGainReadback(v);
  };

  if (!activeDevice || currentDriverType !== 'scpi') {
    confirm(null);
    return false;
  }

  try {
    appendLog(`[GAIN] Writing GAINSEL_${mode.toUpperCase()} = ${g} (0b${g.toString(2).padStart(6, '0')})...\n`, 'log-okprompt');
    const res = await activeDevice.setGain(mode, g, false);
    if (res.ok) {
      setGainSel(mode, res.value);
      syncTwistGainSeg();
      confirm(res.value);
      appendLog(`[GAIN] Verified ${mode}=${res.value} on device.\n`, 'log-okprompt');
    } else {
      confirm(null);
      appendLog(`[GAIN] Write/verify failed for ${mode}=${g}.\n`, 'log-badprompt');
    }
    return res.ok;
  } catch (err) {
    appendLog(`[GAIN ERROR] ${err.message}\n`, 'log-badprompt');
    confirm(null);
    return false;
  }
}

// readSensorGain reports the chip's active gain field for the current twistMode
// in the "Device confirmed" line. It does NOT overwrite the local selection:
// the selected value is what Start writes, so the UI always shows what will be
// applied rather than what the part happens to hold.
async function readSensorGain() {
  if (!activeDevice || currentDriverType !== 'scpi') {
    setTwistGainReadback(null);
    return null;
  }
  const res = await activeDevice.readGain(twistMode);
  const v = res && !res.error ? res.value : null;
  confirmedGain[twistMode] = v;
  setTwistGainReadback(v);
  return v;
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

const latestTwistPoints = [];
let latestTwistDiff = null;

function updateTwistUI(points, diff = null) {
  const twistPanel = document.getElementById('twist-panel');
  const twistBedVisible = isViewActive('view-joystick');
  if (!twistBedVisible || !twistPanel || twistPanel.classList.contains('hidden')) return;
  if (!Array.isArray(points) || points.length < 4) return;

  updateTwistPanelGating();

  latestTwistPoints.splice(0, latestTwistPoints.length, ...points);
  latestTwistDiff = diff;

  const input = deriveTwistInputsFromPoints(points, diff);
  const res = computeTwistSignals(twistMode, input);
  const unit = res.unit;

  const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setTxt('twist-alpha', `${res.alphaCalDeg.toFixed(1)}\u00B0`);
  setTxt('twist-beta', `${res.betaCalDeg.toFixed(1)}\u00B0`);
  setTxt('twist-alpha-raw', `${res.alphaDeg.toFixed(1)}\u00B0`);
  setTxt('twist-beta-raw', `${res.betaDeg.toFixed(1)}\u00B0`);
  setTxt('twist-alpha-str', `${res.strengthAlpha.toFixed(2)} ${unit}`);
  setTxt('twist-beta-str', `${res.strengthBeta.toFixed(2)} ${unit}`);
}

// The Gain & Calibration Config card stays visible in every motion mode.
// (It was briefly gated to "XY only" per reviewer slide 4, but the k/o
// constants and GAINSEL must stay reachable while tuning, so the gate now
// only ensures the card is shown, never hidden. Twist calibration itself is
// still covered by Zero Position.)
function updateTwistPanelGating() {
  ['twist-config-card', 'twist-how-details'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
}

// --- 3D Joystick UI ---
function initJoystickLEDs() {
  if (!joystickBase || leds.length > 0) return;
  for (let i = 0; i < TOTAL_LEDS; i++) {
    const led = document.createElement('div');
    led.className = 'joystick__led';
    led.style.transform = `rotate(${(i * ANGLE_STEP) + 90}deg)`;
    joystickBase.appendChild(led);
    leds.push(led);
  }
}

function updateJoystickUI(x, y) {
  if (!joystickStick || !isViewActive('view-joystick')) return;
  const safeX = typeof x === 'number' && !isNaN(x) ? x : 0;
  // Sensor +Y is up — the same convention as updateMagnetUI, which negates it
  // for the 2D disk. A CSS translateY percentage moves the knob *down* the
  // screen, so flip once here rather than in three places: the knob, the LED
  // ring and the radar trail all read safeY, so they stay consistent with each
  // other and with the magnet view.
  const safeY = (typeof y === 'number' && !isNaN(y) ? y : 0) * -1;
  
  const radius = Math.sqrt(safeX * safeX + safeY * safeY);
  let renderX = safeX;
  let renderY = safeY;
  
  if (radius > 50) {
    const scale = 50 / radius;
    renderX *= scale; 
    renderY *= scale;
  }
  
  joystickStick.style.setProperty('--tx', renderX);
  joystickStick.style.setProperty('--ty', renderY);

  // The LED ring only needs DOM writes when the lit sector actually moves;
  // resetting 28 classNames every loop iteration is pure layout churn.
  let activeIndex = -1;
  if (radius > 5) {
    let angleDeg = Math.atan2(safeY, safeX) * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;
    activeIndex = Math.round(angleDeg / ANGLE_STEP) % TOTAL_LEDS;
  }
  if (activeIndex === lastLedKey) return;
  lastLedKey = activeIndex;

  leds.forEach(led => led.className = 'joystick__led');

  // The polar radar is NOT fed here: its vector comes from the angular formula
  // applied to the 4-pixel averaged XYZ (pushRadarFromAvg in the demo loop), so
  // the plot follows the calibrated tilt angles rather than this knob scale.
  // Keeping the two feeds separate is what lets the radar show XY-tilt while the
  // knob shows the raw averaged field.

  if (activeIndex >= 0) {
    for (let i = -2; i <= 2; i++) {
      let targetIdx = (activeIndex + i + TOTAL_LEDS) % TOTAL_LEDS;
      if (leds[targetIdx]) {
        if (i === 0) leds[targetIdx].classList.add('led-active');
        else if (Math.abs(i) === 1) leds[targetIdx].classList.add('led-low-1');
        else leds[targetIdx].classList.add('led-low-2');
      }
    }
  }
}

// --- Sensor Diagnostics ---
// Raw values only, straight from the three RM replies: nothing here is
// averaged, offset-corrected or clamped, so this is the view to trust when the
// knob looks wrong.
const DIAG_STATUS_FN = { 3: 'Single', 2: 'Burst', 1: 'WOC', 0: 'Exit / Memory' };

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

// The status byte is split the way the part defines it: bits 7:6 the function
// ID, bits 5:3 a measurement counter (meaningful in burst and WOC), then
// ERROR, INFO/WARN and DRDY.
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

function updateDiagnostics(frames, knob) {
  if (!isViewActive('view-diagnostics')) return;

  const res01 = frames?.res01, res23 = frames?.res23, resDiff = frames?.resDiff;

  // --- Frame health ---
  diagText('diag-source', currentDriverType === 'scpi' ? 'Live hardware (SCPI)' : 'Live hardware (Arduino)');
  const st = decodeStatus(res01?.status);
  if (st) {
    // The loop reads 0x41/0x42 whenever any reply carried ERROR or WARN, so the
    // cause can be named here; the read also clears the latch for the next frame.
    const flags = frames?.flags;
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

  const transfers = { '01': res01, '23': res23, 'diff': resDiff };
  const crcLine = ['01', '23', 'diff'].map(k => {
    const r = transfers[k];
    if (!r) return `${k}:--`;
    return `${k}:${r.error ? 'FAIL' : 'ok'}`;
  }).join('   ');
  diagText('diag-crc', crcLine);

  // --- Absolute pixels ---
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
    const sum = (a, b) => a + b;
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

  // --- Differential channels ---
  const gradRows = [
    ['diag-dx02', resDiff?.x02], ['diag-dy02', resDiff?.y02], ['diag-dz02', resDiff?.z02],
    ['diag-dx13', resDiff?.x13], ['diag-dy13', resDiff?.y13], ['diag-dz13', resDiff?.z13]
  ];
  gradRows.forEach(([id, v]) => diagText(id, typeof v === 'number' ? String(v) : '--'));

  // --- Knob output ---
  diagText('diag-joy-src', 'Absolute field (avg X, Y)');
  diagText('diag-joy-x', typeof knob?.joyX === 'number' ? knob.joyX.toFixed(2) : '--');
  diagText('diag-joy-y', typeof knob?.joyY === 'number' ? knob.joyY.toFixed(2) : '--');
  diagText('diag-joy-angle', typeof knob?.angleDeg === 'number' ? `${knob.angleDeg.toFixed(1)}°` : '--');
  if (knob?.periodMs) diagText('diag-period', `${knob.periodMs} ms`);
}

// --- 2D Polar Radar (SFI-style field-vector scope) ---
// Mirrors the SFI page's drawRadar: a reticle with 25% rings and +X/+Y
// compass labels, a theme-coloured measured vector clamped to the rim and a
// glowing head. +Y is UP, so the vector points the same way the joystick knob
// does; it feeds on the same coordinates as the knob (absolute-field average),
// so the radar and the joystick can never disagree on Y.
const radarCanvas = document.getElementById('radar-canvas');
const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
const radarReadout = document.getElementById('radar-readout');
const radarState = { x: 0, y: 0 };
// Displayed position, glided toward radarState at rAF rate so the needle moves
// at panel refresh speed even when telemetry arrives at the 10-25 ms loop
// cadence (a raw data-rate update reads as "low FPS" stepping).
const radarSmooth = { x: 0, y: 0 };

const RADAR_SCALE = 90; // tilt degrees at the rim
// No-signal dead zone for the radar scope: below this absolute-field magnitude
// (≈0.25 mT at 20 LSB/mT) there is no X/Y tilt to point at. Without this gate
// the all-zero start frame feeds atan2(0,0)=0° through the angular formula and
// the needle slams to the right rim until a real field arrives.
const RADAR_NO_MAG_MT = 5;

function pushRadarPoint(x, y) {
  radarState.x = x;
  radarState.y = y;
}

// Radar XY follows the calibrated tilt angles, with 90° as the neutral field.
function pushRadarFromAvg(x, y, z) {
  // Input is raw LSB; RADAR_NO_MAG_MT is an mT figure, so scale the counts by
  // the shared absolute divisor. The calibrated angle below is scale-invariant,
  // so this only makes the park gate mean what it says.
  const scale = 1 / SINGLE_PIXEL_LSB_PER_MT;
  const bx = (typeof x === 'number' && Number.isFinite(x) ? x : 0) * scale;
  const by = (typeof y === 'number' && Number.isFinite(y) ? y : 0) * scale;
  const bz = (typeof z === 'number' && Number.isFinite(z) ? z : 0) * scale;
  // Park at the neutral point (α=β=90° → offset 0,0) while the field is
  // negligible, mirroring the SFI no-signal park instead of pinning to the
  // rim on a degenerate atan2(0,0).
  if (Math.hypot(bx, by, bz) < RADAR_NO_MAG_MT) {
    pushRadarPoint(0, 0);
    return;
  }
  const cal = applyTwistCalibration(bx, by, bz);
  if (!Number.isFinite(cal.alphaDeg) || !Number.isFinite(cal.betaDeg)) {
    pushRadarPoint(0, 0);
    return;
  }
  const offset = {
    x: (90 - cal.alphaDeg) / 90,
    y: (90 - cal.betaDeg) / 90
  };
  pushRadarPoint(offset.x * RADAR_SCALE, offset.y * RADAR_SCALE);
}

// --- Fit-to-screen sizing (see the FIT-TO-SCREEN block in index.html) ---
// In that layout the boxes grow with the monitor, so the parts drawn at fixed
// pixel sizes follow them: the magnet disk keeps its 200 px : 700 px ratio to
// the grid, the CSS stick is zoomed into its cell, and the radar canvas is
// sized to its cell on a device-pixel-ratio backing store so it stays sharp.
const FIT_MEDIA = window.matchMedia('(min-width: 1024px) and (min-height: 640px)');
const RADAR_DEFAULT_PX = 340;
const stickCell = document.getElementById('joy-stick-cell');
const radarCell = document.getElementById('joy-radar-cell');
const stickWrapper = stickCell ? stickCell.querySelector('.joystick-wrapper') : null;

function sizeRadarCanvas(cssPx) {
  if (!radarCanvas || !radarCtx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  radarCanvas.style.width = `${cssPx}px`;
  radarCanvas.style.height = `${cssPx}px`;
  radarCanvas.cssSize = cssPx;
  radarCanvas.width = Math.round(cssPx * dpr);
  radarCanvas.height = Math.round(cssPx * dpr);
  radarCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitThumbstickViews() {
  const fit = FIT_MEDIA.matches;

  if (magnetDisk && magnetSensorEl && magnetSensorEl.clientWidth > 0) {
    const d = fit ? Math.round(magnetSensorEl.clientWidth * 200 / 700) : 200;
    magnetDisk.style.width = `${d}px`;
    magnetDisk.style.height = `${d}px`;
    magnetDisk.style.marginTop = `${-d / 2}px`;
    magnetDisk.style.marginLeft = `${-d / 2}px`;
    magnetDisk.querySelectorAll('.magnet-pole').forEach(p => { p.style.fontSize = `${(2.3 * d / 200).toFixed(2)}rem`; });
  }

  if (stickWrapper && stickCell && stickCell.clientWidth > 0) {
    const z = Math.min(stickCell.clientWidth / 340, stickCell.clientHeight / 400);
    stickWrapper.style.zoom = fit ? String(Math.max(0.5, Math.min(3, z)).toFixed(3)) : '';
  }

  if (radarCell && radarCell.clientWidth > 0) {
    // Room for the "Polar Radar" title and the readout line under the dial.
    const px = fit
      ? Math.max(160, Math.floor(Math.min(radarCell.clientWidth - 16, radarCell.clientHeight - 64)))
      : RADAR_DEFAULT_PX;
    if (radarCanvas && radarCanvas.cssSize !== px) sizeRadarCanvas(px);
  }
}

function initFitLayout() {
  let queued = false;
  const refit = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fitThumbstickViews(); });
  };
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(refit);
    [magnetSensorEl, stickCell, radarCell].forEach(el => { if (el) observer.observe(el); });
  }
  window.addEventListener('resize', refit);
  FIT_MEDIA.addEventListener?.('change', refit);
  refit();
}

function drawRadar() {
  if (!radarCtx || !isViewActive('view-joystick')) return;

  const { canvas } = radarCtx;
  const w = canvas.cssSize || canvas.width;
  const h = canvas.cssSize || canvas.height;
  const cx = w / 2, cy = h / 2;
  // Labels, needle and margin scale with the dial (1x at the original 340 px).
  const k = Math.max(1, Math.min(w, h) / RADAR_DEFAULT_PX);
  const R = Math.min(cx, cy) - 25 * k;
  const ctx = radarCtx;

  ctx.clearRect(0, 0, w, h);

  // Glide the needle toward the latest telemetry. ~35% per frame reaches 90%
  // of the way in ~6 frames (<100 ms), so the scope feels fluid without
  // gambling on how fast the data loop actually runs.
  const glide = 0.35;
  radarSmooth.x += (radarState.x - radarSmooth.x) * glide;
  radarSmooth.y += (radarState.y - radarSmooth.y) * glide;

  // Reticle: dark disc, rings every 25 %, crosshair.
  ctx.fillStyle = '#030816';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath(); ctx.arc(cx, cy, R * r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(10 * k)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('90° (+Y)', cx, cy - R + 14 * k);
  ctx.fillText('270° (-Y)', cx, cy + R - 8 * k);
  // Side labels anchored inside the rim, so they never cross the dial's edge.
  ctx.textAlign = 'right';
  ctx.fillText('0° (+X)', cx + R - 6 * k, cy - 6 * k);
  ctx.textAlign = 'left';
  ctx.fillText('180° (-X)', cx - R + 6 * k, cy - 6 * k);

  // Measured vector (solid line), boundary-clamped to the rim, +Y up.
  const dist = Math.hypot(radarSmooth.x, radarSmooth.y);
  const clamp = dist > 0 ? Math.min(dist, RADAR_SCALE) / dist : 1;
  const bx = cx + ((radarSmooth.x * clamp) / RADAR_SCALE) * R;
  const by = cy - ((radarSmooth.y * clamp) / RADAR_SCALE) * R;
  const range = Math.min(RADAR_SCALE, dist);

  ctx.strokeStyle = '#65BBA9';
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx, by);
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = '#65BBA9';
  ctx.shadowBlur = 10 * k;
  ctx.fillStyle = '#65BBA9';
  ctx.beginPath(); ctx.arc(bx, by, 5.5 * k, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  if (radarReadout) {
    const azRaw = Math.atan2(radarSmooth.y, radarSmooth.x) * (180 / Math.PI);
    const az = azRaw < 0 ? azRaw + 360 : azRaw;
    radarReadout.textContent = `Azimuth: ${az.toFixed(1)}° | Range: ${((range / RADAR_SCALE) * 100).toFixed(0)}%`;
  }
}

function startRadarLoop() {
  if (!radarCtx) return;
  const step = () => {
    drawRadar();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// --- Diagnostics Logging (console only; no visible terminal) ---
function appendLog(text, cls) {
  if (!text) return;
  console.log(cls ? `[${cls}] ${text.replace(/\n$/, '')}` : text.replace(/\n$/, ''));
}

// --- Serial RX Router ---
let rxBuffer = '';
let lastDataLine = '';
let lastScalarLine = '';

// The Melexis IO board answers a command with an optional payload then a prompt
// "(<status>)>" where status is OK on success and a HAL/errno string otherwise
// (ERROR, BUSY, TIMEOUT, CRC, ERR:<n>). Matching the shape rather than a fixed
// list is what lets a rejected command surface as an error instead of hanging
// for the full 2.5 s timeout.
const SCPI_PROMPT_RE = /\(([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9]+)?)\)>\s*$/;

function processRx(text) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === '\n' || char === '\r') {
      if (rxBuffer.trim() !== '') {
        const line = rxBuffer.trim();
        if (DEBUG_SERIAL_RX) console.log('[RX LINE]', line);
        if (currentDriverType === 'arduino' && activeDevice) {
          activeDevice.processLine(line);
        } else {
          handlePrompt(line);
        }
      }
      rxBuffer = ''; 
    } else {
      rxBuffer += char;
      if (currentDriverType === 'scpi' && SCPI_PROMPT_RE.test(rxBuffer)) {
        const line = rxBuffer.trim();
        if (DEBUG_SERIAL_RX) console.log('[RX PROMPT]', line);
        handlePrompt(line);
        rxBuffer = '';
      }
    }
  }
}

function handlePrompt(line) {
  const prompt = SCPI_PROMPT_RE.exec(line);
  const status = prompt ? prompt[1] : null;

  if (status === 'OK') {
    const dataPart = line.slice(0, prompt.index).trim();
    if (dataPart.includes(':SPI') || dataPart.includes(',') || dataPart.includes('0x')) {
      lastDataLine = dataPart;
    }
    if (dataPart && DEBUG_SERIAL_RX) appendLog(dataPart + '\n', 'log-rx');
    if (DEBUG_SERIAL_RX) appendLog('(OK)>\n', 'log-okprompt');

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
    // (ERROR)> (BUSY)> (TIMEOUT)> …: any non-OK prompt is a failed command, so
    // reject the pending waiter immediately instead of waiting out the timeout.
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
    // Bare payload lines (e.g. the "1"/"0" a GPIO? answers with) carry no comma
    // and no 0x, so they are captured separately for scalar reads.
    if (!line.startsWith(':') && !line.startsWith('*')) {
      if (line.includes(',')) lastDataLine = line;
      lastScalarLine = line;
    }
  }
}

// --- SCPI Queries ---
function getEol() {
  return '\n';
}

async function sendCommand(cmd) {
  if (!writer) return;
  const raw = String(cmd ?? '').trim();
  if (!raw) return;
  try {
    await writer.write(raw + getEol());
  } catch (err) {
    console.error('[TX ERROR]', err);
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

    // The timeout has to recognise its own waiter: a slow reply arriving after
    // the deadline would otherwise be handed to (or discarded by) the next query.
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

// --- Connection Manager ---
function setUIConnected(connected) {
  isConnected = connected;
  btnConnect.textContent = connected ? 'Disconnect' : 'Connect USB';
  if (connected) btnConnect.classList.add('btn-danger');
  else btnConnect.classList.remove('btn-danger');

  if (btnStartDemo) btnStartDemo.disabled = !connected;

  const isScpi = connected && currentDriverType === 'scpi';
  ['nvram-addr', 'nvram-val', 'btn-nvram-read', 'btn-nvram-write', 'btn-nvram-dump', 'btn-nvram-hs', 'btn-nvram-hr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !isScpi;
  });
}

async function connectSerial() {
  try {
    // A Start pressed before connecting left the standalone emulation loop
    // running. Stop it and reset the controls before this session takes over,
    // otherwise the emulation keeps writing to the UI (and in the thumbstick
    // build pressing Start again would spawn a second runJoystickDemo()).
    isDemoRunning = false;
    if (btnStartDemo) btnStartDemo.disabled = false;
    if (btnStopDemo) btnStopDemo.disabled = true;
    await new Promise(r => setTimeout(r, 50));

    if (!navigator.serial) {
      connectModal?.classList.remove('hidden');
      showConnectError('This browser does not support the Web Serial API. Use Google Chrome or Microsoft Edge (desktop) \u2014 Firefox and Safari do not implement it.');
      return;
    }
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
      appendLog(`[SYSTEM] Connected with Direct Arduino API at ${baudRate} baud.\n`, 'log-okprompt');
    } else {
      activeDevice = new MLX90396_API(scpiQuery, getSpiPrefix);
      appendLog(`[SYSTEM] Connected with MLX90396 SCPI API on bus ${getSpiPrefix()} at ${baudRate} baud.\n`, 'log-okprompt');
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

  } catch (err) {
    const raw = err && err.message ? err.message : String(err);
    if (port) {
      const failedPort = port;
      port = null;
      try { await failedPort.close(); } catch (_) { /* best effort */ }
    }
    appendLog(`[CONN ERROR]: ${raw}\n`, 'log-badprompt');
    connectModal?.classList.remove('hidden');
    showConnectError(`Could not connect: ${hintForSerialError(raw)}`);
  }
}

let disconnectInFlight = false;

async function disconnectSerial(reason = 'manual') {
  // Re-entrant guard: the unplug listener and the Connect/Disconnect button can
  // both fire, and a double teardown would close an already-closed port.
  if (disconnectInFlight) return;
  disconnectInFlight = true;

  try {
    isReading = false;
    isDemoRunning = false;

    // Fail any in-flight SCPI query first. Its 2500 ms timeout would otherwise
    // still be pending against a port that no longer exists, holding the demo
    // loop's `scpiLock` and keeping the retry loop alive after teardown.
    if (scpiWaiter) {
      clearTimeout(scpiWaiter.timeoutId);
      const waiter = scpiWaiter;
      scpiWaiter = null;
      waiter.reject(new Error('Port closed'));
      if (waiter.release) waiter.release();
    }
    scpiLock = Promise.resolve();

    // Every teardown step is guarded: once the board is yanked out,
    // reader.cancel()/writer.close()/port.close() reject with NetworkError, and
    // an unguarded await aborts this function *before* the UI is reset - which
    // is what used to leave the button stuck reading "Disconnect".
    try { if (reader) { await reader.cancel(); reader.releaseLock(); } } catch (_) { /* stream already gone */ }
    try { if (writer) { await writer.close(); writer.releaseLock(); } } catch (_) { /* stream already gone */ }
    if (readableStreamClosed) await readableStreamClosed.catch(() => {});
    if (writableStreamClosed) await writableStreamClosed.catch(() => {});
    try { if (port) await port.close(); } catch (_) { /* port already gone */ }

    port = null; reader = null; writer = null; activeDevice = null;
    readableStreamClosed = null; writableStreamClosed = null;
    rxBuffer = '';
    lastDataLine = '';

    // Drop stale live state so the UI recentres instead of freezing at the last
    // reading: re-seed the disk smoother, home the radar needle, clear the twist
    // readouts.
    magnetState.inited = false;
    radarState.x = 0; radarState.y = 0;
    radarSmooth.x = 0; radarSmooth.y = 0;
    latestTwistPoints.length = 0;

    setUIConnected(false);
    setDemoStatus('Idle', false);
    // Keep the emulator reachable after a disconnect (Start stays enabled and
    // Stop is retired) - otherwise the built-in demo is only usable once per
    // page load.
    if (btnStartDemo) btnStartDemo.disabled = false;
    if (btnStopDemo) btnStopDemo.disabled = true;
    updateJoystickUI(0, 0);
    updateMagnetUI(0, 0);

    appendLog(`[SYSTEM] Port closed${reason === 'unplugged' ? ' (device removed)' : ''}.\n`, 'log-badprompt');
  } finally {
    disconnectInFlight = false;
  }
}

// The board can be pulled out mid-stream. navigator.serial reports that on its
// own `disconnect` event; without this listener the UI keeps claiming
// "Connected" and the demo loop spins on a dead port, retrying every 150 ms.
function initSerialPortEvents() {
  if (!navigator.serial || typeof navigator.serial.addEventListener !== 'function') return;

  navigator.serial.addEventListener('disconnect', (event) => {
    // Only tear down when the port that vanished is the one we opened.
    if (!port || event.target !== port) return;
    appendLog('[SYSTEM] Serial device disconnected.\n', 'log-badprompt');
    disconnectSerial('unplugged');
  });

  navigator.serial.addEventListener('connect', () => {
    appendLog('[SYSTEM] Serial device available - press Connect USB.\n', 'log-okprompt');
  });
}

// Best effort on tab close: without it the OS keeps the CDC port claimed, so the
// next page load cannot open it until the browser releases it.
window.addEventListener('beforeunload', () => {
  if (!port) return;
  try { port.close(); } catch (_) { /* nothing left to close */ }
});

// --- Live Unified Demo Loop ---
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
  setDemoStatus('Running', true);

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

        // Write both gain fields from the GAINSEL table every time. The chip
        // powers up at its factory trim, so a value picked before connecting
        // (or before a power cycle) only lives in the table until it is sent.
        await setSensorGain(getGainSel('1px'), '1px');
        await setSensorGain(getGainSel('2px'), '2px');
      }

      const K_ROT_X = 0.10, K_ROT_Y = 0.10;
      const SCALE_X = 0.02, SCALE_Y = 0.02;

      while (isDemoRunning) {
        try {
          let posX_mm = 0, posY_mm = 0, angleDeg = 0;
          const loopT0 = performance.now();
          let frames = null;
          let rawX = 0, rawY = 0, rawZ = 0;
          let joyX = 0, joyY = 0;

          if (currentDriverType === 'scpi') {
            await activeDevice.sm(0xFC000); 
            await activeDevice.awaitReady();
            const res01 = await activeDevice.rm(false, 0xFC000); 
            
            await activeDevice.sm(0x03F00); 
            await activeDevice.awaitReady();
            const res23 = await activeDevice.rm(false, 0x03F00); 

            // The chip's dedicated differential channels. Mask 0x000FC covers
            // all six of them (X02, Y02, Z02, X13, Y13, Z13, bits 7..2), which
            // is still a legal 6-channel measurement. They feed the diagnostics
            // tab and the twist panel's 2px readouts, so the extra transfer is
            // skipped when neither needs it (see needsDiffChannels): 12 absolute
            // + 6 gradient is 18 channels and the part allows 6 per measurement,
            // i.e. a real round-trip the other views would otherwise pay for and
            // discard. Each SM is followed by a DRDY-gated wait (bounded, so a
            // slow conversion still yields fresh data without stalling the loop).
            let resDiff = null;
            if (needsDiffChannels()) {
              await activeDevice.sm(0x000FC);
              await activeDevice.awaitReady();
              resDiff = await activeDevice.rm(false, 0x000FC);
            }

            // ERROR (bit 2) or WARN (bit 1) in any good reply: read the register
            // that latched it, which names the cause and clears the flag.
            const statusBits = [res01, res23, resDiff]
              .reduce((acc, r) => acc | (r && !r.error ? r.status : 0), 0);
            let flags = null;
            if (statusBits & 0x06) {
              flags = await activeDevice.readFlags({ warn: !!(statusBits & 0x02), error: !!(statusBits & 0x04) });
              noteFlagEvent(flags);
            }
            frames = { res01, res23, resDiff, flags };

            if (!res01.error && !res23.error) {
              const avgX = (res01.x0 + res01.x1 + res23.x2 + res23.x3) / 4;
              const avgY = (res01.y0 + res01.y1 + res23.y2 + res23.y3) / 4;
              const avgZ = (res01.z0 + res01.z1 + res23.z2 + res23.z3) / 4;

              angleDeg = Math.atan2(-avgY, avgX) * (180 / Math.PI);

              const rawGradX = ((res01.x1 + res23.x2) - (res01.x0 + res23.x3)) / 2;
              const rawGradY = ((res01.y0 + res01.y1) - (res23.y3 + res23.y2)) / 2;

              const cleanGradX = rawGradX - (avgX * K_ROT_X);
              const cleanGradY = rawGradY - (avgY * K_ROT_Y);

              latestRawMagnet.x = cleanGradX * SCALE_X;
              latestRawMagnet.y = cleanGradY * SCALE_Y;

              posX_mm = latestRawMagnet.x - magnetOffsets.x;
              posY_mm = latestRawMagnet.y - magnetOffsets.y;
              rawX = avgX; rawY = avgY; rawZ = avgZ;

              // Knob coordinates come from the 4-pixel absolute average only
              // (the gradient/field position-source toggle was removed).
              joyX = avgX / 5;
              joyY = avgY / 5;

              // Radar XY from the angular formula on the averaged XYZ.
              pushRadarFromAvg(avgX, avgY, avgZ);

              updateTwistUI([
                { x: res01.x0, y: res01.y0, z: res01.z0 },
                { x: res01.x1, y: res01.y1, z: res01.z1 },
                { x: res23.x2, y: res23.y2, z: res23.z2 },
                { x: res23.x3, y: res23.y3, z: res23.z3 },
              ], resDiff && !resDiff.error ? resDiff : null);
            }
          } else {
            const sample = await activeDevice.getSample();
            if (!sample.error) {
              latestRawMagnet.x = sample.posX_mm;
              latestRawMagnet.y = sample.posY_mm;
              posX_mm = latestRawMagnet.x - magnetOffsets.x;
              posY_mm = latestRawMagnet.y - magnetOffsets.y;
              angleDeg = sample.angleDeg;
              rawX = sample.rawX; rawY = sample.rawY; rawZ = sample.rawZ;
              // The Arduino frame carries no Δ channels, so the gradient source
              // is unavailable here and the knob stays on the absolute field.
              joyX = sample.rawX / 20; joyY = sample.rawY / 20;
              pushRadarFromAvg(rawX, rawY, rawZ);

              if (sample.points && sample.points.length === 4) {
                updateTwistUI(sample.points);
              }
            }
          }

          // Live UI Updates (Placed INSIDE loop after data is read)
          updateMagnetUI(posX_mm, posY_mm, angleDeg);
          updateJoystickUI(joyX, joyY); 

          updateDiagnostics(frames, {
            joyX, joyY, angleDeg,
            periodMs: Math.round(performance.now() - loopT0 + (currentDriverType === 'scpi' ? 10 : 25))
          });

          await new Promise(r => setTimeout(r, currentDriverType === 'scpi' ? 10 : 25));
        } catch (loopErr) {
          console.warn('[DEMO LOOP WARNING]', loopErr);
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } catch (err) {
      appendLog(`[DEMO ERROR]: ${err.message}\n`, 'log-badprompt');
      isDemoRunning = false;
      setDemoStatus('Error', false);
      btnStartDemo.disabled = false;
      btnStopDemo.disabled = true;
    }
  } else {
    // Standalone Emulation Mode
    let angle = 0;
    while (isDemoRunning) {
      angle += 0.08; 
      const emulatedX = Math.sin(angle * 0.7) * 1.8;
      const emulatedY = Math.cos(angle * 0.9) * 1.8;
      const emulatedAngle = (angle * (180 / Math.PI)) % 360;

      updateMagnetUI(emulatedX, emulatedY, emulatedAngle);
      updateJoystickUI(emulatedX * 20, emulatedY * 20);
      pushRadarFromAvg(emulatedX * 20, emulatedY * 20, 20);

      // Synthetic 4-pixel twist field (rotating around Z, constant bias on Z)
      const twistV = Math.sin(angle) * 6;
      const twistW = Math.cos(angle) * 6;
      const bias = 18;
      updateTwistUI([
        { x: twistV, y: twistW, z: bias },
        { x: twistV - 3, y: twistW, z: bias },
        { x: twistV + 3, y: twistW, z: bias },
        { x: twistV, y: twistW - 3, z: bias },
      ]);

      await new Promise(r => setTimeout(r, 33)); 
    }
  }
}

// --- NVRAM Handling ---
function initNvramControls() {
  const btnRead = document.getElementById('btn-nvram-read');
  const btnWrite = document.getElementById('btn-nvram-write');
  const btnDump = document.getElementById('btn-nvram-dump');
  const btnHs = document.getElementById('btn-nvram-hs');
  const btnHr = document.getElementById('btn-nvram-hr');
  const addrInput = document.getElementById('nvram-addr');
  const valInput = document.getElementById('nvram-val');
  const tableBody = document.getElementById('nvram-table-body');

  const parseAddr = (str) => str.startsWith('0x') || str.startsWith('0X') ? parseInt(str, 16) : parseInt(str, 10);
  const parseVal = (str) => str.startsWith('0x') || str.startsWith('0X') ? parseInt(str, 16) : parseInt(str, 10);

  btnRead?.addEventListener('click', async () => {
    if (!activeDevice || currentDriverType !== 'scpi') return;
    const addr = parseAddr(addrInput.value);
    if (isNaN(addr)) return;
    const res = await activeDevice.rr(addr);
    if (!res.error) {
      valInput.value = '0x' + res.data.toString(16).toUpperCase().padStart(4, '0');
      appendLog(`[NVRAM] Read 0x${addr.toString(16).toUpperCase()}: 0x${res.data.toString(16).toUpperCase()}\n`, 'log-okprompt');
    }
  });

  btnWrite?.addEventListener('click', async () => {
    if (!activeDevice || currentDriverType !== 'scpi') return;
    const addr = parseAddr(addrInput.value);
    const val = parseVal(valInput.value);
    if (isNaN(addr) || isNaN(val)) return;
    const err = await activeDevice.wr(addr, val);
    appendLog(`[NVRAM] Write 0x${addr.toString(16).toUpperCase()} = 0x${val.toString(16).toUpperCase()}: ${!err ? 'SUCCESS' : 'FAILED'}\n`, !err ? 'log-okprompt' : 'log-badprompt');
  });

  btnDump?.addEventListener('click', async () => {
    if (!activeDevice || currentDriverType !== 'scpi' || !tableBody) return;
    tableBody.innerHTML = '';
    for (let reg = 0x00; reg <= 0x3F; reg++) {
      const res = await activeDevice.rr(reg);
      const row = document.createElement('tr');
      row.className = 'ds-table__row';
      row.innerHTML = `
        <td class="ds-table__td">0x${reg.toString(16).toUpperCase().padStart(2, '0')}</td>
        <td class="ds-table__td">${reg}</td>
        <td class="ds-table__td">0x${res.error ? '--' : res.data.toString(16).toUpperCase().padStart(4, '0')}</td>
        <td class="ds-table__td">${res.error ? '--' : res.data}</td>
        <td class="ds-table__td">${res.error ? 'ERR' : 'OK'}</td>
      `;
      tableBody.appendChild(row);
    }
  });

  btnHs?.addEventListener('click', async () => {
    if (activeDevice && currentDriverType === 'scpi') await activeDevice.hs();
  });
  btnHr?.addEventListener('click', async () => {
    if (activeDevice && currentDriverType === 'scpi') await activeDevice.hr();
  });
}

// --- Connection Modal Event Handlers ---
selDriverType?.addEventListener('change', (e) => {
  if (wrapConnType) {
    wrapConnType.style.display = e.target.value === 'scpi' ? 'block' : 'none';
  }
});

btnConnect?.addEventListener('click', () => {
  if (isConnected) disconnectSerial();
  else {
    clearConnectError();
    connectModal?.classList.remove('hidden');
    if (!navigator.serial) {
      if (btnModalConnect) btnModalConnect.disabled = true;
      showConnectError('This browser does not support the Web Serial API. Use Google Chrome or Microsoft Edge (desktop).');
    } else {
      if (btnModalConnect) btnModalConnect.disabled = false;
    }
    refreshPortGuide();
  }
});

btnCloseModal?.addEventListener('click', () => {
  clearConnectError();
  connectModal?.classList.add('hidden');
});

btnModalConnect?.addEventListener('click', async () => {
  connectModal?.classList.add('hidden');
  await connectSerial();
});

btnStartDemo?.addEventListener('click', runJoystickDemo);
btnStopDemo?.addEventListener('click', () => {
  isDemoRunning = false;
  btnStartDemo.disabled = false;
  btnStopDemo.disabled = true;
  setDemoStatus('Idle', false);
  updateJoystickUI(0, 0); updateMagnetUI(0, 0);
  appendLog('[SYSTEM] Demo stopped.\n', 'log-badprompt');
});

// --- 3D Vector Plot Setup ---
const MAX_TRAIL_POINTS = 60;
const history3D = { x: [], y: [], z: [] };
// Plotly.react on a 3D scatter costs tens of ms; the trail history still
// accumulates every loop, but the re-render is capped at ~10 Hz.
let lastPlotReactMs = 0;

const layout3D = {
  autosize: true, margin: { l: 0, r: 0, b: 0, t: 0 },
  paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
  scene: {
    aspectmode: 'cube',
    xaxis: { title: 'Bx', range: [-1000, 1000], color: '#A9B8C9', gridcolor: '#33588C', gridwidth: 1, showbackground: true, backgroundcolor: 'rgba(10,20,40,0.35)', zerolinecolor: '#DB4140', zerolinewidth: 2, dtick: 250 },
    yaxis: { title: 'By', range: [-1000, 1000], color: '#A9B8C9', gridcolor: '#33588C', gridwidth: 1, showbackground: true, backgroundcolor: 'rgba(10,20,40,0.35)', zerolinecolor: '#DB4140', zerolinewidth: 2, dtick: 250 },
    zaxis: { title: 'Bz', range: [-1000, 1000], color: '#A9B8C9', gridcolor: '#33588C', gridwidth: 1, showbackground: true, backgroundcolor: 'rgba(10,20,40,0.35)', zerolinecolor: '#DB4140', zerolinewidth: 2, dtick: 250 },
    bgcolor: 'rgba(0,0,0,0)'
  }
};

const traceOrigin = { x: [0], y: [0], z: [0], mode: 'markers', type: 'scatter3d', marker: { size: 6, color: '#A9B8C9', opacity: 0.5 }, name: 'Center' };
const traceTrail = { x: [], y: [], z: [], mode: 'lines', type: 'scatter3d', line: { color: '#8fc1cc', width: 4 }, name: 'Trail' };
const traceLiveBall = { x: [0], y: [0], z: [0], mode: 'markers', type: 'scatter3d', marker: { size: 10, color: '#65BBA9' }, name: 'Live' };

if (document.getElementById('plot-3d-container') && window.Plotly) {
  Plotly.newPlot('plot-3d-container', [traceOrigin, traceTrail, traceLiveBall], layout3D);
}

export function update3DVectorPlot(rx, ry, rz) {
  if (!window.Plotly || !document.getElementById('plot-3d-container')) return;
  const x = typeof rx === 'number' && !isNaN(rx) ? rx : 0;
  const y = typeof ry === 'number' && !isNaN(ry) ? ry : 0;
  const z = typeof rz === 'number' && !isNaN(rz) ? rz : 0;

  history3D.x.push(x); history3D.y.push(y); history3D.z.push(z);
  if (history3D.x.length > MAX_TRAIL_POINTS) {
    history3D.x.shift(); history3D.y.shift(); history3D.z.shift();
  }

  if (!document.getElementById('plot-3d-container') || !isViewActive('view-3dplot')) return;

  const nowMs = performance.now();
  if (nowMs - lastPlotReactMs < 100) return;
  lastPlotReactMs = nowMs;

  Plotly.react('plot-3d-container', [
    traceOrigin,
    { ...traceTrail, x: history3D.x, y: history3D.y, z: history3D.z },
    { ...traceLiveBall, x: [x], y: [y], z: [z] }
  ], layout3D);
}

document.getElementById('btn-reset-3d-trail')?.addEventListener('click', () => {
  history3D.x = []; history3D.y = []; history3D.z = [];
  if (window.Plotly) {
    Plotly.react('plot-3d-container', [traceOrigin, { ...traceTrail, x: [], y: [], z: [] }, { ...traceLiveBall, x: [0], y: [0], z: [0] }], layout3D);
  }
});
