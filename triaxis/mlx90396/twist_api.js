/**
 * twist_api.js
 * Twist-mode signal processing for the MLX90396.
 *
 *  1px mode (units: mT)   : X0 (Bx), Y0 (By), Z0 (Bz)
 *     alpha = atan2(Z0, X0)               strength = sqrt(Z0^2 + X0^2)
 *     beta  = atan2(Z0, Y0)               strength = sqrt(Z0^2 + Y0^2)
 *
 *  2px mode (units: mT/mm): X02 (dBx/dx), Z02 (dBz/dx), Y13 (dBy/dy), Z13 (dBz/dy)
 *     alpha = atan2(Z02, X02)             strength = sqrt(Z02^2 + X02^2)
 *     beta  = atan2(Z13, Y13)             strength = sqrt(Z13^2 + Y13^2)
 *
 *  The calibrated (Desmos) angles are computed by the shared ../angle_calib.js
 *  module so the thumbstick and the SFI page run one and the same engine.
 */

import {
  DEFAULT_CALIBRATION_PARAMS as CALIB_DEFAULTS,
  normalizeParams,
  calculateDesmosAngles,
  SINGLE_PIXEL_LSB_PER_MT,
  lsbPerMtMm
} from '../angle_calib.js';

const toDeg = (rad) => (rad * 180) / Math.PI;

export function calcTwist1px({ X0, Y0, Z0 }) {
  const alpha = Math.atan2(Z0, X0);
  const beta = Math.atan2(Z0, Y0);
  return {
    alphaRad: alpha,
    betaRad: beta,
    alphaDeg: toDeg(alpha),
    betaDeg: toDeg(beta),
    strengthAlpha: Math.hypot(Z0, X0),
    strengthBeta: Math.hypot(Z0, Y0),
    unit: 'mT',
    mode: '1px',
  };
}

export function calcTwist2px({ X02, Z02, Y13, Z13 }) {
  const alpha = Math.atan2(Z02, X02);
  const beta = Math.atan2(Z13, Y13);
  return {
    alphaRad: alpha,
    betaRad: beta,
    alphaDeg: toDeg(alpha),
    betaDeg: toDeg(beta),
    strengthAlpha: Math.hypot(Z02, X02),
    strengthBeta: Math.hypot(Z13, Y13),
    unit: 'mT/mm',
    mode: '2px',
  };
}

// --- Calibration (Desmos model, rad -> deg) ---
//   a1 = atan2( sqrt( z1^2 + (k1 * (y1 - o11 * z1))^2 ), (x1 - o12 * z1) )
//   b1 = atan2( sqrt( z1^2 + (k2 * (x1 - o21 * z1))^2 ), (y1 - o22 * z1) )
// Live params follow the module's defaults; normalizeParams drops NaN input.
export const TWIST_CAL = { ...CALIB_DEFAULTS };

export function applyTwistCalibration(x, y, z) {
  // One angle definition only. The old identity fast-path hand-rolled
  // atan2(z, x) with a SIGNED z: a negative vertical field then gave negative
  // alpha/beta, and the radar's (90-α)/90 mapping pushed the needle past the
  // rim into the corner until a K or offset was changed. Delegating to the
  // Desmos core keeps atan2's first argument a magnitude (hypot), so the
  // calibrated angles stay in the 0..180° band at every parameter set -
  // including the k1=k2=1, o=0 default.
  const p = normalizeParams(TWIST_CAL);
  return calculateDesmosAngles(x, y, z, p);
}

// Combined pipeline: raw alpha/beta + strengths for the selected mode, then
// Desmos calibration applied and returned in degrees. 2px cross-terms use the
// perpendicular differential pair (alpha consumes Y13, beta consumes X02).
export function computeTwistSignals(mode = '1px', input = null) {
  const is2px = mode === '2px';
  const src = input || (is2px
    ? { X02: 0, Z02: 0, Y13: 0, Z13: 0 }
    : { X0: 0, Y0: 0, Z0: 0 });
  const raw = is2px ? calcTwist2px(src) : calcTwist1px(src);

  const alphaIn = is2px
    ? { x: src.X02, y: src.Y13, z: src.Z02 }
    : { x: src.X0, y: src.Y0, z: src.Z0 };
  const betaIn = is2px
    ? { x: src.X02, y: src.Y13, z: src.Z13 }
    : { x: src.X0, y: src.Y0, z: src.Z0 };

  const calA = applyTwistCalibration(alphaIn.x, alphaIn.y, alphaIn.z);
  const calB = applyTwistCalibration(betaIn.x, betaIn.y, betaIn.z);

  return {
    ...raw,
    alphaCalDeg: calA.alphaDeg,
    alphaCalRad: calA.alphaRad,
    betaCalDeg: calB.betaDeg,
    betaCalRad: calB.betaRad,
  };
}

// Derive 1px + 2px inputs from the 4 pixel readouts, converted from raw LSB to
// physical units (absolute mT, differential mT/mm) so the strengths the panel
// prints carry true units. Both divisors live in angle_calib.js and are shared
// with the SFI page; dividing every component of a signal by the same
// divisor leaves the atan2 angles untouched.
// When the chip's dedicated differential channels are available (SCPI resDiff:
// x02/y02/z02/x13/y13/z13) use them directly for the 2px pair, so the 2px
// GAINSEL trim actually affects the readout. The software (p2 - p0) / 2
// difference is only the fallback for Arduino / emulation frames that carry
// just the four absolute pixels.
export function deriveTwistInputsFromPoints(points, diff = null) {
  const p0 = points?.[0] || {};
  const p1 = points?.[1] || {};
  const p2 = points?.[2] || {};
  const p3 = points?.[3] || {};
  const hasDiff = !!diff && ['x02', 'z02', 'y13', 'z13'].every(k => Number.isFinite(diff[k]));
  const lsbPerMt = SINGLE_PIXEL_LSB_PER_MT;
  const lsbPerMtPerMm = lsbPerMtMm();
  return {
    X0: (p0.x ?? 0) / lsbPerMt, Y0: (p0.y ?? 0) / lsbPerMt, Z0: (p0.z ?? 0) / lsbPerMt,
    X02: (hasDiff ? diff.x02 : ((p2.x ?? 0) - (p0.x ?? 0)) / 2) / lsbPerMtPerMm,
    Z02: (hasDiff ? diff.z02 : ((p2.z ?? 0) - (p0.z ?? 0)) / 2) / lsbPerMtPerMm,
    Y13: (hasDiff ? diff.y13 : ((p3.y ?? 0) - (p1.y ?? 0)) / 2) / lsbPerMtPerMm,
    Z13: (hasDiff ? diff.z13 : ((p3.z ?? 0) - (p1.z ?? 0)) / 2) / lsbPerMtPerMm,
  };
}

// --- Gain Configuration (MLX90396 GAINSEL register) ---
// The UI exposes just the two factory presets (1x = 9, 3x = 37); this table
// holds the selection per mode. Switching 1px<->2px re-syncs the display and
// starting the live demo re-reads the chip and adopts whatever it actually
// holds. NOTE: the mode switch does not push this table value to the chip.
// TODO(hw-trim): during the physical Arduino hardware validation session,
// confirm the preset bits against the GAINSEL register table in the MLX90396
// datasheet before flashing.
// Defaults follow the AE's twist-demo guidance: 1px runs at 3x (gain 37 ≈ 219)
// because the single-pixel path needs the extra ~3x electrical gain there; 2px
// keeps the 1x factory trim (gain 9 ≈ 72). Final-test trimming can shift the
// exact value, so the UI also exposes a free 0-63 trim field per mode.
export const GAINSEL = {
  '1px': 0b100101, // 37 — 3x preset (~219), twist-demo default
  '2px': 0b001001, // 9  — 1x preset (~72)
};

export function setGainSel(mode, value) {
  GAINSEL[mode] = value & 0x3F;
  return GAINSEL[mode];
}

export function getGainSel(mode) {
  return GAINSEL[mode] ?? 0;
}