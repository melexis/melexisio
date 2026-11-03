/**
 * angle_calib.test.mjs — unit + parity tests for triaxis/angle_calib.js
 *
 * The reference implementation below is an exact copy of the Desmos-derived
 * math shipped in triaxis/mlx90396-voxdale/sfi_demo.js (calculateDesmosAngles,
 * computeSfi1Px, computeSfi2Px), so the parity sweep proves the clean module
 * reproduces the values the SFI app already displays.
 *
 * Run: node triaxis/angle_calib.test.mjs
 */
import {
  DEFAULT_CALIBRATION_PARAMS,
  normalizeParams,
  calculate1pxAngles,
  calculate2pxAngles,
  calculateSfiDifferentialAngles,
  calculateDifferentialGimbalInput,
  createCalibrator,
  SINGLE_PIXEL_LSB_PER_MT,
  DEFAULT_SENSOR_PIXEL_PITCH_MM,
  getSensorPixelPitchMm,
  setSensorPixelPitchMm,
  lsbPerMtMm
} from './angle_calib.js';
import { deriveTwistInputsFromPoints } from './mlx90396/twist_api.js';

// --- Reference oracle (verbatim math from sfi_demo.js) ---
const REF_PARAMS = { k1: 1.0, o11: 0.0, o12: 0.0, k2: 1.0, o21: 0.0, o22: 0.0 };
function refDesmos(x, y, z, params = REF_PARAMS) {
  const { k1, o11, o12, k2, o21, o22 } = { ...REF_PARAMS, ...params };
  const crossY = k1 * (y - o11 * z);
  const numA = Math.sqrt(z * z + crossY * crossY);
  const denA = x - o12 * z;
  const a1_rad = Math.atan2(numA, denA);
  const crossX = k2 * (x - o21 * z);
  const numB = Math.sqrt(z * z + crossX * crossX);
  const denB = y - o22 * z;
  const b1_rad = Math.atan2(numB, denB);
  const radToDeg = 180 / Math.PI;
  return { alphaDeg: a1_rad * radToDeg, betaDeg: b1_rad * radToDeg, alphaRad: a1_rad, betaRad: b1_rad };
}
function ref1px(bx, by, bz, params = REF_PARAMS) {
  const alphaStrength = Math.sqrt(bz * bz + bx * bx);
  const betaStrength = Math.sqrt(bz * bz + by * by);
  const signalStrength = Math.sqrt(bx * bx + by * by + bz * bz);
  const angles = refDesmos(bx, by, bz, params);
  return { mode: '1px', alphaStrength, betaStrength, signalStrength, ...angles };
}
function ref2px(dbx_dx, dbz_dx, dby_dy, dbz_dy, params = REF_PARAMS) {
  const p = { ...REF_PARAMS, ...params };
  const alphaStrength = Math.sqrt(dbz_dx * dbz_dx + dbx_dx * dbx_dx);
  const betaStrength = Math.sqrt(dbz_dy * dbz_dy + dby_dy * dby_dy);
  const signalStrength = Math.sqrt(dbx_dx * dbx_dx + dby_dy * dby_dy + dbz_dx * dbz_dx + dbz_dy * dbz_dy);
  const alphaZ = p.k1 * (dbz_dx - p.o11 * dbx_dx);
  const alphaX = dbx_dx - p.o12 * dbz_dx;
  const betaZ = p.k2 * (dbz_dy - p.o21 * dby_dy);
  const betaY = dby_dy - p.o22 * dbz_dy;
  const radToDeg = 180 / Math.PI;
  const angles = {
    alphaRad: Math.atan2(Math.abs(alphaZ), alphaX),
    betaRad: Math.atan2(Math.abs(betaZ), betaY)
  };
  angles.alphaDeg = angles.alphaRad * radToDeg;
  angles.betaDeg = angles.betaRad * radToDeg;
  return { mode: '2px', alphaStrength, betaStrength, signalStrength, ...angles };
}

let pass = 0, total = 0;
const chk = (name, ok, extra = '') => {
  total++;
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const ALTS = [-3, -1, 0, 1, 3];
const GRADS = [-4, -1, 0, 1, 2];
const PARAM_SETS = [
  'default',
  { k1: 2.0, o11: 0.3, o12: -0.1, k2: 1.2, o21: -0.05, o22: 0.4 },
  { k1: 0.74, o11: -0.5, o12: 0.5, k2: 1.9, o21: 0.1, o22: -0.2 }
];

console.log('=== synthetic 1px and 2px vectors (defaults) ===');
chk('1px (0,0,5): alpha=90, beta=90', near(calculate1pxAngles({ Bz: 5, Bx: 0, By: 0 }).alphaDeg, 90));
chk('1px (5,0,0): alpha=0', near(calculate1pxAngles({ Bx: 5, By: 0, Bz: 0 }).alphaDeg, 0));
chk('1px (-5,0,0): alpha=180', near(calculate1pxAngles({ Bx: -5, By: 0, Bz: 0 }).alphaDeg, 180));
chk('1px hypot strength == |B|', near(calculate1pxAngles({ Bx: 3, By: 4, Bz: 12 }).signalStrength, 13));
chk('2px (+z grad): alpha=90', near(calculate2pxAngles({ dBxdx: 0, dBzdx: 4, dBydy: 0, dBzdy: 0 }).alphaDeg, 90));
chk('2px (-z grad): alpha=90 (abs)', near(calculate2pxAngles({ dBxdx: 0, dBzdx: -4, dBydy: 0, dBzdy: 0 }).alphaDeg, 90));
const normalSfi = calculateSfiDifferentialAngles({ X02: 3, Z02: 4, Y13: 4, Z13: 3 });
chk('SFI normal uses atan2(X02,Z02) and atan2(Y13,Z13)',
  near(normalSfi.alphaDeg, Math.atan2(3, 4) * 180 / Math.PI)
  && near(normalSfi.betaDeg, Math.atan2(4, 3) * 180 / Math.PI));
const enhancedSfi = calculateSfiDifferentialAngles(
  { X02: 2, Z02: 5, Y13: 3, Z13: 7 },
  { k1: 2, o11: 0.25, o12: 0.1, k2: 1.5, o21: 0.2, o22: 0.15 },
  'enhanced'
);
chk('SFI enhanced matches the reviewed cross-axis formula',
  near(enhancedSfi.alphaRad, Math.atan2(Math.hypot(2, 2 * (7 - 0.25 * 2)), 5 - 0.1 * 2))
  && near(enhancedSfi.betaRad, Math.atan2(Math.hypot(3, 1.5 * (5 - 0.2 * 3)), 7 - 0.15 * 3)));
const defaultEnhanced = calculateSfiDifferentialAngles(
  { X02: 2, Z02: 5, Y13: 3, Z13: 7 },
  DEFAULT_CALIBRATION_PARAMS,
  'enhanced'
);
chk('SFI enhanced defaults apply the unscaled cross-axis terms',
  near(defaultEnhanced.alphaRad, Math.atan2(Math.hypot(2, 7), 5))
  && near(defaultEnhanced.betaRad, Math.atan2(Math.hypot(3, 5), 7)));
{
  // Bench shape: X02/Y13 large at rest, Z02/Z13 ~0 and signed with the tilt.
  const rest = calculateSfiDifferentialAngles({ X02: 4.4, Z02: 0, Y13: 5, Z13: 0 }, DEFAULT_CALIBRATION_PARAMS, 'enhanced');
  const right = calculateSfiDifferentialAngles({ X02: 4.4, Z02: 2, Y13: 5, Z13: 0 }, DEFAULT_CALIBRATION_PARAMS, 'enhanced');
  const left = calculateSfiDifferentialAngles({ X02: 4.4, Z02: -2, Y13: 5, Z13: 0 }, DEFAULT_CALIBRATION_PARAMS, 'enhanced');
  chk('SFI enhanced sits at 90° at rest and keeps the tilt direction (Z02 = +2 vs -2)',
    near(rest.alphaDeg, 90) && right.alphaDeg < 90 && left.alphaDeg > 90
    && near(left.alphaDeg + right.alphaDeg, 180));
}
chk('gimbal full scale sets the deflection span',
  near(calculateDifferentialGimbalInput(60, 90, 90, 90, 60).x, 0.5));
chk('SFI differential rejects invalid samples',
  calculateSfiDifferentialAngles({ X02: NaN, Z02: 1, Y13: 2, Z13: 3 }).valid === false);
const centeredGimbal = calculateDifferentialGimbalInput(90, 90);
chk('differential zero holds the gimbal centered', centeredGimbal.valid && centeredGimbal.x === 0 && centeredGimbal.y === 0);
const movedGimbal = calculateDifferentialGimbalInput(100, 70, 90, 90);
chk('differential angle changes steer both gimbal axes with bounded scale',
  movedGimbal.valid && near(movedGimbal.x, -10 / 90) && near(movedGimbal.y, 20 / 90));
chk('gimbal input follows the shortest path across the angle seam',
  near(calculateDifferentialGimbalInput(-179, 90, 179, 90).x, -2 / 90));
chk('gimbal inputs clamp to the physical command range',
  calculateDifferentialGimbalInput(0, 0, 90, 90).x === 1
  && calculateDifferentialGimbalInput(0, 0, 90, 90).y === 1);
chk('gimbal input rejects invalid angles',
  calculateDifferentialGimbalInput(NaN, 90).valid === false);

console.log('\n=== parity: module vs sfi_demo reference (1px) ===');
let mismatch = 0, compared = 0;
for (const ps of PARAM_SETS) {
  const p = ps === 'default' ? DEFAULT_CALIBRATION_PARAMS : ps;
  for (const x of ALTS) for (const y of ALTS) for (const z of ALTS) {
    const want = ref1px(x, y, z, ps === 'default' ? REF_PARAMS : ps);
    const got = calculate1pxAngles({ Bx: x, By: y, Bz: z }, p);
    for (const f of ['alphaDeg', 'betaDeg', 'alphaStrength', 'betaStrength', 'signalStrength']) {
      compared++;
      if (!near(got[f], want[f], 1e-9)) mismatch++;
    }
  }
}
chk(`1px parity sweep: ${compared} values match reference`, mismatch === 0, `${mismatch} mismatches`);

console.log('\n=== parity: module vs sfi_demo reference (2px) ===');
mismatch = 0; compared = 0;
for (const ps of PARAM_SETS) {
  const p = ps === 'default' ? DEFAULT_CALIBRATION_PARAMS : ps;
  for (const x of GRADS) for (const z of GRADS) for (const y of GRADS) for (const w of GRADS) {
    const want = ref2px(x, z, y, w, ps === 'default' ? REF_PARAMS : ps);
    const got = calculate2pxAngles({ dBxdx: x, dBzdx: z, dBydy: y, dBzdy: w }, p);
    for (const f of ['alphaDeg', 'betaDeg', 'alphaStrength', 'betaStrength', 'signalStrength']) {
      compared++;
      if (!near(got[f], want[f], 1e-9)) mismatch++;
    }
  }
}
chk(`2px parity sweep: ${compared} values match reference`, mismatch === 0, `${mismatch} mismatches`);

console.log('\n=== calibration parameter behaviour ===');
const b = calculate1pxAngles({ Bx: 2, By: 1, Bz: 1 }, { k1: 1, o11: 0, o12: 0, k2: 1, o21: 0, o22: 0 });
const k2x = calculate1pxAngles({ Bx: 2, By: 1, Bz: 1 }, { k1: 2, o11: 0, o12: 0, k2: 1, o21: 0, o22: 0 });
chk('k1 raises alpha when By crosstalk present', k2x.alphaDeg > b.alphaDeg, `${b.alphaDeg} -> ${k2x.alphaDeg}`);
const o12 = calculate1pxAngles({ Bx: 2, By: 0, Bz: 1 }, { k1: 1, o11: 0, o12: 0.5, k2: 1, o21: 0, o22: 0 });
chk('o12 moves denominator, changing alpha', near(o12.alphaDeg, Math.atan2(Math.hypot(1, 0), 2 - 0.5 * 1) * 180 / Math.PI), String(o12.alphaDeg));
chk('defaults unchanged', JSON.stringify(normalizeParams()) === JSON.stringify({ ...DEFAULT_CALIBRATION_PARAMS }));

console.log('\n=== robustness (NaN / Infinity / bad params) ===');
const bad = calculate1pxAngles({ Bx: NaN, By: 1, Bz: 1 });
chk('NaN reading -> valid:false', bad.valid === false);
chk('NaN reading -> angles stay NaN, never throw', Number.isNaN(bad.alphaDeg) && Number.isNaN(bad.betaDeg));
const inf = calculate2pxAngles({ dBxdx: Infinity, dBzdx: 1, dBydy: 1, dBzdy: 1 });
chk('Infinity reading -> valid:false', inf.valid === false);
const pn = calculate1pxAngles({ Bx: 2, By: 1, Bz: 1 }, { k1: NaN, o11: undefined, o12: Infinity, bogus: 5, extra: 'x' });
chk('NaN/undefined/Infinity params fall back to defaults', near(pn.alphaDeg, ref1px(2, 1, 1).alphaDeg) && near(pn.betaDeg, ref1px(2, 1, 1).betaDeg));
chk('unknown param keys are ignored', JSON.stringify(normalizeParams({ k1: NaN, bogus: 5 })) === JSON.stringify({ ...DEFAULT_CALIBRATION_PARAMS }));
const pnv = calculate1pxAngles({ Bx: 2, By: 1, Bz: 1 }, { o21: 1 });
chk('valid override (o21=1) is still applied', near(pnv.betaDeg, ref1px(2, 1, 1, { o21: 1 }).betaDeg));
chk('missing reading object is safe', calculate1pxAngles().valid === false);

console.log('\n=== createCalibrator live-update wrapper ===');
let notified = 0;
const cal = createCalibrator({ k1: 2 }, () => notified++);
chk('initial k1=2', cal.params.k1 === 2);
chk('set() merges and notifies', (cal.set({ o11: 0.5 }), notified === 1 && cal.params.o11 === 0.5));
chk('reset() restores defaults', (cal.reset(), cal.params.k1 === 1 && cal.params.o22 === 0));
chk('compute uses live params', (cal.set({ k1: 3 }), near(cal.calculate1px({ Bx: 2, By: 1, Bz: 1 }).alphaDeg, ref1px(2, 1, 1, { k1: 3 }).alphaDeg)));
chk('params getter returns a copy', (cal.set({ k1: 1 }), (() => { const p = cal.params; p.k1 = 999; return cal.params.k1 === 1; })()));

console.log('\n=== shared display scale (raw LSB -> physical units) ===');
chk('single-pixel scale is 20 counts per mT', SINGLE_PIXEL_LSB_PER_MT === 20);
chk('default pixel pitch is 1.0 mm', DEFAULT_SENSOR_PIXEL_PITCH_MM === 1.0);
chk('default 2px divisor is 20 counts per mT/mm', near(lsbPerMtMm(), 20));
chk('pitch 0.5 mm -> divisor 10', (setSensorPixelPitchMm(0.5), near(lsbPerMtMm(), 10)));
chk('pitch 6.0 mm reproduces the old hard-coded divisor of 120',
  (setSensorPixelPitchMm(6), near(lsbPerMtMm(), 120)));
chk('non-positive / NaN pitch is ignored',
  (setSensorPixelPitchMm(0), setSensorPixelPitchMm(-3), setSensorPixelPitchMm(NaN), near(lsbPerMtMm(), 120)));
chk('a numeric string is accepted', (setSensorPixelPitchMm('2'), near(lsbPerMtMm(), 40)));
chk('reset restores the 1.0 mm default',
  (setSensorPixelPitchMm(DEFAULT_SENSOR_PIXEL_PITCH_MM), near(lsbPerMtMm(), 20) && getSensorPixelPitchMm() === 1.0));

// The scale only ever multiplies a whole signal by one constant, which is what
// lets the pages re-range mT/mm without touching the calibration.
const raw1 = calculate1pxAngles({ Bx: 31, By: 343, Bz: 8 });
const scaled1 = calculate1pxAngles({ Bx: 31 / 20, By: 343 / 20, Bz: 8 / 20 });
chk('1px angle is invariant under the mT scaling',
  near(raw1.alphaDeg, scaled1.alphaDeg) && near(raw1.betaDeg, scaled1.betaDeg));
const raw2 = calculate2pxAngles({ dBxdx: 21, dBzdx: -3, dBydy: -61, dBzdy: 39 });
const scaled2 = calculate2pxAngles({ dBxdx: 21 / 20, dBzdx: -3 / 20, dBydy: -61 / 20, dBzdy: 39 / 20 });
chk('2px angle is invariant under the mT/mm scaling',
  near(raw2.alphaDeg, scaled2.alphaDeg) && near(raw2.betaDeg, scaled2.betaDeg));

console.log('\n=== thumbstick input scaling (twist_api) ===');
const PTS = [
  { x: 31, y: 343, z: 8 },
  { x: 5, y: 286, z: 27 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 }
];
const chipDiff = { x02: 21, z02: -3, y13: -61, z13: 39 };
const withChip = deriveTwistInputsFromPoints(PTS, chipDiff);
chk('1px fields arrive in mT', near(withChip.X0, 31 / 20) && near(withChip.Y0, 343 / 20) && near(withChip.Z0, 8 / 20));
chk('chip differential pair arrives in mT/mm',
  near(withChip.X02, 21 / 20) && near(withChip.Z02, -3 / 20)
  && near(withChip.Y13, -61 / 20) && near(withChip.Z13, 39 / 20));
const noChip = deriveTwistInputsFromPoints(PTS, null);
chk('without chip channels the pair falls back to (p2-p0)/2, still scaled',
  near(noChip.X02, ((0 - 31) / 2) / 20) && near(noChip.Z02, ((0 - 8) / 2) / 20)
  && near(noChip.Y13, ((0 - 286) / 2) / 20) && near(noChip.Z13, ((0 - 27) / 2) / 20));

console.log(`\n${pass}/${total} checks passed`);
if (pass !== total) process.exit(1);
