import type { SongId } from '../../game/levels';
import { buildArp, buildBass, buildDrums, buildLead, STEPS_PER_BAR, type Song } from './build';

/**
 * Four original loops, one per pair of worlds. Written for this game: simple diatonic tunes,
 * eight bars each.
 */

// Grassland: F major, bouncy, oom-pah bass.
const GRASS_CHORDS = [['F', 'A', 'C'], ['C', 'E', 'G'], ['D', 'F', 'A'], ['Bb', 'D', 'F'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['Bb', 'D', 'F'], ['C', 'E', 'G']] as const;
const grass: Song = {
  id: 'grass',
  bpm: 140,
  steps: 8 * STEPS_PER_BAR,
  lead: buildLead([
    'C5 - A4 C5 F5 ~ E5 C5',
    'D5 - C5 G4 E5 ~ C5 -',
    'F5 - D5 A4 D5 E5 F5 -',
    'D5 C5 Bb4 - D5 - F5 -',
    'A5 - G5 F5 C5 ~ A4 C5',
    'E5 - D5 C5 G4 ~ C5 -',
    'Bb4 D5 F5 - G5 F5 D5 -',
    'E5 ~ G5 - E5 C5 - -',
  ]),
  arp: buildArp(GRASS_CHORDS, 4, [0, 2, 1, 2], 2),
  bass: buildBass(GRASS_CHORDS, 'R - - - 5 - - - O - - - 5 - R -'),
  drums: buildDrums(8, { main: 'K-h-S-h-K-h-S-hh', fill: 'K-h-S-h-K-S-S-SS' }),
  leadVoice: 'pulse',
  echo: 0,
  scale: ['F', 'G', 'A', 'A#', 'C', 'D', 'E'],
  chords: GRASS_CHORDS,
};

// Underground and underwater: A dorian, sparse, with an echo.
const CAVE_CHORDS = [['A', 'C', 'E'], ['D', 'F#', 'A'], ['A', 'C', 'E'], ['G', 'B', 'D'], ['A', 'C', 'E'], ['D', 'F#', 'A'], ['C', 'E', 'G'], ['E', 'G', 'B']] as const;
const cave: Song = {
  id: 'cave',
  bpm: 96,
  steps: 8 * STEPS_PER_BAR,
  lead: buildLead([
    'A4 ~ - C5 - E5 ~ -',
    'F#5 ~ E5 - D5 ~ - -',
    'C5 - B4 A4 ~ - E4 -',
    'G4 ~ - B4 - D5 ~ -',
    'A4 - C5 - E5 - A5 ~',
    'F#5 ~ - E5 D5 - A4 -',
    'G4 - E4 - G4 - C5 ~',
    'B4 ~ ~ ~ - - - -',
  ]),
  arp: buildArp(CAVE_CHORDS, 3, [0, 1, 2, 1, 3, 2, 1, 2], 2),
  bass: buildBass(CAVE_CHORDS, 'R - - - - - R - - - - - 5 - - -', 2),
  drums: buildDrums(8, { main: 'k-----.-s-----.-', fill: 'k-----.-s---s-s-' }),
  leadVoice: 'pulse',
  echo: 3,
  scale: ['A', 'B', 'C', 'D', 'E', 'F#', 'G'],
  chords: CAVE_CHORDS,
};

// Snow and sky: D lydian, bells over a 16th-note shimmer.
const AIRY_CHORDS = [['D', 'F#', 'A'], ['E', 'G#', 'B'], ['D', 'F#', 'A'], ['E', 'G#', 'B'], ['B', 'D', 'F#'], ['C#', 'E', 'G#'], ['D', 'F#', 'A'], ['E', 'G#', 'B']] as const;
const airy: Song = {
  id: 'airy',
  bpm: 120,
  steps: 8 * STEPS_PER_BAR,
  lead: buildLead([
    'F#5 - A5 - G#5 - E5 -',
    'E5 - B4 - C#5 - G#4 -',
    'A4 D5 F#5 ~ E5 - D5 -',
    'G#5 ~ - E5 - B4 ~ -',
    'D5 - F#5 - B5 - A5 -',
    'G#5 - E5 - C#5 - E5 -',
    'F#5 - D5 - A4 - D5 -',
    'E5 ~ ~ - G#5 ~ ~ -',
  ]),
  arp: buildArp(AIRY_CHORDS, 4, [0, 1, 2, 3, 2, 1]),
  bass: buildBass(AIRY_CHORDS, 'R - - - - - - - 5 - - - - - - -', 2),
  drums: buildDrums(8, { main: 'k---h---s---h---', fill: 'k---h---s---s-s-' }),
  leadVoice: 'bell',
  echo: 0,
  scale: ['D', 'E', 'F#', 'G#', 'A', 'B', 'C#'],
  chords: AIRY_CHORDS,
};

// Desert and castle: E phrygian dominant, driving 16th bass.
const CASTLE_CHORDS = [['E', 'G#', 'B'], ['F', 'A', 'C'], ['E', 'G#', 'B'], ['A', 'C', 'E'], ['E', 'G#', 'B'], ['F', 'A', 'C'], ['D', 'F', 'A'], ['E', 'G#', 'B']] as const;
const castle: Song = {
  id: 'castle',
  bpm: 150,
  steps: 8 * STEPS_PER_BAR,
  lead: buildLead([
    'E5 F5 G#5 - B5 - G#5 F5',
    'A5 ~ G#5 F5 E5 - C5 -',
    'B4 - E5 - G#5 ~ E5 -',
    'C5 B4 A4 - E5 - C5 -',
    'E5 F5 G#5 - B5 - C6 -',
    'A5 - F5 - C5 - A4 -',
    'D5 - F5 - A5 - G#5 -',
    'B5 ~ G#5 - E5 ~ ~ -',
  ]),
  arp: buildArp(CASTLE_CHORDS, 4, [0, 2, 1, 2], 4),
  bass: buildBass(CASTLE_CHORDS, 'R R O R R R O R R R O R 5 5 O 5', 2),
  drums: buildDrums(8, { main: 'k.h.S.h.k.h.S.h.', fill: 'k.h.S.h.k.S.S.SS' }),
  leadVoice: 'pulse',
  echo: 0,
  scale: ['E', 'F', 'G#', 'A', 'B', 'C', 'D'],
  chords: CASTLE_CHORDS,
};

export const SONGS: Record<SongId, Song> = { grass, cave, airy, castle };
