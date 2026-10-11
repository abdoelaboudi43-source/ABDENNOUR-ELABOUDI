import { DspSettings, ScriptPreset } from '../types/audio';

export const DEFAULT_DSP_SETTINGS: DspSettings = {
  presetName: 'Clean Voice Standard',
  lowCutFreq: 80,
  lowCutEnabled: true,
  eqBands: {
    lowShelf: { type: 'lowshelf', frequency: 120, gain: 1.5, q: 0.7 },
    lowMid: { type: 'peaking', frequency: 450, gain: -1.5, q: 1.2 },
    highMid: { type: 'peaking', frequency: 3200, gain: 2.0, q: 1.0 },
    highShelf: { type: 'highshelf', frequency: 9500, gain: 2.5, q: 0.7 },
  },
  eqEnabled: true,
  compressor: {
    threshold: -18,
    ratio: 3.5,
    attack: 0.015,
    release: 0.12,
    makeupGain: 3.0,
    enabled: true,
  },
  deEsser: {
    frequency: 6200,
    threshold: -18,
    enabled: true,
  },
  noiseGate: {
    threshold: -48,
    release: 0.1,
    enabled: true,
  },
  reverb: {
    roomType: 'booth',
    mix: 0.05,
    enabled: false,
  },
};

export const DSP_PRESETS: Record<string, Partial<DspSettings>> = {
  'Broadcast Warmth': {
    presetName: 'Broadcast Warmth',
    lowCutFreq: 75,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 140, gain: 3.0, q: 0.7 },
      lowMid: { type: 'peaking', frequency: 350, gain: -1.0, q: 1.0 },
      highMid: { type: 'peaking', frequency: 2800, gain: 1.5, q: 1.2 },
      highShelf: { type: 'highshelf', frequency: 10000, gain: 2.0, q: 0.7 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -20,
      ratio: 4.0,
      attack: 0.01,
      release: 0.15,
      makeupGain: 4.0,
      enabled: true,
    },
    deEsser: { frequency: 6500, threshold: -20, enabled: true },
    noiseGate: { threshold: -50, release: 0.12, enabled: true },
    reverb: { roomType: 'broadcast', mix: 0.06, enabled: true },
  },
  'Clean Audiobook (ACX)': {
    presetName: 'Clean Audiobook (ACX)',
    lowCutFreq: 85,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 100, gain: 0.0, q: 0.7 },
      lowMid: { type: 'peaking', frequency: 500, gain: -2.0, q: 1.4 },
      highMid: { type: 'peaking', frequency: 3500, gain: 1.2, q: 1.0 },
      highShelf: { type: 'highshelf', frequency: 8000, gain: 1.0, q: 0.7 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -22,
      ratio: 2.8,
      attack: 0.02,
      release: 0.2,
      makeupGain: 3.2,
      enabled: true,
    },
    deEsser: { frequency: 6000, threshold: -18, enabled: true },
    noiseGate: { threshold: -52, release: 0.08, enabled: true },
    reverb: { roomType: 'booth', mix: 0.02, enabled: false },
  },
  'Crisp Commercial VO': {
    presetName: 'Crisp Commercial VO',
    lowCutFreq: 90,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 120, gain: 1.0, q: 0.8 },
      lowMid: { type: 'peaking', frequency: 400, gain: -2.5, q: 1.2 },
      highMid: { type: 'peaking', frequency: 4000, gain: 3.5, q: 1.2 },
      highShelf: { type: 'highshelf', frequency: 11000, gain: 4.0, q: 0.7 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -16,
      ratio: 5.0,
      attack: 0.005,
      release: 0.08,
      makeupGain: 4.5,
      enabled: true,
    },
    deEsser: { frequency: 6800, threshold: -22, enabled: true },
    noiseGate: { threshold: -46, release: 0.1, enabled: true },
    reverb: { roomType: 'studio', mix: 0.04, enabled: true },
  },
  'Punchy Podcast': {
    presetName: 'Punchy Podcast',
    lowCutFreq: 80,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 150, gain: 2.2, q: 0.7 },
      lowMid: { type: 'peaking', frequency: 300, gain: -1.8, q: 1.1 },
      highMid: { type: 'peaking', frequency: 3200, gain: 2.5, q: 1.0 },
      highShelf: { type: 'highshelf', frequency: 9000, gain: 2.0, q: 0.7 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -19,
      ratio: 3.8,
      attack: 0.012,
      release: 0.12,
      makeupGain: 3.8,
      enabled: true,
    },
    deEsser: { frequency: 6400, threshold: -20, enabled: true },
    noiseGate: { threshold: -48, release: 0.1, enabled: true },
    reverb: { roomType: 'warm', mix: 0.05, enabled: false },
  },
  'Cinematic Trailer': {
    presetName: 'Cinematic Trailer',
    lowCutFreq: 60,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 90, gain: 4.5, q: 0.8 },
      lowMid: { type: 'peaking', frequency: 250, gain: 1.0, q: 1.0 },
      highMid: { type: 'peaking', frequency: 2500, gain: 2.0, q: 1.1 },
      highShelf: { type: 'highshelf', frequency: 10000, gain: 3.0, q: 0.7 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -22,
      ratio: 6.0,
      attack: 0.025,
      release: 0.25,
      makeupGain: 5.5,
      enabled: true,
    },
    deEsser: { frequency: 5800, threshold: -16, enabled: true },
    noiseGate: { threshold: -50, release: 0.15, enabled: true },
    reverb: { roomType: 'broadcast', mix: 0.14, enabled: true },
  },
  'Telephone / Lo-Fi Radio': {
    presetName: 'Telephone / Lo-Fi Radio',
    lowCutFreq: 450,
    lowCutEnabled: true,
    eqBands: {
      lowShelf: { type: 'lowshelf', frequency: 350, gain: -12.0, q: 1.0 },
      lowMid: { type: 'peaking', frequency: 1200, gain: 4.0, q: 2.0 },
      highMid: { type: 'peaking', frequency: 2800, gain: 3.0, q: 1.5 },
      highShelf: { type: 'highshelf', frequency: 3800, gain: -14.0, q: 1.0 },
    },
    eqEnabled: true,
    compressor: {
      threshold: -28,
      ratio: 12.0,
      attack: 0.002,
      release: 0.05,
      makeupGain: 6.0,
      enabled: true,
    },
    deEsser: { frequency: 5000, threshold: -10, enabled: false },
    noiseGate: { threshold: -40, release: 0.05, enabled: false },
    reverb: { roomType: 'booth', mix: 0.0, enabled: false },
  },
};

export const SAMPLE_SCRIPTS: ScriptPreset[] = [
  {
    id: 'script-comm-1',
    title: 'Aura Prime EV - 30s Commercial',
    category: 'Commercial',
    character: 'Narrator (Sophisticated, Confident)',
    tone: 'Smooth, cinematic, breath control',
    targetDuration: '30 seconds',
    content: `[Pause 0.5s]
Silence isn’t empty. It’s full of anticipation.

[Warm, confident tone]
Introducing the all-electric Aura Prime.
Engineered not just to travel the road... but to redefine it.

[Subtle pause]
Instant torque. Uncompromising luxury.
And a cabin so quiet, all you hear is the beat of your own pulse.

[Strong closing, smiling voice]
The road ahead has never been clearer.
Test drive the future today at Aura Motors.`,
  },
  {
    id: 'script-pod-1',
    title: 'Echoes in the Dark - Podcast Hook',
    category: 'Podcast',
    character: 'Podcast Host (Intriguing, Grounded)',
    tone: 'Conversational, suspenseful, natural pacing',
    targetDuration: '45 seconds',
    content: `[Deep breath, conversational cadence]
Welcome back to Echoes in the Dark. I’m your host, and tonight... we’re taking you back to November 14th, 1998.

[Lean in, slightly hushed]
A rainy Tuesday in the Pacific Northwest.
When the transmission towers on Mount Hood suddenly fell silent for twenty-two minutes.

[Beat]
Official reports said it was a power surge.
But the air traffic recordings from Seattle tower tell a very different story.

[Energized hook]
Grab your headphones. Lock your doors.
Because episode forty-two starts right now.`,
  },
  {
    id: 'script-game-1',
    title: 'Kaelen the Voidblade - RPG Audition',
    category: 'Video Game',
    character: 'Warrior / Rogue (Grizzled, Relentless)',
    tone: 'Gritty, low register, intensity spikes',
    targetDuration: '35 seconds',
    content: `[Heavy breath, low rasp]
You think these walls will protect you?
I’ve walked through ash deeper than your throne room ceiling.

[Rising anger, sharp projection]
Call your guards! Let them come!
Every sword they raise is just another echo of a promise I intend to break.

[Whisper, deadly calm]
Tell the King his crown will look much lighter... rolling across the stone.`,
  },
  {
    id: 'script-book-1',
    title: 'The Clockwork Coast - Audiobook Chapter 1',
    category: 'Audiobook',
    character: 'Storyteller (Lyrical, Atmospheric)',
    tone: 'ACX-ready pacing, distinct consonants, measured breaths',
    targetDuration: '60 seconds',
    content: `[Gentle intake, measured cadence]
Chapter One: The Glass Lantern.

The tide never truly retreated from Dunwich Pier. It only gathered its breath before surging against the salt-blackened pillars.

Margaret stood at the lantern balcony, wrench in hand, listening to the bronze gears hum inside the beacon housing.

Forty leagues out in the gloom, an iron whistle sounded—two longs and a short. The cargo runner had arrived three hours early. And Margaret knew the light was burning with the wrong color oil.`,
  },
  {
    id: 'script-anim-1',
    title: 'Pip the Clockwork Badger - Animation',
    category: 'Animation',
    character: 'Quirky Inventor Companion',
    tone: 'High energy, eccentric, expressive pitch jumps',
    targetDuration: '25 seconds',
    content: `[Fast-paced, squeaky excitement]
Wait wait wait! Don't push that gear!
If you push that gear, the steam regulator goes *ker-splat* and my tea kettle goes to orbit!

[Proud chuckle]
Now, if you gently tap the brass valve... like this...
[Gasps]
Aha! See? Pure genius! Mostly non-explosive!`,
  },
];
