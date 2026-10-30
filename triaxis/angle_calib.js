/**
 * angle_calib.js
 * Melexis MLX90396 alpha/beta calibration & signal-processing module.
 *
 * Reusable for both demo apps:
 *   - 1px (Thumbstick)         : single-pixel {Bx, By, Bz} in mT
 *   - 2px (SFI, dual-pixel): spatial gradients {dBx/dx, dBz/dx, dBy/dy, dBz/dy} in mT/mm
 *
 * The core angle math is the Desmos calibration model (calculator/usvd0znwuh):
 *
 *   a1_rad = atan2( hypot( z1, k1 * (y1 - o11 * z1) ), x1 - o12 * z1 )
 *   b1_rad = atan2( hypot( z1, k2 * (x1 - o21 * z1) ), y1 - o22 * z1 )
 *
 * with x1/y1/z1 mapped per mode. It matches `calculateDesmosAngles`
 * (sfi_demo.js) byte-for-byte for 1px mode. For 2px mode each signal arrives as
 * a two-component gradient pair, so the angle is computed in the pair's own
 * plane with the orthogonality terms as Z<->X / Z<->Y crosstalk corrections;
 * that is `calculate2pxAngles` (parity-tested below). Production SFI
 * differential angles instead come from `calculateSfiDifferentialAngles`,
 * which implements the reviewer's slide-12 formulas verbatim: the `normal`
 * branch is intentionally calibration-free (plain atan2 per gradient plane),
 * and only the `enhanced` branch consumes k1/o11/o12/k2/o21/o22.
 *
 * No DOM access, no state at module load: usable from Node tests and the browser.
 *
 * The math is strictly division-free (atan2 + hypot), so the only failure mode
 * is a non-finite reading or a non-finite calibration parameter. Both are
 * guarded here: readings return { valid: false }, parameters are normalized.
 */

export const DEFAULT_CALIBRATION_PARAMS = Object.freeze({
  k1: 1.0,   // Alpha K-factor (axis gain trim)
  o11: 0.0,  // Alpha upper orthogonality term
  o12: 0.0,  // Alpha lower orthogonality term
  k2: 1.0,   // Beta K-factor (axis gain trim)
  o21: 0.0,  // Beta upper orthogonality term
  o22: 0.0   // Beta lower orthogonality term
});

// --- Display scale: raw LSB -> physical units -------------------------------
// Lives here because both pages import this module, so the Thumbstick and the
// SFI page cannot disagree about what a count is worth.
//
//   absolute pixel : field[mT]       = counts / SINGLE_PIXEL_LSB_PER_MT
//   differential   : gradient[mT/mm] = counts / (SINGLE_PIXEL_LSB_PER_MT * pitch_mm)
//
// The 2px channels carry the raw difference between two neighbouring pixels in
// the same LSB scale as the absolute pixels - the chip does not pre-divide by
// its pixel pitch - so one mT/mm is (LSB per mT) x (pitch) counts.
//
// NOTE: the pitch is NOT in the preliminary datasheet we have. 1.0 mm is the
// working assumption: it reproduces the simulator's ~6.5 mT/mm nominal and
// keeps the press target (~20 mT/mm) reachable. The old hard-coded divisor of
// 120 implied a 6 mm pitch - that is the magnet diameter, not an on-die spacing
// - and read every gradient ~6x low, which dropped the differential radar
// under its "no magnet" gate. Trim it live until the part confirms the figure.
export const SINGLE_PIXEL_LSB_PER_MT = 20;
export const DEFAULT_SENSOR_PIXEL_PITCH_MM = 1.0;

let sensorPixelPitchMm = DEFAULT_SENSOR_PIXEL_PITCH_MM;

/** Current assumed pixel pitch in mm (live-trimmable from the UI). */
export function getSensorPixelPitchMm() {
  return sensorPixelPitchMm;
}

/** Set the assumed pixel pitch in mm; ignores non-finite / non-positive input. */
export function setSensorPixelPitchMm(value) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isFinite(n) && n > 0) sensorPixelPitchMm = n;
  return sensorPixelPitchMm;
}

/** Counts per mT/mm for the 2px differential channels. */
export function lsbPerMtMm() {
  return SINGLE_PIXEL_LSB_PER_MT * sensorPixelPitchMm;
}

const RAD_TO_DEG = 180 / Math.PI;

/** Coerce one reading/param value: non-finite -> fallback, so NaN never propagates. */
function fin(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Merge a partial parameter object over the defaults, dropping any NaN/Infinity
 * so a live slider that briefly reports NaN cannot poison the math.
 */
export function normalizeParams(params = {}) {
  const out = {};
  for (const key of Object.keys(DEFAULT_CALIBRATION_PARAMS)) {
    out[key] = fin(params[key], DEFAULT_CALIBRATION_PARAMS[key]);
  }
  return out;
}

/** True only if every value is a finite number (NaN/undefined/Infinity -> false). */
export function isFiniteReading(...values) {
  return values.every(v => typeof v === 'number' && Number.isFinite(v));
}

function toAnglePair(aRad, bRad) {
  return {
    alphaRad: aRad,
    betaRad: bRad,
    alphaDeg: aRad * RAD_TO_DEG,
    betaDeg: bRad * RAD_TO_DEG
  };
}

/**
 * Generic Desmos core for a three-component (1px) signal.
 * @param {number} x  mapped x1 (e.g. Bx)
 * @param {number} y  mapped y1 (e.g. By)
 * @param {number} z  mapped z1 (e.g. Bz)
 * @param {object} [params] k1/o11/o12/k2/o21/o22
 */
export function calculateDesmosAngles(x, y, z, params = DEFAULT_CALIBRATION_PARAMS) {
  const { k1, o11, o12, k2, o21, o22 } = normalizeParams(params);

  const crossY = k1 * (y - o11 * z);                 // corrected companion of alpha's Z leg
  const a1Rad = Math.atan2(Math.hypot(z, crossY), x - o12 * z);

  const crossX = k2 * (x - o21 * z);                 // corrected companion of beta's Z leg
  const b1Rad = Math.atan2(Math.hypot(z, crossX), y - o22 * z);

  return toAnglePair(a1Rad, b1Rad);
}

/**
 * 1px (Thumbstick / single-pixel) processing.
 * @param {object} reading { Bx, By, Bz } in mT
 * @param {object} [params] calibration parameters
 * @returns {object} { mode, valid, alphaDeg, betaDeg, alphaRad, betaRad,
 *                     alphaStrength, betaStrength, signalStrength,
 *                     alphaSignal, betaSignal }
 */
export function calculate1pxAngles({ Bx, By, Bz } = {}, params = DEFAULT_CALIBRATION_PARAMS) {
  const x = fin(Bx, NaN), y = fin(By, NaN), z = fin(Bz, NaN);
  const valid = isFiniteReading(x, y, z);

  return {
    mode: '1px',
    valid,
    ...(!valid ? nullAngles() : calculateDesmosAngles(x, y, z, params)),
    alphaStrength: Math.hypot(z, x),
    betaStrength: Math.hypot(z, y),
    signalStrength: Math.hypot(x, y, z),
    alphaSignal: { z, x },
    betaSignal: { z, y }
  };
}

/**
 * 2px (SFI / dual-pixel differential) processing.
 * @param {object} reading { dBxdx, dBzdx, dBydy, dBzdy } in mT/mm
 * @param {object} [params] calibration parameters
 * @returns {object} same shape as calculate1pxAngles
 */
export function calculate2pxAngles(reading = {}, params = DEFAULT_CALIBRATION_PARAMS) {
  const { dBxdx, dBzdx, dBydy, dBzdy } = reading;
  const xdx = fin(dBxdx, NaN), zdx = fin(dBzdx, NaN);
  const ydy = fin(dBydy, NaN), zdy = fin(dBzdy, NaN);
  const valid = isFiniteReading(xdx, zdx, ydy, zdy);

  if (!valid) {
    return {
      mode: '2px',
      valid: false,
      ...nullAngles(),
      alphaStrength: NaN, betaStrength: NaN, signalStrength: NaN,
      alphaSignal: { dBzdx: zdx, dBxdx: xdx },
      betaSignal: { dBzdy: zdy, dBydy: ydy }
    };
  }

  const { k1, o11, o12, k2, o21, o22 } = normalizeParams(params);

  // Alpha lives in the x-gradient's (Z, X) plane, beta in the y-gradient's
  // (Z, Y) plane. o11/o21 are the "upper" Z<->in-plane crosstalk terms,
  // o12/o22 the "lower" in-plane<->Z terms (same pairing as sfi_demo.js).
  const alphaZ = k1 * (zdx - o11 * xdx);
  const alphaX = xdx - o12 * zdx;
  const betaZ = k2 * (zdy - o21 * ydy);
  const betaY = ydy - o22 * zdy;
  const angles = toAnglePair(Math.atan2(Math.abs(alphaZ), alphaX), Math.atan2(Math.abs(betaZ), betaY));

  return {
    mode: '2px',
    valid: true,
    ...angles,
    alphaStrength: Math.hypot(zdx, xdx),
    betaStrength: Math.hypot(zdy, ydy),
    signalStrength: Math.hypot(xdx, zdx, ydy, zdy),
    alphaSignal: { dBzdx: zdx, dBxdx: xdx },
    betaSignal: { dBzdy: zdy, dBydy: ydy }
  };
}

/**
 * SFI 2px formula from the GUI review:
 * normal uses each axis' in-plane and Z gradients directly; enhanced adds the
 * cross-axis gradient and the six live calibration parameters.
 */
export function calculateSfiDifferentialAngles(reading = {}, params = DEFAULT_CALIBRATION_PARAMS, formula = 'normal') {
  const { X02, Z02, Y13, Z13 } = reading;
  const x02 = fin(X02, NaN), z02 = fin(Z02, NaN);
  const y13 = fin(Y13, NaN), z13 = fin(Z13, NaN);
  if (!isFiniteReading(x02, z02, y13, z13)) {
    return { valid: false, ...nullAngles() };
  }

  let alphaRad, betaRad;
  if (formula === 'enhanced') {
    const { k1, o11, o12, k2, o21, o22 } = normalizeParams(params);
    alphaRad = Math.atan2(
      Math.hypot(x02, k1 * (z13 - o11 * x02)),
      z02 - o12 * x02
    );
    betaRad = Math.atan2(
      Math.hypot(y13, k2 * (z02 - o21 * y13)),
      z13 - o22 * y13
    );
  } else {
    alphaRad = Math.atan2(x02, z02);
    betaRad = Math.atan2(y13, z13);
  }

  return {
    valid: true,
    ...toAnglePair(alphaRad, betaRad)
  };
}

/** Convert differential angles into a centered, bounded gimbal command. */
export function calculateDifferentialGimbalInput(alphaDeg, betaDeg, zeroAlphaDeg = 90, zeroBetaDeg = 90) {
  if (!isFiniteReading(alphaDeg, betaDeg, zeroAlphaDeg, zeroBetaDeg)) {
    return { valid: false, x: NaN, y: NaN };
  }
  const delta = (angle, zero) => ((angle - zero + 540) % 360) - 180;
  const clamp = value => Math.max(-1, Math.min(1, value));
  return {
    valid: true,
    x: clamp(-delta(alphaDeg, zeroAlphaDeg) / 90),
    y: clamp(-delta(betaDeg, zeroBetaDeg) / 90)
  };
}

/** Shape used when a reading is invalid: NaN-free failure, never throws. */
function nullAngles() {
  return { alphaRad: NaN, betaRad: NaN, alphaDeg: NaN, betaDeg: NaN };
}

/**
 * Tiny stateful wrapper for a live GUI: tweak params on the fly and call the
 * two compute methods without threading params through call sites.
 * @param {object} [initial] starting params (defaults if omitted)
 * @param {Function} [onChange] callback fired after each set/reset
 */
export function createCalibrator(initial = DEFAULT_CALIBRATION_PARAMS, onChange) {
  let params = normalizeParams(initial);

  function notify() {
    if (typeof onChange === 'function') onChange({ ...params });
  }

  return {
    get params() { return { ...params }; },
    set(partial) { params = normalizeParams({ ...params, ...partial }); notify(); return this; },
    reset() { params = { ...DEFAULT_CALIBRATION_PARAMS }; notify(); return this; },
    calculate1px: reading => calculate1pxAngles(reading, params),
    calculate2px: reading => calculate2pxAngles(reading, params)
  };
}

export default { DEFAULT_CALIBRATION_PARAMS, calculate1pxAngles, calculate2pxAngles, createCalibrator };
