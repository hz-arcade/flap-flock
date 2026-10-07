/**
 * Deterministic sine and cosine. `Math.sin` is only required to be approximately right, and
 * engines differ in the last bit (Safari uses the system library, Chrome and Cloudflare use
 * V8's own). The leaderboard replays clears on the server and needs the very same numbers as
 * the player's browser, so the simulation uses these instead: range reduction with
 * Math.floor and a polynomial, built only from + - * /, which IEEE 754 defines exactly.
 */
const PI = 3.141592653589793;
const TAU = 2 * PI;
const HALF_PI = PI / 2;
const C3 = -1 / 6;
const C5 = 1 / 120;
const C7 = -1 / 5040;
const C9 = 1 / 362880;
const C11 = -1 / 39916800;
const C13 = 1 / 6227020800;
const C15 = -1 / 1307674368000;
const C17 = 1 / 355687428096000;

export function dsin(x: number): number {
  // Reduce to [-π, π), then fold into [-π/2, π/2] where the series converges fast.
  let r = x - TAU * Math.floor((x + PI) / TAU);
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (C3 + r2 * (C5 + r2 * (C7 + r2 * (C9 + r2 * (C11 + r2 * (C13 + r2 * (C15 + r2 * C17))))))));
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}
