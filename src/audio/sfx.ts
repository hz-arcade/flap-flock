import type { BirdId } from '../game/birds';
import { audio } from './context';
import { music } from './music';
import { noteToFreq } from './notes';

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, slideTo?: number, when = 0): void {
  const ctx = audio.ctx;
  const out = audio.sfx;
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass', when = 0, slideTo?: number): void {
  const ctx = audio.ctx;
  const out = audio.sfx;
  if (!ctx || !out) return;
  const t0 = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = audio.noiseBuffer();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

/** A little tune on the sfx bus, with the music ducked under it. Tokens: "E5:2" = E5 for 2 units. */
function jingle(tokens: string, unit: number, type: OscillatorType = 'square', vol = 0.22): void {
  let t = 0;
  for (const tok of tokens.split(/\s+/)) {
    const [n, l] = tok.split(':');
    const len = Number(l ?? 1) * unit;
    if (n && n !== '-') {
      tone(noteToFreq(n), len * 0.95, type, vol, undefined, t);
      tone(noteToFreq(n) * 2, len * 0.6, 'triangle', vol * 0.35, undefined, t);
    }
    t += len;
  }
  music.duck(t + 0.2);
}

/** Flap pitch per bird: small birds chirp higher. */
const CHIRP: Record<BirdId, number> = { duck: 1, chicken: 0.85, pelican: 0.7, sparrow: 1.5, penguin: 0.8, eagle: 0.9 };

export const sfx = {
  flap(bird: BirdId): void {
    const k = CHIRP[bird];
    noise(0.07, 0.25, 900 * k, 'bandpass', 0, 2200 * k);
    tone(420 * k, 0.05, 'triangle', 0.12, 620 * k);
  },
  coin(): void {
    tone(1046.5, 0.05, 'triangle', 0.35);
    tone(1568, 0.16, 'triangle', 0.3, undefined, 0.05);
  },
  pass(): void {
    tone(1318.5, 0.04, 'sine', 0.1);
  },
  hit(): void {
    noise(0.18, 0.5, 600, 'lowpass');
    tone(140, 0.16, 'square', 0.25, 60);
  },
  fall(): void {
    tone(700, 0.5, 'triangle', 0.18, 140, 0.1);
  },
  land(): void {
    noise(0.1, 0.35, 300, 'lowpass');
  },
  click(): void {
    tone(1200, 0.035, 'square', 0.08);
  },
  checkpoint(): void {
    jingle('G5:1 D6:3', 0.08, 'square', 0.18);
  },
  clear(): void {
    jingle('E5:1 G5:1 A5:1 C6:2 A5:1 C6:1 D6:4', 0.09, 'square', 0.2);
  },
  star(i: number): void {
    tone(noteToFreq(['C6', 'E6', 'G6'][i] ?? 'C6'), 0.22, 'triangle', 0.32);
    tone(noteToFreq(['C7', 'E7', 'G7'][i] ?? 'C7'), 0.12, 'sine', 0.1);
  },
  unlock(): void {
    jingle('C5:1 E5:1 G5:1 B5:1 D6:1 G6:3', 0.06, 'triangle', 0.25);
  },
  gameOver(): void {
    jingle('D5:2 A4:2 F4:2 D4:4', 0.09, 'triangle', 0.22);
  },
  best(): void {
    jingle('G5:1 B5:1 D6:1 G6:3', 0.08, 'square', 0.18);
  },
};
