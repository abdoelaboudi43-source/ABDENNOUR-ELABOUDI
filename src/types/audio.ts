export interface AudioClip {
  id: string;
  name: string;
  trackId: string;
  startTime: number; // in seconds on timeline
  duration: number; // visible duration in seconds
  offset: number; // start offset within audioBuffer
  audioBuffer: AudioBuffer;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  gain: number; // multiplier (default 1)
  color: string;
  peaks?: Float32Array[];
}

export type TrackType = 'voice' | 'music_bed' | 'sfx';

export interface AudioTrack {
  id: string;
  name: string;
  type: TrackType;
  volume: number; // 0 to 1.5 (default 1.0)
  pan: number; // -1 to 1 (default 0)
  muted: boolean;
  solo: boolean;
  ducking: boolean; // if true, volume drops when voice track has active audio
  duckingAmount: number; // in dB, e.g. -12
  armRecord: boolean;
  color: string;
}

export interface EqBand {
  type: BiquadFilterType;
  frequency: number;
  gain: number; // dB
  q: number;
}

export interface DspSettings {
  lowCutFreq: number; // 20 to 200 Hz
  lowCutEnabled: boolean;
  eqBands: {
    lowShelf: EqBand;
    lowMid: EqBand;
    highMid: EqBand;
    highShelf: EqBand;
  };
  eqEnabled: boolean;
  compressor: {
    threshold: number; // -60 to 0 dB
    ratio: number; // 1 to 20
    attack: number; // seconds (0.001 to 0.1)
    release: number; // seconds (0.01 to 1.0)
    makeupGain: number; // dB
    enabled: boolean;
  };
  deEsser: {
    frequency: number; // 4000 to 9000 Hz
    threshold: number; // -40 to 0 dB
    enabled: boolean;
  };
  noiseGate: {
    threshold: number; // -80 to -20 dB
    release: number; // seconds
    enabled: boolean;
  };
  reverb: {
    roomType: 'booth' | 'studio' | 'broadcast' | 'warm';
    mix: number; // 0 to 0.5 (wet level)
    enabled: boolean;
  };
  presetName: string;
}

export interface TakeRecord {
  id: string;
  takeNumber: number;
  timestamp: number;
  duration: number;
  audioBuffer: AudioBuffer;
  name: string;
  rating: number; // 1-5
  notes: string;
  kept: boolean;
}

export interface ScriptPreset {
  id: string;
  title: string;
  category: 'Commercial' | 'Podcast' | 'Audiobook' | 'Animation' | 'Video Game';
  character: string;
  tone: string;
  targetDuration: string;
  content: string;
}

export interface ComplianceReport {
  rmsDb: number;
  peakDb: number;
  noiseFloorDb: number;
  acxPass: boolean;
  podcastPass: boolean;
  issues: string[];
  recommendations: string[];
}
