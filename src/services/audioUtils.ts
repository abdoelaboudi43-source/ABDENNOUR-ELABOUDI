import { ComplianceReport } from '../types/audio';

/**
 * Encodes an AudioBuffer into a WAV Blob (16-bit or 24-bit PCM)
 */
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const length = buffer.length * blockAlign;

  const bufferArray = new ArrayBuffer(44 + length);
  const view = new DataView(bufferArray);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw PCM = 1)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, length, true);

  // Write interleaved PCM samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        // Clip to [-1, 1]
        sample = Math.max(-1, Math.min(1, sample));
        // 16-bit integer scaling
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else {
    // 24-bit PCM
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? sample * 0x800000 : sample * 0x7fffff;
        const val = Math.floor(intSample);
        view.setUint8(offset, val & 0xff);
        view.setUint8(offset + 1, (val >> 8) & 0xff);
        view.setUint8(offset + 2, (val >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Computes min/max waveform peak buckets for fast canvas rendering
 */
export function computePeaks(buffer: AudioBuffer, buckets: number = 800): Float32Array[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.floor(channelData.length / buckets) || 1;
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);

  for (let i = 0; i < buckets; i++) {
    let min = 1.0;
    let max = -1.0;
    const start = i * step;
    const end = Math.min(start + step, channelData.length);
    for (let j = start; j < end; j++) {
      const val = channelData[j];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    mins[i] = min === 1.0 ? 0 : min;
    maxs[i] = max === -1.0 ? 0 : max;
  }

  return [mins, maxs];
}

/**
 * Slices a portion of an AudioBuffer cleanly
 */
export function sliceAudioBuffer(
  ctx: AudioContext | BaseAudioContext,
  buffer: AudioBuffer,
  startSec: number,
  durationSec: number
): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const sampleLength = Math.max(1, Math.min(Math.floor(durationSec * sampleRate), buffer.length - startSample));
  
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, sampleLength, sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const srcData = buffer.getChannelData(c);
    const destData = newBuffer.getChannelData(c);
    destData.set(srcData.subarray(startSample, startSample + sampleLength));
  }
  return newBuffer;
}

/**
 * Clones an AudioBuffer
 */
export function cloneAudioBuffer(ctx: AudioContext | BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    newBuffer.getChannelData(c).set(buffer.getChannelData(c));
  }
  return newBuffer;
}

/**
 * Detects silent regions in an AudioBuffer for auto-trimming / Strip Silence
 */
export function detectSilences(
  buffer: AudioBuffer,
  thresholdDb: number = -42,
  minDurationSec: number = 0.35
): { start: number; end: number }[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const thresholdAmp = Math.pow(10, thresholdDb / 20);
  const minSamples = Math.floor(minDurationSec * sampleRate);
  const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
  
  const silences: { start: number; end: number }[] = [];
  let inSilence = false;
  let silenceStartSample = 0;

  for (let i = 0; i < data.length; i += windowSize) {
    const end = Math.min(i + windowSize, data.length);
    let sumSquares = 0;
    for (let j = i; j < end; j++) {
      sumSquares += data[j] * data[j];
    }
    const rms = Math.sqrt(sumSquares / (end - i));

    if (rms < thresholdAmp) {
      if (!inSilence) {
        inSilence = true;
        silenceStartSample = i;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        if (i - silenceStartSample >= minSamples) {
          silences.push({
            start: silenceStartSample / sampleRate,
            end: i / sampleRate,
          });
        }
      }
    }
  }

  if (inSilence && data.length - silenceStartSample >= minSamples) {
    silences.push({
      start: silenceStartSample / sampleRate,
      end: data.length / sampleRate,
    });
  }

  return silences;
}

/**
 * Compliance Analysis for ACX & Podcast standard validation
 */
export function analyzeCompliance(buffer: AudioBuffer): ComplianceReport {
  const data = buffer.getChannelData(0);
  let sumSquares = 0;
  let maxAbs = 0;
  
  // Also calculate lowest 10% energy window for noise floor estimate
  const windowSize = Math.floor(buffer.sampleRate * 0.1); // 100ms
  const windowRmsList: number[] = [];

  for (let i = 0; i < data.length; i += windowSize) {
    const end = Math.min(i + windowSize, data.length);
    let winSum = 0;
    for (let j = i; j < end; j++) {
      const absVal = Math.abs(data[j]);
      if (absVal > maxAbs) maxAbs = absVal;
      sumSquares += data[j] * data[j];
      winSum += data[j] * data[j];
    }
    const winRms = Math.sqrt(winSum / (end - i));
    if (winRms > 0.00001) {
      windowRmsList.push(winRms);
    }
  }

  const overallRms = Math.sqrt(sumSquares / Math.max(1, data.length));
  const rmsDb = overallRms > 0 ? 20 * Math.log10(overallRms) : -96;
  const peakDb = maxAbs > 0 ? 20 * Math.log10(maxAbs) : -96;

  // Estimate noise floor from lowest 10% non-zero windows
  windowRmsList.sort((a, b) => a - b);
  const noiseIndex = Math.max(0, Math.floor(windowRmsList.length * 0.05));
  const noiseFloorRms = windowRmsList[noiseIndex] || 0.0001;
  const noiseFloorDb = 20 * Math.log10(noiseFloorRms);

  const issues: string[] = [];
  const recommendations: string[] = [];

  // ACX requirements:
  // RMS between -23 dB and -18 dB
  // Peak <= -3 dB
  // Noise floor <= -60 dB
  let acxPass = true;

  if (peakDb > -3.0) {
    acxPass = false;
    issues.push(`Peak level is ${peakDb.toFixed(1)} dBFS (ACX requires max -3.0 dBFS)`);
    recommendations.push('Apply a limiter or reduce track gain to prevent clipping.');
  }

  if (rmsDb > -18.0) {
    acxPass = false;
    issues.push(`RMS volume is too loud: ${rmsDb.toFixed(1)} dBFS (ACX range is -23 to -18 dBFS)`);
    recommendations.push('Decrease overall gain or makeup gain on compressor.');
  } else if (rmsDb < -23.0) {
    acxPass = false;
    issues.push(`RMS volume is too quiet: ${rmsDb.toFixed(1)} dBFS (ACX range is -23 to -18 dBFS)`);
    recommendations.push('Use compressor and add 2 to 4 dB of makeup gain.');
  }

  if (noiseFloorDb > -60.0) {
    acxPass = false;
    issues.push(`Noise floor is ${noiseFloorDb.toFixed(1)} dBFS (ACX requires <= -60 dBFS)`);
    recommendations.push('Engage Noise Gate or record in a quieter booth environment.');
  }

  // Podcast requirement:
  // Typically -16 to -14 LUFS (approx -19 to -14 dB RMS), Peak <= -1 dB
  const podcastPass = peakDb <= -1.0 && rmsDb >= -22.0 && rmsDb <= -14.0;

  return {
    rmsDb,
    peakDb,
    noiseFloorDb,
    acxPass,
    podcastPass,
    issues,
    recommendations,
  };
}

/**
 * Creates synthesized pleasant ambient music bed for background test track
 */
export function createSynthesizedMusicBed(ctx: AudioContext, durationSec: number = 16): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(durationSec * sampleRate);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Gentle podcast/narrative chord progression: Cmaj9 - Am9 - Fmaj7 - Gsus
  const chords = [
    [261.63, 329.63, 392.00, 493.88], // C, E, G, B
    [220.00, 261.63, 329.63, 392.00], // A, C, E, G
    [174.61, 261.63, 329.63, 349.23], // F, C, E, F
    [196.00, 261.63, 293.66, 392.00], // G, C, D, G
  ];

  const chordDuration = durationSec / chords.length;

  for (let cIdx = 0; cIdx < chords.length; cIdx++) {
    const chord = chords[cIdx];
    const startSample = Math.floor(cIdx * chordDuration * sampleRate);
    const endSample = Math.floor((cIdx + 1) * chordDuration * sampleRate);

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / sampleRate;
      const progress = t / chordDuration;
      // Soft envelope
      const env = Math.sin(progress * Math.PI) * 0.15;

      let sampleL = 0;
      let sampleR = 0;

      for (let noteIdx = 0; noteIdx < chord.length; noteIdx++) {
        const freq = chord[noteIdx];
        // Warm mellow sine waves with gentle detune for stereo width
        const oscL = Math.sin(2 * Math.PI * freq * t);
        const oscR = Math.sin(2 * Math.PI * (freq * 1.002) * t);
        // Sub harmonic
        const sub = Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.4;

        sampleL += (oscL + sub) * 0.25;
        sampleR += (oscR + sub) * 0.25;
      }

      left[i] = sampleL * env;
      right[i] = sampleR * env;
    }
  }

  return buffer;
}

/**
 * Creates synthesized studio sound effect (e.g. countdown pip, click)
 */
export function createSynthesizedSFX(
  ctx: AudioContext,
  type: 'beep' | 'countdown' | 'shutter' | 'chime'
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  let duration = 0.3;
  if (type === 'chime') duration = 1.0;

  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    if (type === 'beep') {
      const env = Math.exp(-t * 20);
      data[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.3;
    } else if (type === 'countdown') {
      const env = Math.exp(-t * 15);
      data[i] = Math.sin(2 * Math.PI * 440 * t) * env * 0.3;
    } else if (type === 'shutter') {
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 40);
      data[i] = noise * 0.25;
    } else if (type === 'chime') {
      const env = Math.exp(-t * 4);
      const tone1 = Math.sin(2 * Math.PI * 587.33 * t); // D5
      const tone2 = Math.sin(2 * Math.PI * 880.00 * t); // A5
      const tone3 = Math.sin(2 * Math.PI * 1174.66 * t); // D6
      data[i] = (tone1 * 0.5 + tone2 * 0.3 + tone3 * 0.2) * env * 0.25;
    }
  }

  return buffer;
}

/**
 * Formats seconds into digital studio timecode (HH:MM:SS.mmm)
 */
export function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
