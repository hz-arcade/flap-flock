import type { SongId } from '../game/levels';
import { audio } from './context';
import { noteToFreq } from './notes';
import type { Drum, Note, Song } from './songs/build';
import { SONGS } from './songs';

const MUSIC_LEVEL = 0.32;

/**
 * Lookahead step sequencer ("A Tale of Two Clocks"): a JS timer wakes up every 25 ms and
 * schedules every step that falls inside the next 150 ms on the audio clock, so playback is
 * sample-accurate and the loop wraps without a gap. Plays one of the songs in ./songs; a
 * lowpass on its output muffles it for the underwater level.
 */
export class Music {
  private timer: number | null = null;
  private stepIdx = 0;
  private nextTime = 0;
  private song: Song = SONGS.grass;
  private out: BiquadFilterNode | null = null;
  private duckUntil = 0;
  /** Tempo multiplier (endless mode speeds up a little). */
  tempo = 1;
  playing = false;

  get current(): SongId | null {
    return this.playing ? (this.song.id as SongId) : null;
  }

  private bus(): BiquadFilterNode | null {
    if (!audio.ctx || !audio.music) return null;
    if (!this.out) {
      this.out = audio.ctx.createBiquadFilter();
      this.out.type = 'lowpass';
      this.out.frequency.value = 20000;
      this.out.connect(audio.music);
    }
    return this.out;
  }

  /** Start (or switch to) a song. Calling it again with the playing song only updates the filter. */
  play(id: SongId, opts: { underwater?: boolean } = {}): void {
    if (!audio.unlock() || !audio.ctx || !audio.music) return;
    const out = this.bus()!;
    const now = audio.ctx.currentTime;
    out.frequency.cancelScheduledValues(now);
    out.frequency.setTargetAtTime(opts.underwater ? 900 : 20000, now, 0.08);
    if (this.playing && this.song.id === id) return;
    this.song = SONGS[id];
    this.stepIdx = 0;
    audio.music.gain.cancelScheduledValues(now);
    audio.music.gain.setTargetAtTime(MUSIC_LEVEL, now, 0.05);
    this.nextTime = now + 0.08;
    if (!this.playing) {
      this.playing = true;
      this.timer = window.setInterval(() => this.tick(), 25);
    }
  }

  stop(fadeSeconds = 0.6): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (audio.ctx && audio.music) {
      audio.music.gain.cancelScheduledValues(audio.ctx.currentTime);
      audio.music.gain.setTargetAtTime(0, audio.ctx.currentTime, fadeSeconds / 3);
    }
  }

  /** Lower the music while a jingle plays. */
  duck(seconds: number): void {
    if (!audio.ctx || !audio.music || !this.playing) return;
    const now = audio.ctx.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + seconds);
    const g = audio.music.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(MUSIC_LEVEL * 0.15, now, 0.03);
    g.setTargetAtTime(MUSIC_LEVEL, this.duckUntil, 0.25);
  }

  private get stepDur(): number {
    return 60 / (this.song.bpm * this.tempo) / 4;
  }

  private tick(): void {
    const ctx = audio.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // After a suspend/resume the audio clock may have jumped; don't spray a burst of stale steps.
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.15) {
      this.schedule(this.stepIdx, this.nextTime);
      this.nextTime += this.stepDur;
      this.stepIdx = (this.stepIdx + 1) % this.song.steps;
    }
  }

  private schedule(step: number, t: number): void {
    const s = this.song;
    const d = this.stepDur;
    const lead = s.lead[step];
    if (lead) {
      this.lead(lead, t, d, 1);
      if (s.echo) this.lead(lead, t + s.echo * d, d, 0.35);
    }
    const arp = s.arp[step];
    if (arp) this.arp(arp, t, d);
    const bass = s.bass[step];
    if (bass) this.bass(bass, t, d);
    for (const dr of s.drums[step] ?? []) this.drum(dr, t);
  }

  private lead(n: Note, t: number, stepDur: number, level: number): void {
    const ctx = audio.ctx!;
    const out = this.bus()!;
    const f = noteToFreq(n.n);
    const bell = this.song.leadVoice === 'bell';
    const dur = bell ? Math.max(0.35, n.len * stepDur) : n.len * stepDur * 0.9;
    const g = ctx.createGain();
    const peak = (bell ? 0.3 : 0.2) * level;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    if (bell) g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    else {
      g.gain.exponentialRampToValueAtTime(peak * 0.65, t + 0.07);
      g.gain.setValueAtTime(peak * 0.65, t + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    }
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = bell ? 'triangle' : 'square';
    o.frequency.setValueAtTime(f, t);
    if (!bell) {
      // Soften the square: chip lead, not a buzzer.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      o.connect(lp).connect(g);
    } else {
      o.connect(g);
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o2.type = 'sine';
      o2.frequency.setValueAtTime(f * 3, t);
      o2.connect(g2).connect(g);
      o2.start(t);
      o2.stop(t + dur + 0.02);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private arp(n: Note, t: number, stepDur: number): void {
    const ctx = audio.ctx!;
    const dur = Math.min(0.2, n.len * stepDur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const o = ctx.createOscillator();
    o.type = this.song.leadVoice === 'bell' ? 'triangle' : 'square';
    o.frequency.setValueAtTime(noteToFreq(n.n), t);
    o.connect(lp).connect(g).connect(this.bus()!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private bass(n: Note, t: number, stepDur: number): void {
    const ctx = audio.ctx!;
    const f = noteToFreq(n.n) * 2; // up an octave: audible on phone speakers
    const dur = Math.min(0.2, n.len * stepDur * 0.95);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.bus()!);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private drum(d: Drum, t: number): void {
    const ctx = audio.ctx!;
    const out = this.bus()!;
    if (d === 'kick') {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.15);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = audio.noiseBuffer();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (d === 'snare') {
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.7;
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    } else {
      f.type = 'highpass';
      f.frequency.value = 7000;
      g.gain.setValueAtTime(d === 'hat' ? 0.16 : 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    }
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.15);
  }
}

export const music = new Music();
