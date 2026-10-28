// Units are the WAD's map units; time is tics at 35 Hz; angles are integers
// with 65536 to a full turn (east = 0, counter-clockwise).

export const TICRATE = 35;
export const ANG_FULL = 65536;
export const ANG90 = 16384;
export const ANG180 = 32768;

const FINE = 8192;
const SINE = Array.from({ length: FINE }, (_, i) => Math.sin((i * 2 * Math.PI) / FINE));

export function normAngle(a) {
  return ((a % ANG_FULL) + ANG_FULL) % ANG_FULL;
}

export function sinOf(a) {
  return SINE[normAngle(a) >> 3];
}

export function cosOf(a) {
  return SINE[normAngle(a + ANG90) >> 3];
}

// The angle from (x1, y1) toward (x2, y2), quantised to the angle unit.
export function angleTo(x1, y1, x2, y2) {
  return normAngle(Math.round((Math.atan2(y2 - y1, x2 - x1) * ANG_FULL) / (2 * Math.PI)));
}

// Snapshots must round-trip through JSON exactly: positions keep 16 bits of
// fraction and never carry -0.
export function q(n) {
  const r = Math.round(n * 65536) / 65536;
  return r === 0 ? 0 : r;
}

export const PLAYER = Object.freeze({
  radius: 16,
  height: 56,
  viewHeight: 41,
  // Thrust per tic from walking and running, and the turn per tic.
  walkThrust: 0.78125,
  runThrust: 1.5625,
  turn: 640,
  runTurn: 1280,
});

export const MAXSTEP = 24;
export const MAXMOVE = 30;
export const GRAVITY = 1;
export const FRICTION = 0.90625;
export const STOPSPEED = 0.0625;
export const USERANGE = 64;
export const MELEERANGE = 64;
export const MISSILERANGE = 2048;
