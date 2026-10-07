/**
 * Song building blocks: 16 sixteenth-note steps per bar. Leads are written one eighth note per
 * token ("-" = rest, "~" = hold the previous note one more eighth). Arps and bass are derived
 * from the chords so the parts can never clash.
 */
export const STEPS_PER_BAR = 16;

export interface Note {
  /** Scientific pitch, e.g. "E5". */
  n: string;
  /** Length in steps. */
  len: number;
}

export type Track = (Note | null)[];
export type Drum = 'kick' | 'snare' | 'hat' | 'hatSoft';

export interface Song {
  id: string;
  bpm: number;
  steps: number;
  lead: Track;
  arp: Track;
  bass: Track;
  drums: Drum[][];
  /** Lead voice: 'pulse' = square-ish chip lead, 'bell' = fast-decaying triangle. */
  leadVoice: 'pulse' | 'bell';
  /** Repeat each lead note quietly this many steps later (0 = off). */
  echo: number;
  /** Key: pitch classes allowed in the lead (tested). */
  scale: readonly string[];
  chords: readonly (readonly string[])[];
}

const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

export function normPc(pc: string): string {
  return FLAT[pc] ?? pc;
}

/** Note of pitch class `pc` in the lowest octave at or above `base`. */
export function above(base: string, pc: string): string {
  const m = /^([A-G][#b]?)(\d)$/.exec(base)!;
  const bi = PC.indexOf(normPc(m[1]!));
  const pi = PC.indexOf(normPc(pc));
  const octave = parseInt(m[2]!, 10) + (pi < bi ? 1 : 0);
  return `${normPc(pc)}${octave}`;
}

export function empty(steps: number): Track {
  return new Array<Note | null>(steps).fill(null);
}

export function buildLead(bars: readonly string[]): Track {
  const t = empty(bars.length * STEPS_PER_BAR);
  let last: Note | null = null;
  bars.forEach((bar, b) => {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== 8) throw new Error(`lead bar ${b} needs 8 eighths: ${bar}`);
    tokens.forEach((tok, i) => {
      if (tok === '-') {
        last = null;
        return;
      }
      if (tok === '~') {
        if (last) last.len += 2;
        return;
      }
      const note: Note = { n: tok.replace(/^([A-G])b/, (_, l: string) => normPc(`${l}b`)), len: 2 };
      t[b * STEPS_PER_BAR + i * 2] = note;
      last = note;
    });
  });
  return t;
}

/** Arpeggio on 16ths through the chord tones; `shape` indexes [root, 3rd, 5th, octave]. */
export function buildArp(chords: readonly (readonly string[])[], octave: number, shape: readonly number[], every = 1): Track {
  const t = empty(chords.length * STEPS_PER_BAR);
  chords.forEach((chord, b) => {
    const root = `${normPc(chord[0]!)}${octave}`;
    const tones = [root, above(root, chord[1]!), above(root, chord[2]!), `${normPc(chord[0]!)}${octave + 1}`];
    for (let i = 0; i < STEPS_PER_BAR; i += every) t[b * STEPS_PER_BAR + i] = { n: tones[shape[(i / every) % shape.length]!]!, len: every };
  });
  return t;
}

/** Bass from a per-bar pattern of 16 tokens: R = root, 5 = fifth, O = octave, - = rest. */
export function buildBass(chords: readonly (readonly string[])[], pattern: string, octave = 2): Track {
  const tokens = pattern.trim().split(/\s+/);
  if (tokens.length !== STEPS_PER_BAR) throw new Error('bass pattern needs 16 steps');
  const t = empty(chords.length * STEPS_PER_BAR);
  chords.forEach((chord, b) => {
    const root = `${normPc(chord[0]!)}${octave}`;
    const fifth = above(root, chord[2]!);
    const oct = `${normPc(chord[0]!)}${octave + 1}`;
    tokens.forEach((p, i) => {
      if (p === '-') return;
      t[b * STEPS_PER_BAR + i] = { n: p === 'R' ? root : p === '5' ? fifth : oct, len: 1 };
    });
  });
  return t;
}

/** Drums from per-bar strings of 16 characters: k = kick, s = snare, h = hat, . = soft hat, - = rest. */
export function buildDrums(bars: number, pattern: { main: string; fill?: string }): Drum[][] {
  const out: Drum[][] = [];
  for (let b = 0; b < bars; b++) {
    const p = (b === bars - 1 && pattern.fill ? pattern.fill : pattern.main).replace(/\s+/g, '');
    if (p.length !== STEPS_PER_BAR) throw new Error('drum bar needs 16 steps');
    for (const ch of p) {
      const hits: Drum[] = [];
      if (ch === 'k' || ch === 'K') hits.push('kick');
      if (ch === 's' || ch === 'S') hits.push('snare');
      if (ch === 'h' || ch === 'K' || ch === 'S') hits.push('hat');
      if (ch === '.') hits.push('hatSoft');
      out.push(hits);
    }
  }
  return out;
}
