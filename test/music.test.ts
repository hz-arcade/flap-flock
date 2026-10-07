import { describe, expect, it } from 'vitest';
import { noteToFreq, pitchClass } from '../src/audio/notes';
import { normPc, STEPS_PER_BAR } from '../src/audio/songs/build';
import { SONGS } from '../src/audio/songs';
import { LEVELS, THEME_SONG } from '../src/game/levels';

describe('music', () => {
  it('note frequencies', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFreq('A#4')).toBeCloseTo(noteToFreq('Bb4'));
  });

  for (const song of Object.values(SONGS)) {
    describe(song.id, () => {
      it('every track is one loop long', () => {
        for (const track of [song.lead, song.arp, song.bass, song.drums]) expect(track).toHaveLength(song.steps);
        expect(song.steps % STEPS_PER_BAR).toBe(0);
      });
      it('the lead stays in key', () => {
        const scale = song.scale.map(normPc);
        for (const n of song.lead) if (n) expect(scale, `${song.id} ${n.n}`).toContain(normPc(pitchClass(n.n)));
      });
      it('arp and bass only play chord tones', () => {
        song.chords.forEach((chord, bar) => {
          const tones = chord.map(normPc);
          for (let i = 0; i < STEPS_PER_BAR; i++) {
            for (const n of [song.arp[bar * STEPS_PER_BAR + i], song.bass[bar * STEPS_PER_BAR + i]]) {
              if (n) expect(tones, `${song.id} bar ${bar}`).toContain(normPc(pitchClass(n.n)));
            }
          }
        });
      });
      it('a kick on every bar’s downbeat', () => {
        for (let b = 0; b < song.steps / STEPS_PER_BAR; b++) expect(song.drums[b * STEPS_PER_BAR]).toContain('kick');
      });
      it('plays every note at an audible pitch', () => {
        for (const n of [...song.lead, ...song.arp]) if (n) expect(noteToFreq(n.n)).toBeGreaterThan(100);
      });
    });
  }

  it('each song has its own tune, tempo and key', () => {
    const songs = Object.values(SONGS);
    const leads = songs.map((s) => s.lead.map((n) => n?.n ?? '-').join(' '));
    expect(new Set(leads).size).toBe(songs.length);
    expect(new Set(songs.map((s) => s.bpm)).size).toBe(songs.length);
  });

  it('every level and theme has a song', () => {
    for (const l of LEVELS) expect(SONGS[l.song]).toBeDefined();
    for (const song of Object.values(THEME_SONG)) expect(SONGS[song]).toBeDefined();
  });
});
