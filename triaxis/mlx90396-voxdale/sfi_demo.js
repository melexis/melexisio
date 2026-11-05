/**
 * sfi_demo.js
 * Standalone SFI Joystick, 3D Dome Kinematics, Centered Z-UP XYZ Chart, Polar Radar & Stray Field Comparison
 */

// --- GLTFLoader (r128 non-module build, matches the global THREE loaded in index.html) ---
let gltfLoaderPromise = null;

// The three.js itself comes from cdnjs, so that CDN is tried first: a single
// hard-coded jsdelivr source silently leaves the 3D tab as an empty canvas
// whenever that one host is blocked or stalling. Each source gets a timeout,
// then the chain moves on.
const GLTF_LOADER_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js'
];

function loadGltfLoaderScript() {
  const attempt = (src, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
        fn(arg);
      };
      const timer = setTimeout(() => finish(reject, new Error('GLTFLoader script timeout: ' + src)), timeoutMs);
      script.src = src;
      script.onload = () => finish(resolve, THREE.GLTFLoader);
      script.onerror = () => finish(reject, new Error('GLTFLoader script error: ' + src));
      document.head.appendChild(script);
    });

  return (async () => {
    for (const src of GLTF_LOADER_SOURCES) {
      try {
        const loader = await attempt(src);
        if (loader) return loader;
      } catch (err) {
        console.warn('[GLTFLOADER]', err.message);
      }
    }
    throw new Error('GLTFLoader unavailable from all CDNs');
  })();
}

function ensureGLTFLoader() {
  if (!gltfLoaderPromise) {
    gltfLoaderPromise = window.THREE && THREE.GLTFLoader
      ? Promise.resolve(THREE.GLTFLoader)
      : loadGltfLoaderScript();
  }
  return gltfLoaderPromise;
}

// --- Calibration & Signal Math Engine ---
// The Desmos math lives in the shared ../angle_calib.js module (one source of
// truth, also used by the Thumbstick page). The exports below keep the exact
// sfi_demo.js API, so the rest of this file and app.js stay untouched.
import {
  DEFAULT_CALIBRATION_PARAMS as ENGINE_DEFAULTS,
  normalizeParams,
  calculateDesmosAngles as moduleDesmosAngles,
  calculate1pxAngles,
  calculateSfiDifferentialAngles,
  calculateDifferentialGimbalInput,
  SINGLE_PIXEL_LSB_PER_MT,
  lsbPerMtMm
} from '../angle_calib.js';

export const DEFAULT_CALIBRATION_PARAMS = { ...ENGINE_DEFAULTS };

let activeCalibrationParams = { ...DEFAULT_CALIBRATION_PARAMS };
let differentialFormula = 'enhanced';

export function setCalibrationParams(newParams) {
  activeCalibrationParams = normalizeParams({ ...activeCalibrationParams, ...newParams });
}

export function getCalibrationParams() {
  return { ...activeCalibrationParams };
}

export function resetCalibrationParams() {
  activeCalibrationParams = { ...DEFAULT_CALIBRATION_PARAMS };
  return activeCalibrationParams;
}

export function setDifferentialFormula(formula) {
  differentialFormula = formula === 'enhanced' ? 'enhanced' : 'normal';
}

export function calculateDesmosAngles(x, y, z, params = DEFAULT_CALIBRATION_PARAMS) {
  return moduleDesmosAngles(x, y, z, params);
}

export function computeSfi1Px(bx, by, bz, params = DEFAULT_CALIBRATION_PARAMS) {
  const r = calculate1pxAngles({ Bx: bx, By: by, Bz: bz }, params);
  return {
    mode: '1px',
    alphaStrength: r.alphaStrength,
    betaStrength: r.betaStrength,
    signalStrength: r.signalStrength,
    alphaSignal: { z: r.alphaSignal.z, x: r.alphaSignal.x },
    betaSignal: { z: r.betaSignal.z, y: r.betaSignal.y },
    alphaRad: r.alphaRad,
    betaRad: r.betaRad,
    alphaDeg: r.alphaDeg,
    betaDeg: r.betaDeg
  };
}

export function computeSfi2Px(dbx_dx, dbz_dx, dby_dy, dbz_dy, params = DEFAULT_CALIBRATION_PARAMS) {
  const angles = calculateSfiDifferentialAngles(
    { X02: dbx_dx, Z02: dbz_dx, Y13: dby_dy, Z13: dbz_dy },
    params,
    differentialFormula
  );

  const alphaStrength = Math.hypot(dbx_dx, dbz_dx);
  const betaStrength = Math.hypot(dby_dy, dbz_dy);
  const signalStrength = Math.hypot(dbx_dx, dbz_dx, dby_dy, dbz_dy);

  return {
    mode: '2px',
    alphaStrength,
    betaStrength,
    signalStrength,
    alphaSignal: { dbz_dx, dbx_dx },
    betaSignal: { dbz_dy, dby_dy },
    alphaRad: angles.alphaRad,
    betaRad: angles.betaRad,
    alphaDeg: angles.alphaDeg,
    betaDeg: angles.betaDeg,
    valid: angles.valid
  };
}

// --- Simulation & Telemetry State ---
let autoPattern = true;
let animTime = 0;
let joyX = 0, joyY = 0, joyZ = 0;
let targetJoyX = 0, targetJoyY = 0, targetJoyZ = 0;

let displayStdBx = 0, displayStdBy = 0, displayStdBz = 0;
let displayMlxDBx = 0, displayMlxDBy = 0, displayMlxDBz = 0, displayMlxDBzY = 0;
let targetStdBx = 0, targetStdBy = 0, targetStdBz = 0;
let targetMlxDBx = 0, targetMlxDBy = 0, targetMlxDBz = 0, targetMlxDBzY = 0;
let isLiveHardwareConnected = false;

let stdTraceHistory = [];
let mlxTraceHistory = [];

let mainSceneObj = null;
let stdPlot = null;
let mlxPlot = null;
let joyAssemblyRef = null;
let joyRestPosition = new THREE.Vector3();
let joyPivotPoint = new THREE.Vector3();

let radarCanvasStd = null, radarCtxStd = null;
let radarCanvasMlx = null, radarCtxMlx = null;

let liveHardwarePacket = null;
let liveSfiAngles = { alpha: 90, beta: 90 };
let gimbalZeroAngles = { alpha: 90, beta: 90 };
// Display scale for the two field plots (see angle_calib.js for the derivation
// and the pitch caveat). SINGLE_PIXEL_LSB_PER_MT and lsbPerMtMm() are imported
// from the shared module so the Thumbstick page uses the same numbers.
const TRACE_HISTORY_POINTS = 45;

// Angle change (degrees away from the zero) that tilts the 3D Joystick Model
// and the tilt radar fully. Measured on the bench: a full-tilt circle swings
// the enhanced alpha/beta about +/-54° from rest (90th percentile), so 60°
// gives full model tilt at full stick travel instead of the 2/3 that the old
// /90 mapping reached.
const GIMBAL_FULL_SCALE_DEG = 60;

// Fake-data ("auto-pattern") tuning, in physical units.
//   SIM_DIFF_BASE_MT_MM  nominal in-plane gradient at rest
//   SIM_DIFF_SWEEP_DEG   alpha/beta swing at full stick deflection - the same
//                        span as the gimbal, so full stick = full model tilt
//   SIM_TILT_Z_DROP_MT   how far Bz drops as the stick tilts (the field rotates
//                        rather than only growing, which keeps |B| roughly flat)
const SIM_DIFF_BASE_MT_MM = 6.5;
const SIM_DIFF_SWEEP_DEG = GIMBAL_FULL_SCALE_DEG;
const SIM_TILT_Z_DROP_MT = 8.0;

// The differential formula yields atan2(dBx/dx, dBz/dx) (and its Y sibling),
// which spans -180..180, while every downstream consumer — the radar's
// (90 - a) / 90 mapping (0° at the right rim, 180° at the left), the #angle-*
// readouts, the gimbal's 90° neutral — expects the 0..180° band the 1px/Desmos
// path already produces. Fold the signed angle onto that band with a triangle
// wave (|angle| over the range): continuous at 0 and at ±180, so the needle
// never snaps across the dial, and it still fixes the original freeze (a
// reversed polarity / mirrored mount, X02 < 0 → α ≈ -90°, now reads 90° and
// sweeps). Do NOT re-base mod 180: that makes α and α+180 collide, so crossing
// 0°/±180° flips the needle to the opposite rim.
function toDialAngleDeg(deg) {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 90;

  let out = deg % 360;
  if (out < 0) out += 360;
  if (out > 180) out = 360 - out;
  return out;
}

// Display convention: screen right = +X, screen up = +Y. The stick command
// (joyX, joyY) maps straight through to the dome lean, the field plots and the
// radars - no axis is pre-flipped, so every view agrees on which way "up" is.
// If the physical sensor turns out to be mounted mirrored, correct it once in
// the hardware decode, not separately in each consumer.

// A button press is defined by the differential gradient magnitude crossing
// ~10 mT/mm (lowered from 20 so the simulated sweep can actually reach it).
// Below that it reads "no press"; the two field-strength hats on the radars flag
// weak / missing magnets (values are adjustable).
// Default only: the "push at" field on the 3D Joystick Model tab sets the live
// value (remembered per browser), because the magnitude a real press reaches
// depends on the rig, the magnet and the 2px gain.
const SFI_PRESS_THRESHOLD_DEFAULT_MT_MM = 10;
const PRESS_THRESHOLD_STORAGE_KEY = 'sfi.pressThresholdMtMm';
let pressThresholdMtMm = SFI_PRESS_THRESHOLD_DEFAULT_MT_MM;
const WEAK_MAG_STD_MT = 8;
const NO_MAG_STD_MT = 2;
const WEAK_MAG_DIFF_MT_MM = 3;
const NO_MAG_DIFF_MT_MM = 1;

// --- Stray field coil controls ---
// The button is a timed pulse, never a latch: the coil energises, the badge counts
// the dwell down, and the pin is driven low again when it hits zero. Clicking while
// a pulse is running aborts it early instead of queueing a second one.
// This module only renders and counts; app.js owns the pin and the authoritative
// shut-off timer.
const COIL_DWELL_DEFAULT_S = 5;
const COIL_DWELL_MIN_S = 0.5;
const COIL_DWELL_MAX_S = 60;

let onHardwareCoilCommand = null;
let coilView = { active: false, hardware: false, fault: false, endsAt: 0 };
let coilCountdownTimer = null;
let coilStartPending = false;

export function setHardwareCoilCallback(cb) {
  onHardwareCoilCommand = cb;
}

function clampCoilDwellS(value) {
  const parsed = parseFloat(value);
  if (!isFinite(parsed)) return COIL_DWELL_DEFAULT_S;
  return Math.min(COIL_DWELL_MAX_S, Math.max(COIL_DWELL_MIN_S, parsed));
}

export { clampCoilDwellS };

function coilRemainingS() {
  return Math.max(0, (coilView.endsAt - Date.now()) / 1000);
}

function renderCoilState() {
  const btnCoil = document.getElementById('btn-coil');
  const btnCoilToggle = document.getElementById('btn-coil-toggle');
  const dwellInput = document.getElementById('coil-dwell-seconds');
  const panelLbl = document.getElementById('coil-readout-lbl');

  // The dwell is latched when the pulse starts, so it cannot be edited mid-pulse.
  if (dwellInput) dwellInput.disabled = coilView.active;

  const fault = coilView.fault;
  const remaining = coilRemainingS().toFixed(1);

  // Kept in sync for the Requirement 4 panel, which is hidden by default but
  // stays correct if it is ever brought back.
  if (panelLbl) {
    if (fault) {
      panelLbl.textContent = 'COIL: FAULT — NOT DRIVEN';
      panelLbl.style.color = '#ef4444';
    } else if (coilView.active) {
      panelLbl.textContent = `COIL: ACTIVE (+5.0 mT STRAY FIELD, ${remaining}s)`;
      panelLbl.style.color = '#ef4444';
    } else {
      panelLbl.textContent = 'COIL: OFF (0.0 mT)';
      panelLbl.style.color = '#94a3b8';
    }
  }

  // The button is the only visible surface for the coil now, so the fault has to
  // read on it rather than on a readout that is no longer there.
  if (btnCoil) {
    btnCoil.classList.toggle('ds-button--on', coilView.active && !fault);
    btnCoil.classList.toggle('ds-button--fault', fault);
    if (fault) {
      btnCoil.textContent = 'Coil Fault — A0 not driven';
      btnCoil.title = 'The last pulse could not energise the coil. A0 is held low — press to try again.';
    } else {
      btnCoil.textContent = coilView.active ? `Coil ON — ${remaining}s` : 'Stray Field Coil (5 mT)';
      if (coilView.active) {
        // The real/simulated distinction now lives only here, so it has to be
        // stated explicitly rather than colour-coded.
        btnCoil.title = coilView.hardware
          ? 'Melexis IO A0 is driving the MOSFET gate. Click to drop the coil now instead of waiting out the pulse'
          : 'No Melexis IO link — this pulse is simulated and drives no pin. Click to stop it.';
      } else {
        btnCoil.title = 'Pulse the 5 mT stray field coil on Melexis IO pin A0';
      }
    }
  }

  if (btnCoilToggle) {
    btnCoilToggle.classList.toggle('ds-button--on', coilView.active && !fault);
    btnCoilToggle.classList.toggle('ds-button--fault', fault);
    btnCoilToggle.textContent = fault
      ? 'Retry Coil Pulse'
      : (coilView.active ? 'Abort Coil Pulse' : 'Pulse Coil (5 mT)');
  }
}

export function setCoilState(next) {
  coilView = {
    active: Boolean(next && next.active),
    hardware: Boolean(next && next.hardware),
    fault: Boolean(next && next.fault),
    endsAt: (next && next.endsAt) || 0
  };

  if (coilCountdownTimer !== null) {
    clearInterval(coilCountdownTimer);
    coilCountdownTimer = null;
  }

  renderCoilState();

  if (coilView.active) {
    coilCountdownTimer = setInterval(renderCoilState, 100);
  }
}

export function initCoilControls() {
  const btnCoil = document.getElementById('btn-coil');
  const btnCoilToggle = document.getElementById('btn-coil-toggle');
  const dwellInput = document.getElementById('coil-dwell-seconds');

  const onCoilClick = async () => {
    if (coilView.active) {
      if (typeof onHardwareCoilCommand === 'function') {
        try {
          await onHardwareCoilCommand({ action: 'off' });
        } catch (err) {
          console.warn('[COIL] abort failed', err);
        }
      }
      return;
    }

    if (coilStartPending) return;
    coilStartPending = true;

    const dwellS = clampCoilDwellS(dwellInput ? dwellInput.value : COIL_DWELL_DEFAULT_S);
    if (dwellInput) dwellInput.value = String(dwellS);

    try {
      if (typeof onHardwareCoilCommand === 'function') {
        await onHardwareCoilCommand({ action: 'pulse', dwellS });
      } else {
        // No bridge attached: run the dwell locally so the UI stays testable.
        setCoilState({ active: true, hardware: false, endsAt: Date.now() + dwellS * 1000 });
        setTimeout(() => setCoilState({ active: false, hardware: false }), dwellS * 1000);
      }
    } catch (err) {
      console.warn('[COIL] pulse request failed', err);
    } finally {
      coilStartPending = false;
    }
  };

  btnCoil?.addEventListener('click', onCoilClick);
  btnCoilToggle?.addEventListener('click', onCoilClick);

  setCoilState({ active: false, hardware: false });
}

// Off hands the views back to the simulation (Auto-Pattern, if it is on).
// keepZero: Stop keeps the captured Zero Position, so the next Start on the
// same board does not need re-zeroing; a disconnect clears it.
export function setSfiHardwareTracking(enabled, { keepZero = false } = {}) {
  isLiveHardwareConnected = Boolean(enabled);
  if (!isLiveHardwareConnected) {
    liveHardwarePacket = null;
    liveSfiAngles = { alpha: 90, beta: 90 };
    targetJoyX = 0;
    targetJoyY = 0;
    targetJoyZ = 0;
    if (!keepZero) {
      gimbalZeroAngles = { alpha: 90, beta: 90 };
      const zeroStatus = document.getElementById('gimbal-zero-status');
      if (zeroStatus) zeroStatus.textContent = 'Zero: α 90.0°, β 90.0°';
    }
  }
}

function setAutoPattern(on) {
  autoPattern = on;
  const btn = document.getElementById('btn-pattern');
  if (btn) {
    btn.style.opacity = on ? '1' : '0.5';
    btn.setAttribute('aria-pressed', String(on));
  }
}

export function updateSfiDomeKinematics(x, y, z, telemetryPayload = null) {
  targetJoyX = Math.max(-1, Math.min(1, x));
  targetJoyY = Math.max(-1, Math.min(1, y));
  targetJoyZ = Math.max(-1, Math.min(1, z));

  if (telemetryPayload) {
    liveHardwarePacket = telemetryPayload;
  }
}

export function updateSfiHardwareTelemetry(telemetryPayload) {
  liveHardwarePacket = telemetryPayload;
}

// Copper band in the slot of each coil former (CAD node 1317-Coils45mm-1),
// so the empty spools read as wound coils. Plain colour, no texture. It is a
// child of the former, so it shares the former's transform and stays put.
// Dimensions are measured from the GLB in the former's local frame (metres):
// spool axis = local X, slots centred at x = 0 and x = -36 mm, 7 mm between
// the flanges. The flanges are cut flat at y = +-25.5 mm, so the band stops at
// 25 mm and never shows past them. Only the outer face is drawn: the ends sit
// against the flanges and are never seen.
const COIL_WINDING = {
  slotCentresX: [0, -0.036],
  radius: 0.025,
  width: 0.0069
};
const COIL_COPPER = { color: 0xc8521c, emissive: 0x401204, metalness: 0.45, roughness: 0.35 };

function addCoilWindings(coilFormer) {
  const material = new THREE.MeshStandardMaterial(COIL_COPPER);
  // CylinderGeometry runs along Y; turn it onto the spool axis (X).
  const geometry = new THREE.CylinderGeometry(
    COIL_WINDING.radius, COIL_WINDING.radius, COIL_WINDING.width, 96, 1, true
  );
  geometry.rotateZ(Math.PI / 2);
  COIL_WINDING.slotCentresX.forEach((x, i) => {
    const winding = new THREE.Mesh(geometry, material);
    winding.name = `coil-winding-${i + 1}`;
    winding.position.x = x;
    coilFormer.add(winding);
  });
}

// Field lines of the stray field coil, always shown (not tied to the coil
// button) so the model always shows what the coil does.
// The two windings are a coaxial pair on the former's X axis, driven with the
// same current sense, so between them the field runs straight along the axis
// and is close to uniform; outside it bends round and closes on itself. The
// sensor board sits exactly halfway between the coils (x = -18 mm, measured
// from the GLB), i.e. in that uniform region: the differential channels see
// the same field on every pixel and cancel it, the single-pixel ones do not.
// The lines are traced through a Biot-Savart model of the two loops, in the
// former's local frame (metres), and drawn dim with dots drifting along B.
const COIL_FIELD = {
  pairCentreX: -0.018,
  loopSegments: 72,
  step: 0.0012,          // trace step, m
  maxSteps: 600,
  extent: 0.05,          // stop tracing this far from the pair centre (inside the dome), m
  // Seeds: through both coils on the mid-plane, and round each winding.
  midRadii: [0.007, 0.0135, 0.019],
  outerRadius: 0.036,
  azimuths: 6,
  dotSpacing: 0.012,     // one moving dot per this much line length, m
  dotSpeed: 0.022,       // m/s in the uniform region, scaled by |B| elsewhere
  color: 0x64bcaa,
  lineOpacity: 0.32
};

let coilFieldViz = null;

function makeCoilPairField() {
  const { loopSegments: n } = COIL_FIELD;
  const R = COIL_WINDING.radius;
  const segs = [];
  COIL_WINDING.slotCentresX.forEach((cx) => {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = new THREE.Vector3(cx, R * Math.cos(a0), R * Math.sin(a0));
      const p1 = new THREE.Vector3(cx, R * Math.cos(a1), R * Math.sin(a1));
      segs.push({ mid: p0.clone().add(p1).multiplyScalar(0.5), dl: p1.clone().sub(p0) });
    }
  });
  const r = new THREE.Vector3();
  const c = new THREE.Vector3();
  // Biot-Savart sum, arbitrary units (normalised below).
  const raw = (p, out) => {
    out.set(0, 0, 0);
    for (const s of segs) {
      r.subVectors(p, s.mid);
      const d = Math.max(r.length(), 0.002);
      out.add(c.crossVectors(s.dl, r).multiplyScalar(1 / (d * d * d)));
    }
    return out;
  };
  // 1.0 = the field at the sensor, the "5 mT" the demo injects.
  const ref = raw(new THREE.Vector3(COIL_FIELD.pairCentreX, 0, 0), new THREE.Vector3()).length();
  return (p, out) => raw(p, out).multiplyScalar(1 / ref);
}

// RK4 along the unit field direction; sign -1 traces against B.
function traceFieldLine(field, seed, sign) {
  const { step, maxSteps, extent, pairCentreX } = COIL_FIELD;
  const centre = new THREE.Vector3(pairCentreX, 0, 0);
  const pts = [seed.clone()];
  const p = seed.clone();
  const k = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const tmp = new THREE.Vector3();
  const dir = (q, out) => {
    field(q, out);
    const m = out.length();
    return m > 1e-9 ? out.multiplyScalar(sign / m) : out.set(0, 0, 0);
  };
  for (let i = 0; i < maxSteps; i++) {
    dir(p, k[0]);
    dir(tmp.copy(p).addScaledVector(k[0], step / 2), k[1]);
    dir(tmp.copy(p).addScaledVector(k[1], step / 2), k[2]);
    dir(tmp.copy(p).addScaledVector(k[2], step), k[3]);
    p.addScaledVector(k[0], step / 6).addScaledVector(k[1], step / 3)
      .addScaledVector(k[2], step / 3).addScaledVector(k[3], step / 6);
    pts.push(p.clone());
    if (i > 20 && p.distanceTo(seed) < step * 1.5) return { pts, closed: true };
    if (p.distanceTo(centre) > extent) break;
  }
  return { pts, closed: false };
}

function dotSprite() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function addCoilFieldLines(coilFormer) {
  const field = makeCoilPairField();
  const seeds = [];
  const { azimuths, midRadii, outerRadius, pairCentreX } = COIL_FIELD;
  midRadii.forEach((rad, ri) => {
    for (let a = 0; a < azimuths; a++) {
      const phi = ((a + ri / midRadii.length) / azimuths) * Math.PI * 2;
      seeds.push(new THREE.Vector3(pairCentreX, rad * Math.cos(phi), rad * Math.sin(phi)));
    }
  });
  COIL_WINDING.slotCentresX.forEach((cx) => {
    for (let a = 0; a < azimuths; a++) {
      const phi = ((a + 0.5) / azimuths) * Math.PI * 2;
      seeds.push(new THREE.Vector3(cx, outerRadius * Math.cos(phi), outerRadius * Math.sin(phi)));
    }
  });

  const base = new THREE.Color(COIL_FIELD.color);
  const strength = new THREE.Vector3();
  const lines = [];
  const linePositions = [];
  const lineColors = [];
  seeds.forEach((seed) => {
    const fwd = traceFieldLine(field, seed, 1);
    let pts = fwd.pts;
    if (!fwd.closed) {
      // Open within the traced extent: add the part behind the seed too.
      const back = traceFieldLine(field, seed, -1).pts.reverse();
      pts = back.concat(pts.slice(1));
    }
    const cum = [0];
    const mags = [];
    pts.forEach((pt, i) => {
      if (i > 0) cum.push(cum[i - 1] + pt.distanceTo(pts[i - 1]));
      mags.push(field(pt, strength).length());
    });
    lines.push({ pts, cum, mags, length: cum[cum.length - 1], closed: fwd.closed });
    // Brightness follows |B|, so the lines fade out where the field is weak.
    for (let i = 1; i < pts.length; i++) {
      [i - 1, i].forEach((j) => {
        linePositions.push(pts[j].x, pts[j].y, pts[j].z);
        const b = Math.min(1, Math.max(0.05, Math.pow(mags[j], 0.6)));
        lineColors.push(base.r * b, base.g * b, base.b * b);
      });
    }
  });

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  lineGeom.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const lineMesh = new THREE.LineSegments(lineGeom, lineMat);

  const dots = [];
  lines.forEach((line, li) => {
    const count = Math.max(1, Math.round(line.length / COIL_FIELD.dotSpacing));
    for (let d = 0; d < count; d++) dots.push({ line: li, s: (d / count) * line.length });
  });
  const dotPositions = new Float32Array(dots.length * 3);
  const dotGeom = new THREE.BufferGeometry();
  dotGeom.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
  const dotMat = new THREE.PointsMaterial({
    color: 0xc9fff2, size: 5, sizeAttenuation: false, map: dotSprite(),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const dotMesh = new THREE.Points(dotGeom, dotMat);

  const group = new THREE.Group();
  group.name = 'coil-field-lines';
  group.visible = false;
  group.add(lineMesh, dotMesh);
  coilFormer.add(group);

  return { group, lines, dots, dotPositions, dotGeom, lineMat, dotMat, level: 0 };
}

// Point and |B| at arc length s along a traced line.
function sampleFieldLine(line, s, out) {
  const { cum, pts, mags } = line;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = (s - cum[lo]) / span;
  out.lerpVectors(pts[lo], pts[hi], t);
  return mags[lo] + (mags[hi] - mags[lo]) * t;
}

function updateCoilField(viz, dt) {
  // Always on; the level only fades the lines in once, when the model loads.
  viz.level += (1 - viz.level) * (1 - Math.exp(-8 * dt));
  viz.group.visible = true;

  viz.lineMat.opacity = COIL_FIELD.lineOpacity * viz.level;
  viz.dotMat.opacity = 0.85 * viz.level;

  const p = new THREE.Vector3();
  viz.dots.forEach((dot, i) => {
    const line = viz.lines[dot.line];
    const mag = sampleFieldLine(line, dot.s, p);
    // Faster where the field is stronger, so the dots also show its strength.
    dot.s += COIL_FIELD.dotSpeed * Math.min(2.5, Math.max(0.3, mag)) * dt;
    if (dot.s > line.length) dot.s = line.closed ? dot.s - line.length : 0;
    viz.dotPositions[i * 3] = p.x;
    viz.dotPositions[i * 3 + 1] = p.y;
    viz.dotPositions[i * 3 + 2] = p.z;
  });
  viz.dotGeom.attributes.position.needsUpdate = true;
}

// SFI logo as a sticker on the base (CAD part 1317-BaseBody-2: 108.8 mm
// across). It is a slice of a cylinder a hair outside the base, so it wraps
// round it like a printed label. Placed by eye: turned 0.562 rad (32.2°) to the
// left of the side facing the camera's starting position, centred at
// y = -15.2 mm in the model's own frame, 25 mm tall.
// Image: SFI_logo_2022.png cropped, white knocked out.
const SFI_STICKER = {
  url: 'resources/sfi_sticker.png',
  aspect: 1024 / 771,
  partName: '1317-BaseBody-2',
  standOff: 0.0003,      // m outside the base, so it never z-fights it
  turn: -0.5622,         // rad round the base, negative = to the left
  centreY: -0.0152,      // m
  height: 0.025          // m
};

function addSfiSticker(model, facePoint, renderer) {
  const base = model.getObjectByName(SFI_STICKER.partName);
  if (!base) {
    console.warn('[CAD GLB] Base node not found; no SFI sticker.');
    return;
  }
  // Measured in the model's own frame (scale and offset taken out).
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3().setFromObject(base).applyMatrix4(toModel);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = (box.max.x - box.min.x) / 2 + SFI_STICKER.standOff;
  const local = model.worldToLocal(facePoint.clone());
  const facing = Math.atan2(local.x - centre.x, local.z - centre.z) + SFI_STICKER.turn;
  const arc = (SFI_STICKER.height * SFI_STICKER.aspect) / radius;

  const texture = new THREE.TextureLoader().load(SFI_STICKER.url);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sticker = new THREE.Mesh(
    // Cylinder angles run from +Z towards +X, so from outside the image reads
    // left to right, not mirrored.
    new THREE.CylinderGeometry(radius, radius, SFI_STICKER.height, 48, 1, true, facing - arc / 2, arc),
    // Unlit and not tone mapped: printed brand colours, not the scene's
    // cyan-tinted light (which washed the navy out to light blue).
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2
    })
  );
  sticker.name = 'sfi-sticker';
  sticker.position.set(centre.x, SFI_STICKER.centreY, centre.z);
  model.add(sticker);
}

let christmasHat = null;

// Christmas hat on the knob, shown together with the snow. Built round the knob's radius r (world units)
// with its base at y = 0: a red cone whose top flops over to one side, a white
// brim and a pompom on the tip.
function makeChristmasHat(r) {
  const group = new THREE.Group();
  group.name = 'christmas-hat';
  const red = new THREE.MeshStandardMaterial({ color: 0xd0142c, roughness: 0.75 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 1 });

  const h = r * 2.6;
  const droop = r * 1.2;
  const cone = new THREE.ConeGeometry(r, h, 40, 20, true);
  cone.translate(0, h / 2, 0);
  // Bend the upper part sideways (and a little down) so it hangs like cloth.
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / h;
    pos.setX(i, pos.getX(i) + droop * t * t * t);
    pos.setY(i, pos.getY(i) - droop * 0.4 * t * t * t * t);
  }
  cone.computeVertexNormals();
  group.add(new THREE.Mesh(cone, red));

  const brim = new THREE.TorusGeometry(r, r * 0.24, 16, 48);
  brim.rotateX(Math.PI / 2);
  group.add(new THREE.Mesh(brim, white));

  const pompom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 20, 14), white);
  pompom.position.set(droop, h - droop * 0.4, 0);
  group.add(pompom);
  return group;
}

// Puts the hat on top of the knob and parents it to the knob, so it tilts and
// presses with the stick. Measured with the stick upright at its rest pose.
function addChristmasHat(knob, assembly, restPosition) {
  const savedQuat = assembly.quaternion.clone();
  const savedPos = assembly.position.clone();
  assembly.quaternion.identity();
  assembly.position.copy(restPosition);
  assembly.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(knob);
  const size = box.getSize(new THREE.Vector3());
  const r = Math.min(size.x, size.z) / 2 * 1.08;
  const hat = makeChristmasHat(r);
  // Sit it down over the top edge of the knob, like a hat on a head.
  hat.position.set((box.min.x + box.max.x) / 2, box.max.y - r * 0.35, (box.min.z + box.max.z) / 2);
  hat.updateMatrixWorld(true);
  knob.attach(hat);
  // Worn only while it snows (the Snow button).
  christmasHat = hat;
  hat.visible = Boolean(snowViz && snowViz.on);

  assembly.quaternion.copy(savedQuat);
  assembly.position.copy(savedPos);
  assembly.updateMatrixWorld(true);
}

// Snow round the 3D model, toggled by the Snow button. Flakes fall through a
// box around the model in world units (the dome is 5.2 high) and sway as they
// go; depth testing lets the model hide the ones behind it.
const SNOW = {
  count: 1800,
  halfWidth: 40,
  top: 30,
  bottom: -15,
  fallSpeed: [1.5, 3.5],   // world units/s
  sway: 0.9,
  size: 0.75,
  opacity: 0.85,
  storageKey: 'sfi-snow'
};

let snowViz = null;

function createSnow(scene) {
  const { count, halfWidth, top, bottom, fallSpeed } = SNOW;
  const positions = new Float32Array(count * 3);
  const flakes = [];
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(-halfWidth, halfWidth);
    positions[i * 3 + 1] = rand(bottom, top);
    positions[i * 3 + 2] = rand(-halfWidth, halfWidth);
    flakes.push({ speed: rand(fallSpeed[0], fallSpeed[1]), phase: rand(0, Math.PI * 2), freq: rand(0.4, 1.1) });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffffff, size: SNOW.size, sizeAttenuation: true, map: dotSprite(),
    transparent: true, opacity: 0, depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'snow';
  points.visible = false;
  // The box is wider than the view, so never cull it as a whole.
  points.frustumCulled = false;
  scene.add(points);
  return { points, positions, geometry, material, flakes, on: false, level: 0, time: 0 };
}

function updateSnow(viz, dt) {
  viz.level += ((viz.on ? 1 : 0) - viz.level) * (1 - Math.exp(-3 * dt));
  if (!viz.on && viz.level < 0.01) viz.level = 0;
  viz.points.visible = viz.level > 0;
  if (!viz.points.visible) return;
  viz.material.opacity = SNOW.opacity * viz.level;
  viz.time += dt;

  const { positions, flakes } = viz;
  const { top, bottom, halfWidth, sway } = SNOW;
  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    const k = i * 3;
    positions[k] += Math.sin(viz.time * f.freq + f.phase) * sway * dt;
    positions[k + 1] -= f.speed * dt;
    positions[k + 2] += Math.cos(viz.time * f.freq * 0.8 + f.phase) * sway * 0.6 * dt;
    if (positions[k + 1] < bottom) {
      positions[k] = -halfWidth + Math.random() * halfWidth * 2;
      positions[k + 1] = top;
      positions[k + 2] = -halfWidth + Math.random() * halfWidth * 2;
    }
  }
  viz.geometry.attributes.position.needsUpdate = true;
}

function initSnowToggle(scene) {
  snowViz = createSnow(scene);
  const btn = document.getElementById('btn-snow');
  const set = (on) => {
    snowViz.on = on;
    if (christmasHat) christmasHat.visible = on;
    placeWallpaperHat();
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Stop snow' : 'Snow';
    }
    try { localStorage.setItem(SNOW.storageKey, on ? '1' : '0'); } catch (_) { /* not remembered */ }
  };
  btn?.addEventListener('click', () => set(!snowViz.on));
  let saved = false;
  try { saved = localStorage.getItem(SNOW.storageKey) === '1'; } catch (_) { /* default off */ }
  set(saved);
}

// Christmas hat on the man in the "City at night" wallpaper, shown with the
// snow. The wallpaper is a CSS cover image, so the hat (#wallpaper-hat, drawn
// in wallpaper pixels) is placed with the same cover maths each time the view
// changes size. image/pos must match city_bg.jpg and its CSS "center 75%".
const WALLPAPER_HAT = {
  imageW: 2560,
  imageH: 1603,
  posX: 0.5,
  posY: 0.75,
  anchor: [335, 1012],         // brim centre on the head, wallpaper pixels
  box: [-150, -210, 300, 240]  // the SVG's viewBox
};

function placeWallpaperHat() {
  const container = document.getElementById('canvas3d-container');
  const hat = document.getElementById('wallpaper-hat');
  if (!container || !hat) return;
  const show = container.dataset.bg === 'city' && Boolean(snowViz && snowViz.on);
  hat.style.display = show ? 'block' : 'none';
  if (!show) return;

  const { imageW, imageH, posX, posY, anchor, box } = WALLPAPER_HAT;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const s = Math.max(w / imageW, h / imageH);
  const offX = (w - imageW * s) * posX;
  const offY = (h - imageH * s) * posY;
  hat.style.left = `${offX + (anchor[0] + box[0]) * s}px`;
  hat.style.top = `${offY + (anchor[1] + box[1]) * s}px`;
  hat.style.width = `${box[2] * s}px`;
  hat.style.height = `${box[3] * s}px`;
}

// "background" dropdown on the 3D tab: sets data-bg on the view, and the CSS
// picks the image. The renderer clears to transparent, so it shows through.
const BACKGROUND_STORAGE_KEY = 'sfi-3d-background';

function initBackgroundSelect(container) {
  const select = document.getElementById('sel-3d-background');
  if (!select) return;
  const apply = (value) => {
    if (![...select.options].some((o) => o.value === value)) value = select.options[0].value;
    select.value = value;
    container.dataset.bg = value;
    placeWallpaperHat();
  };
  select.addEventListener('change', () => {
    apply(select.value);
    try { localStorage.setItem(BACKGROUND_STORAGE_KEY, select.value); } catch (_) { /* not remembered */ }
  });
  let saved = null;
  try { saved = localStorage.getItem(BACKGROUND_STORAGE_KEY); } catch (_) { /* default */ }
  apply(saved || select.value);
  // The cover image rescales with the view, so the wallpaper hat follows it.
  if (typeof ResizeObserver === 'function') new ResizeObserver(placeWallpaperHat).observe(container);
}

export function initSfiDemo() {
  const container = document.getElementById('canvas3d-container');
  if (!container || !window.THREE) return;
  initBackgroundSelect(container);

  const btnPattern = document.getElementById('btn-pattern');
  const btnResetTrace = document.getElementById('btn-reset-trace');
  const btnZeroGimbal = document.getElementById('btn-zero-gimbal');
  const gimbalZeroStatus = document.getElementById('gimbal-zero-status');
  btnPattern?.addEventListener('click', () => setAutoPattern(!autoPattern));
  setAutoPattern(autoPattern);

  btnResetTrace?.addEventListener('click', () => {
    resetPlotLines();
  });

  btnZeroGimbal?.addEventListener('click', () => {
    gimbalZeroAngles = { ...liveSfiAngles };
    if (gimbalZeroStatus) {
      gimbalZeroStatus.textContent =
        `Zero captured: α ${gimbalZeroAngles.alpha.toFixed(1)}°, β ${gimbalZeroAngles.beta.toFixed(1)}°`;
    }
  });

  // "push at" field: the press magnitude (mT/mm) at which the knob reads
  // PUSHED. Remembered per browser; storage can be unavailable (private
  // window, blocked site data), in which case it just starts at the default.
  const pressInput = document.getElementById('press-threshold');
  if (pressInput) {
    try {
      const saved = parseFloat(localStorage.getItem(PRESS_THRESHOLD_STORAGE_KEY));
      if (Number.isFinite(saved) && saved > 0) pressThresholdMtMm = saved;
    } catch (_) { /* no storage: keep the default */ }
    pressInput.value = String(pressThresholdMtMm);
    pressInput.addEventListener('input', () => {
      const v = parseFloat(pressInput.value);
      if (!Number.isFinite(v) || v <= 0) return;
      pressThresholdMtMm = v;
      try { localStorage.setItem(PRESS_THRESHOLD_STORAGE_KEY, String(v)); } catch (_) { /* not persisted */ }
    });
  }

  // One shared Zero button centres BOTH 3D field plots on their grids by
  // capturing each plot's current bias as its zero offset; pressing again
  // clears both.
  const btnZeroPlots = document.getElementById('btn-zero-plots');
  btnZeroPlots?.addEventListener('click', () => {
    const state = zeroAllPlots();
    if (state === 'captured') btnZeroPlots.textContent = 'Zeroed';
    else if (state === 'cleared') btnZeroPlots.textContent = 'Zero Graphs';
  });

  // --- 1. THREE.JS SCENE SETUP (CAD GLB MODEL) ---
  const scene = new THREE.Scene();
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 560;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 60;

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const dirLight = new THREE.DirectionalLight(0x00d2ff, 1.4);
  dirLight.position.set(10, 25, 15);
  scene.add(dirLight);
  const hemiLight = new THREE.HemisphereLight(0xb0d0ff, 0x334455, 0.6);
  scene.add(hemiLight);

  initSnowToggle(scene);

  const MODEL_URL = 'resources/1317-500-JoystickDemonstratorMLX90396.glb';
  const DOME_WORLD_RADIUS = 5.2;

  const joyAssembly = new THREE.Group();
  joyAssemblyRef = joyAssembly;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let isDraggingKnob = false;

  function setupMouseInteractions(interactiveObj) {
    // Pointer events in the capture phase: OrbitControls preventDefaults its
    // pointerdown, which cancels the compatibility mousedown, so a mousedown
    // listener here never fired and the knob could not be dragged. Capturing
    // also lets a knob grab disable the orbit before OrbitControls sees it.
    container.addEventListener('pointerdown', (e) => {
      // Only presses on the 3D view itself (not the logo overlay).
      if (e.target !== renderer.domElement) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      if ((interactiveObj && raycaster.intersectObject(interactiveObj, true).length > 0) || e.shiftKey) {
        isDraggingKnob = true;
        controls.enabled = false;
        // While live the board drives the knob, so leave Auto-Pattern as it
        // is for when the stream stops.
        if (!isLiveHardwareConnected) setAutoPattern(false);
      }
    }, true);

    window.addEventListener('pointermove', (e) => {
      if (!isDraggingKnob) return;
      targetJoyX = Math.max(-1, Math.min(1, (((e.clientX - renderer.domElement.getBoundingClientRect().left) / container.clientWidth) * 2 - 1) * 1.5));
      targetJoyY = Math.max(-1, Math.min(1, (-((e.clientY - renderer.domElement.getBoundingClientRect().top) / container.clientHeight) * 2 + 1) * 1.5));
    });

    window.addEventListener('pointerup', () => {
      if (isDraggingKnob) {
        isDraggingKnob = false;
        controls.enabled = true;
      }
    });
  }

  const loadingHint = container.querySelector('.hint-overlay');
  if (loadingHint) loadingHint.textContent = 'Loading 3D model…';

  (async () => {
    try {
      const GLTFLoaderClass = await ensureGLTFLoader();
      const gltf = await new GLTFLoaderClass().loadAsync(MODEL_URL);
      const model = gltf.scene;

      // Remove CAD camera nodes; they are not part of the visible model.
      const cameraNodes = [];
      model.traverse((node) => {
        if (node.isCamera) cameraNodes.push(node);
      });
      cameraNodes.forEach((node) => node.parent && node.parent.remove(node));

      // The Melexis IO board is 859,584 of this model's 1,042,774 triangles (82%)
      // and sits inside the housing, so it is never actually seen. Hide it rather
      // than remove it: three skips invisible objects entirely (no draw call, no
      // vertex work, no GPU upload), while Box3.setFromObject still includes it,
      // so the dome scaling and X/Z centring below are unchanged.
      const ioBoard = model.getObjectByName('Melexisio_V12(A)-1');
      if (ioBoard) {
        ioBoard.visible = false;
      } else {
        console.warn('[CAD GLB] Melexis IO board node not found; nothing hidden.');
      }

      const coilFormer = model.getObjectByName('1317-Coils45mm-1');
      if (coilFormer) {
        addCoilWindings(coilFormer);
        coilFieldViz = addCoilFieldLines(coilFormer);
      } else {
        console.warn('[CAD GLB] Coil former node not found; no windings drawn.');
      }

      // Reparent the moving joystick parts (as whole top-level nodes) into the
      // animated assembly group. Moving whole subtrees keeps every child's
      // transform (e.g. the magnet under the assembly node) intact. Static by
      // construction: dome, base, PCB, connector, compass/coil, and the
      // Melexis IO / EVB boards. Root group = 1317-500-JoystickDemonstrator.
      // NOTE: three.js sanitizes glTF names (spaces -> '_', '.'/':'/'/'/'['/']'
      // stripped), so these must be the sanitized names.
      const STATIC_PART_NAMES = new Set([
        '1317-DomeAssy',
        '1317-TestCompass2-1',
        '1317-Coils45mm-1',
        '1317-BaseBody-2',
        '1317-BodyCap-1',
        '1317-PCBholder-1',
        '1317-BottomBase-1',
        '5991_HUSB238_USBC-1',
        '1317-PcbStop-1',
        'Melexisio_V12(A)-1',
        'EVB90396(A)_(1)-1',
        'current_camera'
      ]);
      const isStaticName = (name) =>
        STATIC_PART_NAMES.has(name) || name === '' || name.includes('_instance_');

      const partsContainer = model.getObjectByName('1317-500-JoystickDemonstrator') || model;
      const movingParts = [];
      Array.from(partsContainer.children).forEach((child) => {
        if (!isStaticName(child.name)) movingParts.push(child);
      });
      movingParts.forEach((node) => {
        // The CAD assembly ships with a rest lean: 1317-501-JoystickAssembly
        // carries a ~12° rotation about Z, which tips the whole stick to one
        // side even at neutral. Cancel it so the shaft stands vertical; the
        // gimbal then adds the live tilt (joyAssembly.quaternion) on top.
        node.quaternion.identity();
        joyAssembly.add(node);
      });
      console.log('[CAD GLB] moving parts:', movingParts.map((n) => n.name));

      scene.add(model);
      if (joyAssembly.children.length > 0) scene.add(joyAssembly);

      // Normalize the CAD dome radius to the world scale used by dome kinematics.
      const domeNode = model.getObjectByName('1317-DomeAssy') || model.getObjectByName('1317-Dome-1') || model;
      const domeBox = new THREE.Box3().setFromObject(domeNode);
      const domeHeight = Math.max(0.0001, domeBox.max.y - domeBox.min.y);
      const scale = DOME_WORLD_RADIUS / domeHeight;
      model.scale.setScalar(scale);
      if (joyAssembly.children.length > 0) joyAssembly.scale.setScalar(scale);

      // Center on X/Z.
      const wholeBox = new THREE.Box3().setFromObject(model);
      const center = wholeBox.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.z = -center.z;
      if (joyAssembly.children.length > 0) {
        // Keep the assembly at its CAD rest position so the magnet keeps its
        // ~6 mm CAD airgap above the sensor when untilted.
        joyAssembly.position.x = -center.x;
        joyAssembly.position.z = -center.z;
        joyRestPosition.copy(joyAssembly.position);
      }

      // Frame the camera on the model bounding box.
      const finalBox = new THREE.Box3().setFromObject(model);
      const size = finalBox.getSize(new THREE.Vector3());
      const yCenter = (finalBox.min.y + finalBox.max.y) / 2;
      controls.target.set(0, yCenter, 0);
      controls.update();
      camera.position.set(size.x * 1.5, yCenter + size.y * 0.8, size.z * 2.1);
      camera.lookAt(controls.target);
      addSfiSticker(model, camera.position, renderer);

      if (loadingHint) loadingHint.textContent = 'Fixed XYZ view | Scroll: Zoom';

      // Gimbal pivot at the middle of the sensor board — the blue EVB90396 PCB
      // sitting under the magnet. It is a static part, so it is read from the
      // model, not the moving assembly. The stick leans about the board centre
      // instead of swinging around the ball joint.
      const boardNode = model.getObjectByName('EVB90396(A)_(1)-1');
      const jointNode = joyAssembly.getObjectByName('1317-JoystickInnerPart-1');
      joyAssembly.updateMatrixWorld(true);
      model.updateMatrixWorld(true);
      const pivotBox = new THREE.Box3().setFromObject(boardNode || jointNode || joyAssembly);
      joyPivotPoint.set(
        (pivotBox.min.x + pivotBox.max.x) / 2,
        (pivotBox.min.y + pivotBox.max.y) / 2,
        (pivotBox.min.z + pivotBox.max.z) / 2
      );

      const knob = joyAssembly.getObjectByName('1317-JoystickButton-1') || joyAssembly;
      setupMouseInteractions(knob);
      if (knob !== joyAssembly) addChristmasHat(knob, joyAssembly, joyRestPosition);

      // The CAD magnet at the M3-rod tip is the marker now — no extra dot/trail.
    } catch (err) {
      console.error('[CAD GLB LOAD ERROR]', err);
      const hint = loadingHint || (() => { const h = document.createElement('div'); h.className = 'hint-overlay'; container.appendChild(h); return h; })();
      hint.textContent = `3D model failed to load (network or ${MODEL_URL} missing). Reload to retry.`;
    }
  })();

  mainSceneObj = { scene, camera, renderer, controls, container };

  // Setup subplots and radars
  stdPlot = create3DFieldPlot('canvas3d-std-plot', 0xef4444, 16.0);
  // 8 mT/mm rather than 2.5: the simulated 2px sweep now reaches ~7.9 mT/mm, so
  // the old full scale pinned the head against the rim for most of the pattern.
  mlxPlot = create3DFieldPlot('canvas3d-mlx-plot', 0x10b981, 8.0);
  initRadarCanvases();

  // The fit-to-screen layout resizes these boxes without a window resize
  // (calibration drawer, debug log, switching tabs), so watch the boxes
  // themselves. One resize per frame at most.
  if (typeof ResizeObserver === 'function') {
    let resizeQueued = false;
    const observer = new ResizeObserver(() => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => { resizeQueued = false; resizeSfiCanvases(); });
    });
    ['canvas3d-container', 'canvas3d-std-plot', 'canvas3d-mlx-plot', 'radarCanvasStd', 'radarCanvasMlx']
      .forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
  }

  let previousFrameTime = performance.now();
  let telemetryVisualElapsed = 0;

  function animate() {
    requestAnimationFrame(animate);
    const frameTime = performance.now();
    const deltaSeconds = Math.min(0.05, Math.max(0, (frameTime - previousFrameTime) / 1000));
    previousFrameTime = frameTime;
    const smoothing = 1 - Math.exp(-14 * deltaSeconds);

    if (autoPattern && !isLiveHardwareConnected) {
      animTime += deltaSeconds * 1.5;
      let cycle = (animTime % 24) / 24;

      if (cycle < 0.25) {
        let t = (cycle / 0.25) * Math.PI * 2;
        targetJoyX = Math.cos(t) * 0.85; targetJoyY = Math.sin(t) * 0.85; targetJoyZ = 0;
      } else if (cycle < 0.50) {
        let t = ((cycle - 0.25) / 0.25) * Math.PI * 4;
        if (Math.sin(t) > 0) { targetJoyX = Math.sin(t * 2) * 0.9; targetJoyY = 0; }
        else { targetJoyX = 0; targetJoyY = Math.cos(t * 2) * 0.9; }
        targetJoyZ = 0;
      } else if (cycle < 0.75) {
        targetJoyX = Math.sin(animTime * 2) * 0.25; targetJoyY = Math.cos(animTime * 2) * 0.25;
        targetJoyZ = Math.sin((cycle - 0.50) * Math.PI * 8) * 0.8;
      } else {
        targetJoyX = Math.sin(animTime * 1.7) * 0.75 + Math.cos(animTime * 0.5) * 0.2;
        targetJoyY = Math.cos(animTime * 1.3) * 0.75 + Math.sin(animTime * 0.7) * 0.2;
        targetJoyZ = Math.sin(animTime * 2.5) * 0.4;
      }
    }

    joyX += (targetJoyX - joyX) * smoothing;
    joyY += (targetJoyY - joyY) * smoothing;
    joyZ += (targetJoyZ - joyZ) * smoothing;

    const TILT_MAX_RAD = 0.38;
    let tiltAngle = Math.hypot(joyX, joyY) * TILT_MAX_RAD;
    // Lean follows the stick command: +Y leans up. X is inverted because the CAD
    // assembly's local X reads mirrored on screen - verified against the dials and
    // confirmed by eye: +X must lean the stick to screen-left to look correct on
    // this model, which is the opposite of the radars/plots' +X-to-the-right.
    let tiltDir = Math.atan2(joyY, -joyX);

    // Rotate the joystick assembly rigidly about the spherical joint where the
    // stick passes through the dome opening. Every point of the assembly keeps
    // its distance to the pivot, so the stick stays centered in the dome hole
    // for all tilt angles and the hole never limits the stick's movement.
    if (joyAssemblyRef) {
      const q = new THREE.Quaternion();
      if (tiltAngle > 0.0001) {
        const axis = new THREE.Vector3(Math.sin(tiltDir), 0, -Math.cos(tiltDir));
        q.setFromAxisAngle(axis, tiltAngle);
      }
      // Rebuild from the stored rest position each frame to avoid drift.
      joyAssemblyRef.quaternion.copy(q);
      joyAssemblyRef.position.copy(joyRestPosition).sub(joyPivotPoint).applyQuaternion(q).add(joyPivotPoint);
      // Z press: the M3 rod (magnet holder) slides down its rotated shaft axis,
      // pushing the magnet toward the sensor (smaller airgap -> stronger Bz).
      joyAssemblyRef.position.add(new THREE.Vector3(0, -joyZ * 0.3, 0).applyQuaternion(q));
    }

    // Simulated absolute field (mT). Tilting the stick rotates the field, so the
    // in-plane pair grows with tilt while Z trades against it: Bz then animates
    // for the whole loop instead of sitting at exactly 22.0 until the press
    // phase (the old model gave Bz only a joyZ term, so it looked frozen for the
    // first half of the 24 s pattern). joyZ still adds the push.
    const tiltMagnitude = Math.min(1, Math.hypot(joyX, joyY));
    let trueBx = joyX * 18.0;
    let trueBy = joyY * 18.0;
    let trueBz = -SIM_TILT_Z_DROP_MT * tiltMagnitude + joyZ * 12.0;

    // Simulated stray field from the coil. Only the simulation gets it: on live
    // hardware the real coil acts on the real sensor, and adding a made-up
    // offset to measured data would fake the very comparison the demo shows.
    // (This read a `coilActive` flag that nothing ever set, so the simulated
    // disturbance never appeared; coilView is the state setCoilState owns.)
    const liveData = isLiveHardwareConnected && liveHardwarePacket && liveHardwarePacket.p0Raw;
    const simStray = coilView.active && !liveData;
    let noiseX = simStray ? 6.2 + (Math.random() - 0.5) * 0.6 : 0;
    let noiseY = simStray ? -5.8 + (Math.random() - 0.5) * 0.6 : 0;
    let noiseZ = simStray ? 4.5 + (Math.random() - 0.5) * 0.4 : 0;

    let stdBx = trueBx + noiseX;
    let stdBy = trueBy + noiseY;
    let stdBz = 22.0 + trueBz + noiseZ;

    // Simulated 2px gradients (mT/mm). At rest the in-plane pair dominates:
    // X02 = Y13 = base and Z02 = Z13 = 0, i.e. alpha = beta = 90 and the radar
    // sits centred - the same shape the bench shows. Displacement then ROTATES
    // each pair, so all four channels - and the magnitude - animate, and the Z
    // gradient's sign carries the tilt direction as on the real rig. Scaling a
    // whole pair cannot move its atan2 angle, so the radius term is free to
    // shape the magnitude without disturbing alpha/beta.
    const simThetaX = joyX * SIM_DIFF_SWEEP_DEG * (Math.PI / 180);
    const simThetaY = joyY * SIM_DIFF_SWEEP_DEG * (Math.PI / 180);
    const simDiffR = SIM_DIFF_BASE_MT_MM * (1 + 0.5 * tiltMagnitude);
    let mlxDBx = simDiffR * Math.cos(simThetaX);
    let mlxDBy = simDiffR * Math.cos(simThetaY);
    let mlxDBz = simDiffR * Math.sin(simThetaX);
    let mlxDBzY = simDiffR * Math.sin(simThetaY);

    if (liveData) {
      stdBx = liveHardwarePacket.p0Raw.x / SINGLE_PIXEL_LSB_PER_MT;
      stdBy = liveHardwarePacket.p0Raw.y / SINGLE_PIXEL_LSB_PER_MT;
      stdBz = liveHardwarePacket.p0Raw.z / SINGLE_PIXEL_LSB_PER_MT;

      const lsbPerMtMmNow = lsbPerMtMm();
      mlxDBx = liveHardwarePacket.diffRaw.x / lsbPerMtMmNow;
      mlxDBy = liveHardwarePacket.diffRaw.y / lsbPerMtMmNow;
      // ?? not ||: a genuine 0-count Z13 must not be replaced by Z02.
      mlxDBz = (liveHardwarePacket.diffRaw.z ?? 0) / lsbPerMtMmNow;
      mlxDBzY = (liveHardwarePacket.diffRaw.bzY ?? liveHardwarePacket.diffRaw.z ?? 0) / lsbPerMtMmNow;
    }

    targetStdBx = stdBx;
    targetStdBy = stdBy;
    targetStdBz = stdBz;
    targetMlxDBx = mlxDBx;
    targetMlxDBy = mlxDBy;
    targetMlxDBz = mlxDBz;
    targetMlxDBzY = mlxDBzY;

    // Interpolate frame-rate display state toward raw telemetry targets
    displayStdBx += (targetStdBx - displayStdBx) * smoothing;
    displayStdBy += (targetStdBy - displayStdBy) * smoothing;
    displayStdBz += (targetStdBz - displayStdBz) * smoothing;
    displayMlxDBx += (targetMlxDBx - displayMlxDBx) * smoothing;
    displayMlxDBy += (targetMlxDBy - displayMlxDBy) * smoothing;
    displayMlxDBz += (targetMlxDBz - displayMlxDBz) * smoothing;
    displayMlxDBzY += (targetMlxDBzY - displayMlxDBzY) * smoothing;

    // Process SFI formulas from interpolated display values
    const sfi1px = computeSfi1Px(displayStdBx, displayStdBy, displayStdBz, activeCalibrationParams);
    const sfi2px = computeSfi2Px(displayMlxDBx, displayMlxDBz, displayMlxDBy, displayMlxDBzY, activeCalibrationParams);

    // With no signal, park at the 90° neutral position instead of feeding
    // atan2(0, 0) to the radar.
    const mlxHasSignal = sfi2px.signalStrength > NO_MAG_DIFF_MT_MM;
    const dispAlpha = toDialAngleDeg(mlxHasSignal ? sfi2px.alphaDeg : 90);
    const dispBeta = toDialAngleDeg(mlxHasSignal ? sfi2px.betaDeg : 90);
    const angleAlpha = mlxHasSignal ? sfi2px.alphaDeg : 90;
    const angleBeta = mlxHasSignal ? sfi2px.betaDeg : 90;
    const gimbalInput = calculateDifferentialGimbalInput(
      angleAlpha,
      angleBeta,
      gimbalZeroAngles.alpha,
      gimbalZeroAngles.beta,
      GIMBAL_FULL_SCALE_DEG
    );
    const tiltX = gimbalInput.valid ? gimbalInput.x * 90 : 0;
    const tiltY = gimbalInput.valid ? gimbalInput.y * 90 : 0;
    liveSfiAngles = { alpha: angleAlpha, beta: angleBeta };

    // Each field has its own fixed-width span, so the line does not shift.
    const pressMag = Math.hypot(displayMlxDBz, displayMlxDBzY);
    const pressed = pressMag >= pressThresholdMtMm;
    setTextIfChanged('joy-tilt-x', `${tiltX.toFixed(1)}°`);
    setTextIfChanged('joy-tilt-y', `${tiltY.toFixed(1)}°`);
    setTextIfChanged('joy-press-state', pressed ? 'PUSHED' : '—');
    setTextIfChanged('joy-press-mag', pressMag.toFixed(1));

    if (isLiveHardwareConnected && liveHardwarePacket?.hasDifferential) {
      const pressMag = Math.hypot(displayMlxDBz, displayMlxDBzY);
      const pressed = pressMag >= pressThresholdMtMm;
      if (gimbalInput.valid) {
        targetJoyX = gimbalInput.x;
        targetJoyY = gimbalInput.y;
      }
      targetJoyZ = pressed ? 1 : 0;
    }

    // Only the telemetry/diagnostics panes consume these readouts. The 3D CAD
    // tab was paying for ~30 DOM writes on hidden elements every frame while the
    // browser was already GPU-bound on the model; keep the sim running, but skip
    // the writes when neither pane is on screen.
    const activeTab = document.querySelector('.tab-content.active')?.id;
    const controlPaneVisible = activeTab === 'tab-telemetry' || activeTab === 'tab-diagnostics';

    if (controlPaneVisible) {
      updateSignalBarsUI(
        displayStdBx, displayStdBy, displayStdBz,
        displayMlxDBx, displayMlxDBy, displayMlxDBz, displayMlxDBzY,
        sfi1px.signalStrength,
        sfi2px.signalStrength,
        tiltX,
        tiltY
      );

      // PDF review: the θ (heading) readouts are removed; the two radars now show
      // the calibrated α/β plus a field-strength head that flags weak / missing
      // magnets (P5).
      const magFlag = (mag, noMag, weakMag) => (mag < noMag ? 'no magnet' : mag < weakMag ? 'weak' : '');

      // Top Summary (if unhidden) - alpha/beta from the differential formula.
      const angleAlphaEl = document.getElementById('angle-alpha');
      const angleBetaEl = document.getElementById('angle-beta');
      if (angleAlphaEl) angleAlphaEl.innerText = dispAlpha.toFixed(1) + '°';
      if (angleBetaEl) angleBetaEl.innerText = dispBeta.toFixed(1) + '°';

      // Standard 3D Hall Radar Readouts
      const magStdEl = document.getElementById('radar-mag-std');
      const alphaStdEl = document.getElementById('radar-alpha-std');
      const betaStdEl = document.getElementById('radar-beta-std');

      if (magStdEl) {
        const flag = magFlag(sfi1px.signalStrength, NO_MAG_STD_MT, WEAK_MAG_STD_MT);
        magStdEl.innerText = sfi1px.signalStrength.toFixed(1) + ' mT' + (flag ? ` (${flag})` : '');
      }
      if (alphaStdEl) alphaStdEl.innerText = sfi1px.alphaDeg.toFixed(1) + '°';
      if (betaStdEl) betaStdEl.innerText = sfi1px.betaDeg.toFixed(1) + '°';

      // MLX90396 Differential SFI Radar Readouts (Desmos Calibrated)
      const magMlxEl = document.getElementById('radar-mag-mlx');
      const alphaMlxEl = document.getElementById('radar-alpha-mlx');
      const betaMlxEl = document.getElementById('radar-beta-mlx');

      if (magMlxEl) {
        const flag = magFlag(sfi2px.signalStrength, NO_MAG_DIFF_MT_MM, WEAK_MAG_DIFF_MT_MM);
        magMlxEl.innerText = sfi2px.signalStrength.toFixed(1) + ' mT/mm' + (flag ? ` (${flag})` : '');
      }
      if (alphaMlxEl) alphaMlxEl.innerText = dispAlpha.toFixed(1) + '°';
      if (betaMlxEl) betaMlxEl.innerText = dispBeta.toFixed(1) + '°';
    }

    if (activeTab === 'tab-telemetry') {
      telemetryVisualElapsed += deltaSeconds;
      if (telemetryVisualElapsed >= 1 / 30) {
        telemetryVisualElapsed %= 1 / 30;

        const lastStd = stdTraceHistory[stdTraceHistory.length - 1];
        const lastMlx = mlxTraceHistory[mlxTraceHistory.length - 1];

        // Both magnet heads ride the same gimbal arc. `axial` is the shared
        // press component, so a push slides each head down its tilted axis;
        // the raw Z values stay in the readout boxes instead of being a fake
        // height. The channel pair remains the horizontal projection.
        if (!lastStd || Math.abs(lastStd.x - displayStdBx) > 0.05 || Math.abs(lastStd.y - displayStdBy) > 0.05
            || Math.abs((lastStd.axial || 0) - joyZ) > 0.02) {
          stdTraceHistory.push({ 
            x: displayStdBx, 
            y: displayStdBy, 
            axial: joyZ,
            rawZ: displayStdBz 
          });
        }
        
        // The differential plot swings on the Z gradients (dBz/dx, dBz/dy): on
        // the rig they sit near zero at rest and their sign follows the tilt,
        // the counterpart of the legacy plot's (Bx, By).
        if (!lastMlx || Math.abs(lastMlx.x - displayMlxDBz) > 0.05 || Math.abs(lastMlx.y - displayMlxDBzY) > 0.05
            || Math.abs((lastMlx.axial || 0) - joyZ) > 0.02) {
          mlxTraceHistory.push({
            x: displayMlxDBz,
            y: displayMlxDBzY,
            axial: joyZ,
            rawX: displayMlxDBx,
            rawY: displayMlxDBy,
            rawZx: displayMlxDBz,
            rawZy: displayMlxDBzY
          });
        }

        if (stdTraceHistory.length > TRACE_HISTORY_POINTS) stdTraceHistory.shift();
        if (mlxTraceHistory.length > TRACE_HISTORY_POINTS) mlxTraceHistory.shift();

        if (stdPlot) update3DPlot(stdPlot, stdTraceHistory, true);
        if (mlxPlot) update3DPlot(mlxPlot, mlxTraceHistory, false);

        // Both dials are scaled so the full-scale value reaches the rim: 16 mT
        // of in-plane field, 60 degrees of tilt.
        drawRadar(radarCtxStd, displayStdBx, displayStdBy, '#ef4444', RADAR_STD_FULL_MT);
        drawTiltRadar(radarCtxMlx, tiltX, tiltY, '#10b981');
      }
    } else if (activeTab === 'tab-idle' && mainSceneObj) {
      // No manual frame cap here: requestAnimationFrame is already vsync-locked,
      // and comparing `now - lastRender >= 1000/60` against rAF's own ~16.67 ms
      // ticks can skip every other frame depending on where the timing lands,
      // which shows up as judder rather than a smooth 30 fps.
      controls.update();
      if (coilFieldViz) updateCoilField(coilFieldViz, deltaSeconds);
      if (snowViz) updateSnow(snowViz, deltaSeconds);
      renderer.render(scene, camera);
    }
  }

  animate();
}

function updateSignalBarsUI(bx0, by0, bz0, dbx, dby, dbz_x, dbz_y, magStd, magDiff, tiltX, tiltY) {
  const updateBar = (meterId, txtId, val, unit = 'mT', maxRange = 35) => {
    const meter = document.getElementById(meterId);
    const txt = document.getElementById(txtId);
    if (!meter || !txt) return;

    txt.innerText = val.toFixed(1) + ' ' + unit;
    const percent = Math.min(100, Math.max(0, ((val + maxRange) / (maxRange * 2)) * 100));
    meter.style.width = percent + '%';
  };

  updateBar('meter-raw-bx', 'txt-raw-bx', bx0, 'mT');
  updateBar('meter-raw-by', 'txt-raw-by', by0, 'mT');
  updateBar('meter-raw-bz', 'txt-raw-bz', bz0, 'mT');

  updateBar('meter-diff-bx', 'txt-diff-bx', dbx, 'mT/mm');
  updateBar('meter-diff-by', 'txt-diff-by', dby, 'mT/mm');
  updateBar('meter-diff-bz', 'txt-diff-bz', dbz_x, 'mT/mm');
  updateBar('meter-diff-bz-y', 'txt-diff-bz-y', dbz_y, 'mT/mm');

  const elMagStd = document.getElementById('mag-val-std');
  const elMagDiff = document.getElementById('mag-val-diff');
  if (elMagStd) elMagStd.innerText = magStd.toFixed(1) + ' mT';
  if (elMagDiff) elMagDiff.innerText = magDiff.toFixed(1) + ' mT/mm';

  updateSensorDiagnostics(bx0, by0, bz0, dbx, dby, dbz_x, dbz_y, magStd, magDiff, tiltX, tiltY);
}

function updateSensorDiagnostics(bx0, by0, bz0, dbx, dby, dbz_x, dbz_y, magStd, magDiff, tiltX, tiltY) {
  const pressMag = Math.hypot(dbz_x, dbz_y);
  const pressed = pressMag >= pressThresholdMtMm;
  const values = {
    'diag-joy-x': typeof tiltX === 'number' ? `${tiltX.toFixed(1)}°` : '--',
    'diag-joy-y': typeof tiltY === 'number' ? `${tiltY.toFixed(1)}°` : '--',
    'diag-press-mag': `${pressMag.toFixed(2)} mT/mm`,
    'diag-press': pressed ? 'PUSHED' : '\u2014'
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
}

function initRadarCanvases() {
  radarCanvasStd = document.getElementById('radarCanvasStd');
  radarCanvasMlx = document.getElementById('radarCanvasMlx');
  if (radarCanvasStd) radarCtxStd = radarCanvasStd.getContext('2d');
  if (radarCanvasMlx) radarCtxMlx = radarCanvasMlx.getContext('2d');
  resizeRadarCanvases();
}

// The radars are drawn in CSS pixels on a backing store scaled by the device
// pixel ratio, so they stay sharp on a high-DPI presentation screen; the draw
// functions read the CSS size back through radarGeometry().
// Writes only when the text differs, so a steady value causes no relayout.
function setTextIfChanged(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

function resizeRadarCanvases() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  [[radarCanvasStd, radarCtxStd], [radarCanvasMlx, radarCtxMlx]].forEach(([can, ctx]) => {
    if (!can) return;
    const w = can.clientWidth || 300;
    const h = can.clientHeight || 280;
    can.cssWidth = w;
    can.cssHeight = h;
    can.width = Math.round(w * dpr);
    can.height = Math.round(h * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
}

// Shared dial geometry. Labels, needle and margin scale with the dial, so a
// large radar on a 27" screen is not a big circle with 10 px text.
function radarGeometry(ctx) {
  const c = ctx.canvas;
  const w = c.cssWidth || c.width;
  const h = c.cssHeight || c.height;
  const k = Math.max(1, Math.min(w, h) / 340);
  return { w, h, cx: w / 2, cy: h / 2, radius: Math.min(w, h) / 2 - 25 * k, k };
}

// `label` used to be passed in ('LEGACY 3D HALL') but was never drawn - the card
// badge already names the plot - so the parameter is gone.
function drawRadar(ctx, curX, curY, themeColor, maxScale = RADAR_STD_FULL_MT) {
  if (!ctx || !ctx.canvas) return;
  const { w, h, cx, cy, radius, k } = radarGeometry(ctx);

  ctx.clearRect(0, 0, w, h);

  // Background Reticle
  ctx.fillStyle = '#030816';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(10 * k)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('90° (+Y)', cx, cy - radius + 14 * k);
  ctx.fillText('270° (-Y)', cx, cy + radius - 8 * k);
  // Side labels anchored inside the rim, so they never cross the dial's edge.
  ctx.textAlign = 'right';
  ctx.fillText('0° (+X)', cx + radius - 6 * k, cy - 6 * k);
  ctx.textAlign = 'left';
  ctx.fillText('180° (-X)', cx - radius + 6 * k, cy - 6 * k);

  // (The old dashed "simulation target" reticle was removed: it duplicated the
  // needle on a second, unsmoothed path and could spill past the rim.)

  // Measured vector (Solid arrow) with boundary clamping
  const measuredDist = Math.hypot(curX, curY);
  const clampedMeasuredDist = Math.min(measuredDist, maxScale);
  const measuredScale = measuredDist > 0 ? (clampedMeasuredDist / measuredDist) : 1;
  const measuredPxX = cx + ((curX * measuredScale) / maxScale) * radius;
  const measuredPxY = cy - ((curY * measuredScale) / maxScale) * radius;

  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(measuredPxX, measuredPxY);
  ctx.stroke();

  ctx.fillStyle = themeColor;
  ctx.shadowColor = themeColor;
  ctx.shadowBlur = 10 * k;
  ctx.beginPath();
  ctx.arc(measuredPxX, measuredPxY, 5.5 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// The frame centre is α/β = 90°; a 90° change reaches the radar rim.
// Radar full-scale. Both dials are more sensitive than before: the needle was
// only reaching the middle of the disc because the full scale was well above
// the values actually seen. 16 mT of in-plane field / 60 deg of tilt now reach
// the rim at full stick deflection.
const RADAR_STD_FULL_MT = 16.0;
const RADAR_TILT_FULL_DEG = 60.0;

// Differential radar: a TILT scope, not an angle dial. The needle plots the
// same (tiltX, tiltY) pair that drives the dome, so the dial and the model can
// never disagree: centre = neutral, +60° reaches the rim on each axis. alpha and
// beta stay in the readout box as numbers. (The old version plotted the raw
// alpha/beta angles through (90 - a)/90, which folded +/- onto one needle and
// pointed somewhere unrelated to the stick.)
function drawTiltRadar(ctx, tiltXDeg, tiltYDeg, themeColor) {
  if (!ctx || !ctx.canvas) return;
  const { w, h, cx, cy, radius, k } = radarGeometry(ctx);
  const xOf = (v) => v / RADAR_TILT_FULL_DEG;
  const yOf = (v) => v / RADAR_TILT_FULL_DEG;

  // Clamp to the circular rim (same boundary behaviour as the legacy drawRadar).
  const clampPoint = (vx, vy) => {
    const dist = Math.hypot(vx, vy);
    const s = dist > 1 ? 1 / dist : 1;
    return [vx * s, vy * s];
  };

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#030816';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let r = 0.25; r <= 1.0; r += 0.25) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(10 * k)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`Y -${RADAR_TILT_FULL_DEG}°`, cx, cy + radius - 8 * k);
  ctx.fillText(`Y +${RADAR_TILT_FULL_DEG}°`, cx, cy - radius + 14 * k);
  // Side labels anchored inside the rim, so they never cross the dial's edge.
  ctx.textAlign = 'left';
  ctx.fillText(`X -${RADAR_TILT_FULL_DEG}°`, cx - radius + 6 * k, cy - 6 * k);
  ctx.textAlign = 'right';
  ctx.fillText(`X +${RADAR_TILT_FULL_DEG}°`, cx + radius - 6 * k, cy - 6 * k);

  // (Dashed "simulation target" ring removed - the needle is the reading.)
  if (Number.isFinite(tiltXDeg) && Number.isFinite(tiltYDeg)) {
    const [mx, my] = clampPoint(xOf(tiltXDeg), yOf(tiltYDeg));
    const px = cx + mx * radius;
    const py = cy - my * radius;

    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2.5 * k;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.fillStyle = themeColor;
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 10 * k;
    ctx.beginPath();
    ctx.arc(px, py, 5.5 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Shared floor height for the 3D field plots: the grid, the axis triad and the
// magnet hover height all key off this so they can never drift apart.
const PLOT_FLOOR_Y = -3.2;
// Height of the magnet above the floor at zero tilt. The gimbal arc below drops
// the head as it swings out, so it needs enough clearance to stay above the grid.
const PLOT_HEAD_HOVER = 1.3;
// Clamp radius for the head/trail: a spike pins at the rim instead of leaving
// the grid, mirroring how the radars clamp to their rim.
const PLOT_MAX_R = 3.0;
// Virtual gimbal arm from the pivot (below the grid) to the magnet at neutral.
// The horizontal channel value sets how far the arm swings out; the remaining
// vertical component gives the dome arc the magnet rides on, exactly like the
// 3D Joystick Model tab. Press travel slides the head along that tilted arm.
const PLOT_GIMBAL_ARM = 5.5;
const PLOT_AXIAL_TRAVEL = 0.55;
const PLOT_UP = new THREE.Vector3(0, 1, 0);

// Project a horizontal channel pair onto the gimbal arc. `axial` is the press
// component (0..1): positive slides the magnet down its own tilted axis toward
// the pivot, matching the stick in the 3D Joystick Model tab.
function projectPlotPoint(hx, hz, axial = 0) {
  const r = Math.hypot(hx, hz);
  const radial = Math.min(r, PLOT_MAX_R);
  const nx = r > 0 ? hx / r : 0;
  const nz = r > 0 ? hz / r : 0;
  const x = nx * radial;
  const z = nz * radial;

  const arm = PLOT_GIMBAL_ARM;
  const rise = Math.sqrt(Math.max(1e-4, arm * arm - radial * radial));
  // Unit vector from the virtual pivot to the magnet (the gimbal axis).
  const axis = new THREE.Vector3(x, rise, z).normalize();

  const press = Math.max(-1, Math.min(1, Number.isFinite(axial) ? axial : 0));
  const slide = press * PLOT_AXIAL_TRAVEL;
  const baseY = PLOT_FLOOR_Y + PLOT_HEAD_HOVER - arm;
  return {
    x: x - axis.x * slide,
    y: baseY + rise - axis.y * slide,
    z: z - axis.z * slide,
    axis
  };
}

// --- Floating XYZ orientation badge -----------------------------------------
// A tiny self-contained scene drawn as an overlay in each plot's top-left
// corner. Its camera is slaved to the main plot camera, so the triad spins with
// the view exactly like a CAD "view cube". No backdrop — the arrows float.
// Sensor frame, not the raw three.js world frame: the grid floor is the chip's
// XY plane. X is world +X and sensor +Y is world -Z, chosen so that both axes
// read the same way on screen as on the radar dial (right = +X, up = +Y).
const GIZMO_AXES = [
  { dir: [1, 0, 0], color: 0xef4444, label: 'X' }, // floor, sensor +X
  { dir: [0, 0, -1], color: 0x22c55e, label: 'Y' }, // floor, sensor +Y
  { dir: [0, 1, 0], color: 0x3b82f6, label: 'Z' }  // up, normal to the board
];

function makeGizmoArrow(dirArr, color, length = 1.0, shaftR = 0.052, headR = 0.15, headLen = 0.32) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  const shaftLen = length - headLen;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16), mat);
  shaft.position.y = shaftLen / 2;
  group.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 20), mat);
  head.position.y = shaftLen + headLen / 2;
  group.add(head);
  const dir = new THREE.Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return group;
}

function makeGizmoLabel(text, color, pos) {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 46px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.fillText(text, S / 2, S / 2 + 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(0.4, 0.4, 1);
  sprite.position.set(pos[0], pos[1], pos[2]);
  sprite.renderOrder = 30;
  return sprite;
}

// Built once per plot. Orthographic so the triad never distorts with depth.
// No backdrop: the arrows and labels just float over the plot.
function buildAxisGizmo() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 100);

  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true })
  ));

  GIZMO_AXES.forEach((a) => {
    scene.add(makeGizmoArrow(a.dir, a.color));
    scene.add(makeGizmoLabel(a.label, a.color, a.dir.map((v) => v * 1.24)));
  });

  return { scene, camera, dir: new THREE.Vector3(1, 1, 1) };
}

// Draw the badge into the plot renderer's top-left corner. The scissor test
// confines the mini-pass; only the depth buffer is cleared inside the badge, so
// the plot behind it stays visible.
function renderAxisGizmo(plot, w, h) {
  const gizmo = plot.gizmo;
  if (!gizmo) return;
  const renderer = plot.renderer;
  const size = Math.round(Math.min(Math.max(Math.min(w, h) * 0.26, 78), 130));
  const margin = Math.round(size * 0.12);

  // Slave the badge camera to the main view direction.
  const dir = gizmo.dir;
  dir.copy(plot.camera.position).sub(plot.controls.target);
  if (dir.lengthSq() === 0) dir.set(1, 1, 1);
  dir.normalize();
  gizmo.camera.position.copy(dir).multiplyScalar(5);
  gizmo.camera.up.copy(plot.camera.up);
  gizmo.camera.lookAt(0, 0, 0);
  gizmo.camera.updateMatrixWorld();

  // WebGL viewport origin is bottom-left, so top-left is y = h - size.
  const x = margin;
  const y = h - size - margin;
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, size, size);
  renderer.setScissor(x, y, size, size);
  renderer.clearDepth();
  renderer.render(gizmo.scene, gizmo.camera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
}

function renderPlot(plot) {
  plot.controls.update();

  const renderer = plot.renderer;
  const w = plot.w || plot.el.clientWidth || 320;
  const h = plot.h || plot.el.clientHeight || 260;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, w, h);
  renderer.clear();
  renderer.render(plot.scene, plot.camera);
  renderAxisGizmo(plot, w, h);
}

function create3DFieldPlot(elementId, ringColor, fullScale = 28.0) {  const el = document.getElementById(elementId);
  if (!el) return null;

  const plotScene = new THREE.Scene();
  plotScene.background = new THREE.Color(0x020612);

  const w = el.clientWidth || 320;
  const h = el.clientHeight || 260;
  const plotCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  // Near-frontal, elevated view: screen right ≈ sensor +X and screen up ≈ sensor
  // +Y, so the head moves in the same direction as the radar needle. A 45°
  // azimuth (the old 7,4.5,9) threw +Y down-left, opposite the dial.
  plotCamera.position.set(2, 7, 11);

  const plotRenderer = new THREE.WebGLRenderer({ antialias: true });
  plotRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  plotRenderer.setSize(w, h);
  // renderPlot() clears and paints the badge overlay itself.
  plotRenderer.autoClear = false;
  el.appendChild(plotRenderer.domElement);

  const plotControls = new THREE.OrbitControls(plotCamera, plotRenderer.domElement);
  plotControls.target.set(0, 0, 0);
  plotControls.enableDamping = true;
  plotControls.dampingFactor = 0.05;
  plotControls.enablePan = false;
  plotControls.enableRotate = true;
  plotControls.minDistance = 10;
  plotControls.maxDistance = 16;

  plotScene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(6, 12, 8);
  plotScene.add(dirLight);

  // Floor = the sensor XY plane (world X-Z), centred on the origin so the
  // magnet's zero/home position lands dead centre of the grid.
  const gridHelper = new THREE.GridHelper(12, 12, 0x334155, 0x1e293b);
  gridHelper.position.set(0, PLOT_FLOOR_Y, 0);
  plotScene.add(gridHelper);

  // The XYZ triad is no longer pinned into the floor corner: it is built as a
  // floating orientation badge (buildAxisGizmo) and drawn over this scene each
  // frame in the top-left corner, spinning with the camera. See renderAxisGizmo.

  const maxPoints = TRACE_HISTORY_POINTS;
  const linePositions = new Float32Array(maxPoints * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const traceMaterial = new THREE.LineBasicMaterial({
    color: ringColor,
    linewidth: 1
  });
  const traceMesh = new THREE.Line(lineGeo, traceMaterial);
  plotScene.add(traceMesh);

  // 6mm Cylindrical Magnet Assembly
  const magnetGroup = new THREE.Group();

  // Same N/S palette as the Twist panel: dark charcoal north, gold south.
  const northPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0x1E242B, roughness: 0.2, metalness: 0.3 })
  );
  northPole.position.y = -0.175;
  magnetGroup.add(northPole);

  const southPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0xEAA320, roughness: 0.2, metalness: 0.3 })
  );
  southPole.position.y = 0.175;
  magnetGroup.add(southPole);

  const ringBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 0.05, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9 })
  );
  magnetGroup.add(ringBand);

  plotScene.add(magnetGroup);
  // Start parked dead centre of the grid so the model reads centred before the
  // first packet (or whenever history is empty).
  magnetGroup.position.set(0, PLOT_FLOOR_Y + PLOT_HEAD_HOVER, 0);

  return {
    scene: plotScene,
    camera: plotCamera,
    renderer: plotRenderer,
    controls: plotControls,
    lineGeo,
    traceMaterial,
    headMesh: magnetGroup,
    maxPoints,
    fullScale,
    // Floating top-left XYZ orientation badge (see renderAxisGizmo).
    gizmo: buildAxisGizmo(),
    // Last laid-out pixel size, kept current by resizeSfiCanvases().
    w,
    h,
    // Zero offset in channel units, captured by the card's Zero button.
    zero: { x: 0, y: 0 },
    el
  };
}

function update3DPlot(plot, history, isLegacy) {
  const positions = plot.lineGeo.attributes.position.array;
  const len = history.length;
  // Fixed per-plot scale: the same channel value must always land at the same
  // world position. The old per-frame min(2.4/refScale, 2.4/maxAbs) "breathing"
  // rescaled the whole scene whenever history evolved, so the head jittered and
  // walked off-centre on a steady signal. fullScale is the channel range that
  // maps to ~2.4 world units; spikes are rim-clamped below instead of rescaling.
  const refScale = plot.fullScale || 28.0;
  const SCALE = 2.4 / refScale;
  // Zero is stored in channel units so it stays valid for this fixed scale.
  // Subtract before scaling so head and trail recentre together.
  const zx = (plot.zero && Number.isFinite(plot.zero.x)) ? plot.zero.x : 0;
  const zy = (plot.zero && Number.isFinite(plot.zero.y)) ? plot.zero.y : 0;
  // The channel pair is the horizontal projection of the magnet's swing. Each
  // point is lifted onto the gimbal arc so the head and trail follow the same
  // dome path as the CAD model in the 3D Joystick Model tab, and the press travel
  // slides along the local (tilted) axis rather than being a flat-plane offset.
  for (let i = 0; i < len; i++) {
    const pt = history[i];
    const p = projectPlotPoint(
      (pt.x - zx) * SCALE,
      -(pt.y - zy) * SCALE,
      pt.axial
    );
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }

  // Draw range ensures uninitialized slots in the buffer do not stretch to the origin
  plot.lineGeo.setDrawRange(0, len);
  plot.lineGeo.attributes.position.needsUpdate = true;

  if (len > 0) {
    const last = history[len - 1];
    const head = projectPlotPoint(
      (last.x - zx) * SCALE,
      -(last.y - zy) * SCALE,
      last.axial
    );
    let velocity = 0;

    if (len > 1) {
      const previous = history[len - 2];
      velocity = Math.hypot(
        (last.x - previous.x) * SCALE,
        (last.y - previous.y) * SCALE
      );
      plot.traceMaterial.linewidth = Math.min(8, Math.max(1, 1 + velocity * 30));
    }

    const velocityEl = document.getElementById(isLegacy ? 'plot-std-velocity' : 'plot-mlx-velocity');
    if (velocityEl) velocityEl.textContent = `v ${(velocity * 30).toFixed(1)} px/s`;

    // Sit the magnet on the gimbal arm and align its axis with that arm, so it
    // leans out over the grid exactly like the tilted stick in the other tab.
    plot.headMesh.position.set(head.x, head.y, head.z);
    plot.headMesh.quaternion.setFromUnitVectors(PLOT_UP, head.axis);

    if (isLegacy) {
      setBoxVal('plot-std-bx', last.x);
      setBoxVal('plot-std-by', last.y);
      setBoxVal('plot-std-bz', last.rawZ ?? last.z ?? 0);
    } else {
      setBoxVal('plot-mlx-dbx', last.rawX ?? 0);
      setBoxVal('plot-mlx-dby', last.rawY ?? 0);
      setBoxVal('plot-mlx-dbzdx', last.rawZx ?? last.x);
      setBoxVal('plot-mlx-dbzdy', last.rawZy ?? last.y);
    }
  }

  renderPlot(plot);
}

function setBoxVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function resetPlotLines() {
  stdTraceHistory = [];
  mlxTraceHistory = [];

  [stdPlot, mlxPlot].forEach(p => {
    if (!p) return;
    p.lineGeo.setDrawRange(0, 0);
    p.lineGeo.attributes.position.needsUpdate = true;
  });
}

// Zero (centre) one magnet model on its grid. Captures the head's current
// channel values as the zero offset. Pressing again clears it.
export function togglePlotZero(isLegacy) {
  const plot = isLegacy ? stdPlot : mlxPlot;
  const history = isLegacy ? stdTraceHistory : mlxTraceHistory;
  if (!plot) return 'none';
  if (plot.zero.x !== 0 || plot.zero.y !== 0) {
    plot.zero.x = 0;
    plot.zero.y = 0;
    return 'cleared';
  }
  if (history.length === 0) return 'none';
  const last = history[history.length - 1];
  if (!Number.isFinite(last.x) || !Number.isFinite(last.y)) return 'none';
  plot.zero.x = last.x;
  plot.zero.y = last.y;
  return 'captured';
}

// Single button behaviour: capture the current bias for BOTH plots in one
// press, or clear both if either was already zeroed. Returns the resulting
// state ('captured' | 'cleared' | 'none').
export function zeroAllPlots() {
  const anyZeroed = [stdPlot, mlxPlot].some(
    p => p && (p.zero.x !== 0 || p.zero.y !== 0)
  );
  if (anyZeroed) {
    [stdPlot, mlxPlot].forEach(p => { if (p) { p.zero.x = 0; p.zero.y = 0; } });
    return 'cleared';
  }
  const legacy = togglePlotZero(true);
  const differential = togglePlotZero(false);
  return (legacy === 'captured' || differential === 'captured') ? 'captured' : 'none';
}

export function resizeSfiCanvases() {
  if (mainSceneObj && mainSceneObj.container) {
    const w = mainSceneObj.container.clientWidth;
    const h = mainSceneObj.container.clientHeight;
    if (w > 0 && h > 0) {
      mainSceneObj.camera.aspect = w / h;
      mainSceneObj.camera.updateProjectionMatrix();
      mainSceneObj.renderer.setSize(w, h);
    }
  }

  resizeRadarCanvases();

  [stdPlot, mlxPlot].forEach(p => {
    if (p && p.el) {
      const w = p.el.clientWidth;
      const h = p.el.clientHeight;
      if (w > 0 && h > 0) {
        p.camera.aspect = w / h;
        p.camera.updateProjectionMatrix();
        p.renderer.setSize(w, h);
        p.w = w;
        p.h = h;
      }
    }
  });
}
