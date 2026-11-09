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
 * which applies the AE's Desmos model to the 2px channels with the roles the
 * bench shows (see that function). The `normal` branch is the calibration-free
 * two-signal angle; only `enhanced` consumes k1/o11/o12/k2/o21/o22.
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
// 1px: 20 LSB/mT is the datasheet V0.5 figure (table 11), valid at the factory
// GAINSEL_1PX (9 per the AE); at the 3x setting the mT values read ~3x high.
//
// 2px: this is a DISPLAY scale, not datasheet units. The datasheet gives
// 120 LSB per mT/mm (table 12, at the factory GAINSEL_2PX, which the GUI
// overwrites with 9 or 37) and labels the pixel spacing dHE = 1.10 mm
// (figure 25). Dividing by 120 would read every gradient 6x lower: worked
// through on bench captures, the full-tilt readings (0.5-1.5 on this scale)
// fall under the "no magnet" gate (sfi_demo.js NO_MAG_DIFF_MT_MM = 1), which
// holds alpha/beta at 90°. That was calculated, not run in the GUI.
// The thresholds - no magnet 1, weak 3, PUSHED 10 mT/mm, the 8 mT/mm plot full
// scale - were chosen on this scale (PUSHED and the plot scale against the
// simulator), so change the divisor only together with all of them, ideally
// from a bench calibration (X02 counts against (Bx0 - Bx2) / 1.10 mm at a known
// 2px gain). The angles do not depend on this scale: every channel is divided
// by the same number.
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
 * SFI 2px angles: the AE's signals (alpha from dBx/dx and dBz/dx, beta from
 * dBy/dy and dBz/dy) in the AE's Desmos model, with the roles the bench shows.
 * On the rig the in-plane gradients X02/Y13 carry the large resting value and
 * the Z gradients Z02/Z13 sit near zero and follow the tilt direction (their
 * sign tracked Bx/By with r = 0.93/0.95 over a full-tilt circle; X02/Y13 did
 * not). So X02/Y13 take the model's z1 slot (under the root), Z02/Z13 its x1
 * slot (the signed leg), and the other axis' Z gradient is the cross term:
 *   alpha = atan2( hypot(X02, k1*(Z13 - o11*X02)), Z02 - o12*X02 )
 *   beta  = atan2( hypot(Y13, k2*(Z02 - o21*Y13)), Z13 - o22*Y13 )
 * Assigning by name instead (z1 = Z02, x1 = X02) put the direction-carrying
 * channel under the root and lost the tilt sign on the bench.
 * normal is the uncalibrated two-signal angle; enhanced adds the six constants.
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

/**
 * Convert differential angles into a centered, bounded gimbal command.
 * fullScaleDeg is the angle change that gives full deflection: a real stick
 * only swings the angles by a fraction of 90°, so the caller sets it from the
 * bench rather than the model being stuck near upright.
 */
export function calculateDifferentialGimbalInput(alphaDeg, betaDeg, zeroAlphaDeg = 90, zeroBetaDeg = 90, fullScaleDeg = 90) {
  if (!isFiniteReading(alphaDeg, betaDeg, zeroAlphaDeg, zeroBetaDeg)) {
    return { valid: false, x: NaN, y: NaN };
  }
  const span = Number.isFinite(fullScaleDeg) && fullScaleDeg > 0 ? fullScaleDeg : 90;
  const delta = (angle, zero) => ((angle - zero + 540) % 360) - 180;
  const clamp = value => Math.max(-1, Math.min(1, value));
  return {
    valid: true,
    x: clamp(-delta(alphaDeg, zeroAlphaDeg) / span),
    y: clamp(-delta(betaDeg, zeroBetaDeg) / span)
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
