/**
 * World geometry in logical pixels. The gameplay band is 256 px tall: the bird flies in
 * y = 0..224 and the ground strip fills 224..256. The renderer may show extra sky and ground
 * around the band on tall screens, but nothing in the game depends on the viewport.
 */
export { LEAD_IN, LIP_W } from '../../shared/scoreRules';

/** Fixed simulation step in seconds. */
export const STEP = 1 / 120;
export const BAND_H = 256;
export const GROUND_Y = 224;
/** Soft ceiling: the bird stops here but does not die. */
export const CEIL_Y = -24;
/** Screen x of the bird; the camera follows it. */
export const BIRD_X = 56;
export const START_Y = 104;
/** Distance from the last pipe to the flagpole. */
export const RUNOUT = 140;
/** Distance from the flagpole to the castle door. */
export const CASTLE_GAP = 72;
export const PIPE_W = 24;
export const LIP_H = 12;
export const TILE = 16;
export const COIN_R = 5;
/** Gap edges (also of moving pipes at their extremes) stay this far from ceiling and ground. */
export const EDGE_MARGIN = 16;
/** Seconds after a crash before a tap can restart (stops a panicked double tap from skipping the result). */
export const RETRY_LOCK = 0.45;
