import { AudioClip, AudioTrack, DspSettings } from '../types/audio';
import { cloneAudioBuffer, computePeaks, detectSilences, sliceAudioBuffer } from './audioUtils';

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  public ctx: AudioContext | null = null;

  // Live Mic Input
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micMonitorGain: GainNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording: boolean = false;
  public recordStartTime: number = 0;

  // Playback nodes
  private activeSourceNodes: { source: AudioBufferSourceNode; clipId: string }[] = [];
  public isPlaying: boolean = false;
  public playhead: number = 0; // seconds
  private playheadStartTimestamp: number = 0;
  private playheadStartOffset: number = 0;

  // Master nodes
  public masterGain: GainNode | null = null;
  public masterAnalyser: AnalyserNode | null = null;
  private voiceChainInput: GainNode | null = null;
  private voiceChainOutput: GainNode | null = null;
  private musicBedGain: GainNode | null = null;

  // DSP Nodes
  private lowCutFilter: BiquadFilterNode | null = null;
  private eqLowShelf: BiquadFilterNode | null = null;
  private eqLowMid: BiquadFilterNode | null = null;
  private eqHighMid: BiquadFilterNode | null = null;
  private eqHighShelf: BiquadFilterNode | null = null;
  private deEsserFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private makeupGainNode: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private reverbDryGain: GainNode | null = null;

  // Listeners
  private playheadListeners: Set<(time: number) => void> = new Set();
  private rafId: number | null = null;

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.setupMasterChain();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private setupMasterChain() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);

    // Setup voice DSP chain
    this.voiceChainInput = ctx.createGain();
    this.voiceChainOutput = ctx.createGain();

    this.lowCutFilter = ctx.createBiquadFilter();
    this.lowCutFilter.type = 'highpass';
    this.lowCutFilter.frequency.value = 80;

    this.eqLowShelf = ctx.createBiquadFilter();
    this.eqLowShelf.type = 'lowshelf';
    this.eqLowShelf.frequency.value = 120;
    this.eqLowShelf.gain.value = 1.5;

    this.eqLowMid = ctx.createBiquadFilter();
    this.eqLowMid.type = 'peaking';
    this.eqLowMid.frequency.value = 450;
    this.eqLowMid.gain.value = -1.5;
    this.eqLowMid.Q.value = 1.2;

    this.eqHighMid = ctx.createBiquadFilter();
    this.eqHighMid.type = 'peaking';
    this.eqHighMid.frequency.value = 3200;
    this.eqHighMid.gain.value = 2.0;
    this.eqHighMid.Q.value = 1.0;

    this.eqHighShelf = ctx.createBiquadFilter();
    this.eqHighShelf.type = 'highshelf';
    this.eqHighShelf.frequency.value = 9500;
    this.eqHighShelf.gain.value = 2.5;

    this.deEsserFilter = ctx.createBiquadFilter();
    this.deEsserFilter.type = 'peaking';
    this.deEsserFilter.frequency.value = 6200;
    this.deEsserFilter.gain.value = -3.0;
    this.deEsserFilter.Q.value = 2.0;

    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -18;
    this.compressorNode.ratio.value = 3.5;
    this.compressorNode.attack.value = 0.015;
    this.compressorNode.release.value = 0.12;

    this.makeupGainNode = ctx.createGain();
    this.makeupGainNode.gain.value = Math.pow(10, 3.0 / 20);

    // Reverb send/return
    this.reverbConvolver = ctx.createConvolver();
    this.reverbConvolver.buffer = this.createSyntheticImpulse(ctx, 1.2, 0.4);
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 0.05;
    this.reverbDryGain = ctx.createGain();
    this.reverbDryGain.gain.value = 0.95;

    // Connect voice chain in series
    this.voiceChainInput.connect(this.lowCutFilter);
    this.lowCutFilter.connect(this.eqLowShelf);
    this.eqLowShelf.connect(this.eqLowMid);
    this.eqLowMid.connect(this.eqHighMid);
    this.eqHighMid.connect(this.eqHighShelf);
    this.eqHighShelf.connect(this.deEsserFilter);
    this.deEsserFilter.connect(this.compressorNode);
    this.compressorNode.connect(this.makeupGainNode);

    // Split to dry + reverb
    this.makeupGainNode.connect(this.reverbDryGain);
    this.makeupGainNode.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWetGain);

    this.reverbDryGain.connect(this.voiceChainOutput);
    this.reverbWetGain.connect(this.voiceChainOutput);

    // Connect voice chain output to master
    this.voiceChainOutput.connect(this.masterGain);

    // Music bed bus
    this.musicBedGain = ctx.createGain();
    this.musicBedGain.gain.value = 0.7;
    this.musicBedGain.connect(this.masterGain);
  }

  public applyDspSettings(dsp: DspSettings) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.lowCutFilter) {
      this.lowCutFilter.frequency.setValueAtTime(dsp.lowCutEnabled ? dsp.lowCutFreq : 10, now);
    }

    if (this.eqLowShelf && this.eqLowMid && this.eqHighMid && this.eqHighShelf) {
      if (dsp.eqEnabled) {
        this.eqLowShelf.frequency.setValueAtTime(dsp.eqBands.lowShelf.frequency, now);
        this.eqLowShelf.gain.setValueAtTime(dsp.eqBands.lowShelf.gain, now);

        this.eqLowMid.frequency.setValueAtTime(dsp.eqBands.lowMid.frequency, now);
        this.eqLowMid.gain.setValueAtTime(dsp.eqBands.lowMid.gain, now);
        this.eqLowMid.Q.setValueAtTime(dsp.eqBands.lowMid.q, now);

        this.eqHighMid.frequency.setValueAtTime(dsp.eqBands.highMid.frequency, now);
        this.eqHighMid.gain.setValueAtTime(dsp.eqBands.highMid.gain, now);
        this.eqHighMid.Q.setValueAtTime(dsp.eqBands.highMid.q, now);

        this.eqHighShelf.frequency.setValueAtTime(dsp.eqBands.highShelf.frequency, now);
        this.eqHighShelf.gain.setValueAtTime(dsp.eqBands.highShelf.gain, now);
      } else {
        this.eqLowShelf.gain.setValueAtTime(0, now);
        this.eqLowMid.gain.setValueAtTime(0, now);
        this.eqHighMid.gain.setValueAtTime(0, now);
        this.eqHighShelf.gain.setValueAtTime(0, now);
      }
    }

    if (this.compressorNode && this.makeupGainNode) {
      if (dsp.compressor.enabled) {
        this.compressorNode.threshold.setValueAtTime(dsp.compressor.threshold, now);
        this.compressorNode.ratio.setValueAtTime(dsp.compressor.ratio, now);
        this.compressorNode.attack.setValueAtTime(dsp.compressor.attack, now);
        this.compressorNode.release.setValueAtTime(dsp.compressor.release, now);
        const linearMakeup = Math.pow(10, dsp.compressor.makeupGain / 20);
        this.makeupGainNode.gain.setValueAtTime(linearMakeup, now);
      } else {
        this.compressorNode.threshold.setValueAtTime(0, now);
        this.compressorNode.ratio.setValueAtTime(1, now);
        this.makeupGainNode.gain.setValueAtTime(1.0, now);
      }
    }

    if (this.deEsserFilter) {
      if (dsp.deEsser.enabled) {
        this.deEsserFilter.frequency.setValueAtTime(dsp.deEsser.frequency, now);
        this.deEsserFilter.gain.setValueAtTime(-4.0, now);
      } else {
        this.deEsserFilter.gain.setValueAtTime(0, now);
      }
    }

    if (this.reverbWetGain && this.reverbDryGain) {
      if (dsp.reverb.enabled) {
        this.reverbWetGain.gain.setValueAtTime(dsp.reverb.mix, now);
        this.reverbDryGain.gain.setValueAtTime(1 - dsp.reverb.mix, now);
      } else {
        this.reverbWetGain.gain.setValueAtTime(0, now);
        this.reverbDryGain.gain.setValueAtTime(1.0, now);
      }
    }
  }

  /**
   * Generates synthetic room impulse for reverb
   */
  private createSyntheticImpulse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const envelope = Math.pow(1 - n, decay);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  // --- Microphone & Recording ---

  public async startMicrophone(deviceId?: string): Promise<MediaStream> {
    const ctx = this.initContext();
    if (this.micStream) {
      this.stopMicrophone();
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    };

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Fallback with default audio constraints
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    this.micSource = ctx.createMediaStreamSource(this.micStream);
    this.micAnalyser = ctx.createAnalyser();
    this.micAnalyser.fftSize = 256;
    this.micAnalyser.smoothingTimeConstant = 0.3;

    this.micMonitorGain = ctx.createGain();
    this.micMonitorGain.gain.value = 0; // muted by default to prevent feedback

    this.micSource.connect(this.micAnalyser);
    this.micSource.connect(this.micMonitorGain);
    this.micMonitorGain.connect(ctx.destination);

    return this.micStream;
  }

  public setMonitoring(enabled: boolean, volume: number = 0.8) {
    if (this.micMonitorGain && this.ctx) {
      this.micMonitorGain.gain.setValueAtTime(enabled ? volume : 0, this.ctx.currentTime);
    }
  }

  public stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
  }

  public startRecording(onRecordedBuffer: (buffer: AudioBuffer, duration: number) => void) {
    if (!this.micStream) {
      throw new Error('Microphone not started');
    }
    const ctx = this.initContext();
    this.recordedChunks = [];
    this.isRecording = true;
    this.recordStartTime = ctx.currentTime;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.micStream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;
        onRecordedBuffer(audioBuffer, duration);
      } catch (err) {
        console.error('Failed to decode recorded audio data:', err);
      }
    };

    this.mediaRecorder.start(100);
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
  }

  public getMicLevels(): { peakDb: number; rmsDb: number; isClipping: boolean } {
    if (!this.micAnalyser) {
      return { peakDb: -96, rmsDb: -96, isClipping: false };
    }
    const buffer = new Float32Array(this.micAnalyser.fftSize);
    this.micAnalyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const val = Math.abs(buffer[i]);
      if (val > peak) peak = val;
      sum += val * val;
    }

    const rms = Math.sqrt(sum / buffer.length);
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -96;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -96;

    return {
      peakDb: Math.max(-96, peakDb),
      rmsDb: Math.max(-96, rmsDb),
      isClipping: peakDb >= -0.1,
    };
  }

  public getMasterLevels(): { peakDb: number; rmsDb: number } {
    if (!this.masterAnalyser) {
      return { peakDb: -96, rmsDb: -96 };
    }
    const buffer = new Float32Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const val = Math.abs(buffer[i]);
      if (val > peak) peak = val;
      sum += val * val;
    }

    const rms = Math.sqrt(sum / buffer.length);
    const peakDb = peak > 0 ? 20 * Math.log10(peak) : -96;
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -96;

    return {
      peakDb: Math.max(-96, peakDb),
      rmsDb: Math.max(-96, rmsDb),
    };
  }

  // --- Multi-track Playback & Scheduling ---

  public play(
    tracks: AudioTrack[],
    clips: AudioClip[],
    startAt: number = 0,
    onEnded?: () => void
  ) {
    const ctx = this.initContext();
    this.stopPlayback();

    this.playhead = Math.max(0, startAt);
    this.playheadStartTimestamp = ctx.currentTime;
    this.playheadStartOffset = this.playhead;
    this.isPlaying = true;

    // Check if voice track has active clips to manage ducking
    const voiceClips = clips.filter((c) => {
      const track = tracks.find((t) => t.id === c.trackId);
      return track?.type === 'voice' && !track.muted;
    });

    // Schedule clips
    let maxEndTime = this.playhead;

    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) continue;

      const clipEndOnTimeline = clip.startTime + clip.duration;
      if (clipEndOnTimeline <= this.playhead) continue; // Already played

      const timeUntilStart = Math.max(0, clip.startTime - this.playhead);
      const clipOffset = this.playhead > clip.startTime
        ? clip.offset + (this.playhead - clip.startTime)
        : clip.offset;
      const playDuration = this.playhead > clip.startTime
        ? clip.duration - (this.playhead - clip.startTime)
        : clip.duration;

      if (playDuration <= 0) continue;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = clip.audioBuffer;

      // Clip gain & envelope
      const clipGain = ctx.createGain();
      const baseGain = clip.gain * track.volume;
      clipGain.gain.setValueAtTime(baseGain, ctx.currentTime + timeUntilStart);

      // Fade-in
      if (clip.fadeIn > 0 && this.playhead <= clip.startTime) {
        clipGain.gain.setValueAtTime(0, ctx.currentTime + timeUntilStart);
        clipGain.gain.linearRampToValueAtTime(baseGain, ctx.currentTime + timeUntilStart + clip.fadeIn);
      }
      // Fade-out
      if (clip.fadeOut > 0) {
        const fadeOutStartTime = ctx.currentTime + timeUntilStart + playDuration - clip.fadeOut;
        if (fadeOutStartTime > ctx.currentTime) {
          clipGain.gain.setValueAtTime(baseGain, fadeOutStartTime);
          clipGain.gain.linearRampToValueAtTime(0, ctx.currentTime + timeUntilStart + playDuration);
        }
      }

      // Track Pan
      const panner = ctx.createStereoPanner();
      panner.pan.value = track.pan;

      // Connect: source -> clipGain -> panner -> destination bus
      sourceNode.connect(clipGain);
      clipGain.connect(panner);

      if (track.type === 'voice') {
        panner.connect(this.voiceChainInput!);
      } else if (track.type === 'music_bed') {
        // Auto ducking if enabled and voice clips exist
        if (track.ducking && voiceClips.length > 0) {
          const duckGain = Math.pow(10, (track.duckingAmount || -12) / 20);
          panner.connect(this.musicBedGain!);
          // Check if currently overlapping a voice clip
          const overlapsVoice = voiceClips.some(
            (vc) => this.playhead >= vc.startTime && this.playhead <= vc.startTime + vc.duration
          );
          if (overlapsVoice) {
            this.musicBedGain!.gain.setTargetAtTime(duckGain * track.volume, ctx.currentTime, 0.2);
          } else {
            this.musicBedGain!.gain.setTargetAtTime(track.volume, ctx.currentTime, 0.4);
          }
        } else {
          panner.connect(this.musicBedGain!);
        }
      } else {
        panner.connect(this.masterGain!);
      }

      const scheduleStartTime = ctx.currentTime + timeUntilStart;
      sourceNode.start(scheduleStartTime, clipOffset, playDuration);

      this.activeSourceNodes.push({ source: sourceNode, clipId: clip.id });

      if (clipEndOnTimeline > maxEndTime) {
        maxEndTime = clipEndOnTimeline;
      }
    }

    this.startPlayheadLoop(maxEndTime, onEnded);
  }

  private startPlayheadLoop(maxEndTime: number, onEnded?: () => void) {
    const update = () => {
      if (!this.isPlaying || !this.ctx) return;
      const elapsed = this.ctx.currentTime - this.playheadStartTimestamp;
      this.playhead = this.playheadStartOffset + elapsed;

      this.playheadListeners.forEach((fn) => fn(this.playhead));

      if (this.playhead >= maxEndTime && maxEndTime > 0) {
        this.stopPlayback();
        if (onEnded) onEnded();
        return;
      }

      this.rafId = requestAnimationFrame(update);
    };

    this.rafId = requestAnimationFrame(update);
  }

  public pause() {
    this.stopPlayback();
  }

  public stopPlayback() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isPlaying = false;
    for (const node of this.activeSourceNodes) {
      try {
        node.source.stop();
        node.source.disconnect();
      } catch {
        // Ignore already ended nodes
      }
    }
    this.activeSourceNodes = [];
  }

  public seek(seconds: number) {
    this.playhead = Math.max(0, seconds);
    this.playheadListeners.forEach((fn) => fn(this.playhead));
  }

  public subscribePlayhead(fn: (time: number) => void): () => void {
    this.playheadListeners.add(fn);
    return () => this.playheadListeners.delete(fn);
  }

  // --- Offline Rendering for Professional Export ---

  public async renderFinalMix(
    tracks: AudioTrack[],
    clips: AudioClip[],
    dspSettings: DspSettings,
    totalDuration: number
  ): Promise<AudioBuffer> {
    const renderDuration = Math.max(1, Math.ceil(totalDuration) + 1);
    const sampleRate = 48000;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * renderDuration, sampleRate);

    // Setup DSP chain in offline context
    const lowCut = offlineCtx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = dspSettings.lowCutEnabled ? dspSettings.lowCutFreq : 10;

    const eqLS = offlineCtx.createBiquadFilter();
    eqLS.type = 'lowshelf';
    eqLS.frequency.value = dspSettings.eqBands.lowShelf.frequency;
    eqLS.gain.value = dspSettings.eqEnabled ? dspSettings.eqBands.lowShelf.gain : 0;

    const eqLM = offlineCtx.createBiquadFilter();
    eqLM.type = 'peaking';
    eqLM.frequency.value = dspSettings.eqBands.lowMid.frequency;
    eqLM.gain.value = dspSettings.eqEnabled ? dspSettings.eqBands.lowMid.gain : 0;
    eqLM.Q.value = dspSettings.eqBands.lowMid.q;

    const eqHM = offlineCtx.createBiquadFilter();
    eqHM.type = 'peaking';
    eqHM.frequency.value = dspSettings.eqBands.highMid.frequency;
    eqHM.gain.value = dspSettings.eqEnabled ? dspSettings.eqBands.highMid.gain : 0;
    eqHM.Q.value = dspSettings.eqBands.highMid.q;

    const eqHS = offlineCtx.createBiquadFilter();
    eqHS.type = 'highshelf';
    eqHS.frequency.value = dspSettings.eqBands.highShelf.frequency;
    eqHS.gain.value = dspSettings.eqEnabled ? dspSettings.eqBands.highShelf.gain : 0;

    const comp = offlineCtx.createDynamicsCompressor();
    if (dspSettings.compressor.enabled) {
      comp.threshold.value = dspSettings.compressor.threshold;
      comp.ratio.value = dspSettings.compressor.ratio;
      comp.attack.value = dspSettings.compressor.attack;
      comp.release.value = dspSettings.compressor.release;
    } else {
      comp.threshold.value = 0;
      comp.ratio.value = 1;
    }

    const makeup = offlineCtx.createGain();
    makeup.gain.value = dspSettings.compressor.enabled
      ? Math.pow(10, dspSettings.compressor.makeupGain / 20)
      : 1.0;

    // Connect voice chain
    const voiceBus = offlineCtx.createGain();
    voiceBus.connect(lowCut);
    lowCut.connect(eqLS);
    eqLS.connect(eqLM);
    eqLM.connect(eqHM);
    eqHM.connect(eqHS);
    eqHS.connect(comp);
    comp.connect(makeup);

    // Optional subtle room impulse
    if (dspSettings.reverb.enabled && dspSettings.reverb.mix > 0) {
      const conv = offlineCtx.createConvolver();
      conv.buffer = this.createSyntheticImpulse(offlineCtx, 1.2, 0.4);
      const wet = offlineCtx.createGain();
      wet.gain.value = dspSettings.reverb.mix;
      const dry = offlineCtx.createGain();
      dry.gain.value = 1 - dspSettings.reverb.mix;

      makeup.connect(dry);
      makeup.connect(conv);
      conv.connect(wet);

      dry.connect(offlineCtx.destination);
      wet.connect(offlineCtx.destination);
    } else {
      makeup.connect(offlineCtx.destination);
    }

    // Schedule all clips
    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track || track.muted) continue;

      const src = offlineCtx.createBufferSource();
      src.buffer = clip.audioBuffer;

      const clipGain = offlineCtx.createGain();
      const baseGain = clip.gain * track.volume;
      clipGain.gain.setValueAtTime(baseGain, clip.startTime);

      if (clip.fadeIn > 0) {
        clipGain.gain.setValueAtTime(0, clip.startTime);
        clipGain.gain.linearRampToValueAtTime(baseGain, clip.startTime + clip.fadeIn);
      }
      if (clip.fadeOut > 0) {
        clipGain.gain.setValueAtTime(baseGain, clip.startTime + clip.duration - clip.fadeOut);
        clipGain.gain.linearRampToValueAtTime(0, clip.startTime + clip.duration);
      }

      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = track.pan;

      src.connect(clipGain);
      clipGain.connect(panner);

      if (track.type === 'voice') {
        panner.connect(voiceBus);
      } else {
        panner.connect(offlineCtx.destination);
      }

      src.start(clip.startTime, clip.offset, clip.duration);
    }

    return await offlineCtx.startRendering();
  }

  // --- Clip Editing Helpers ---

  public splitClip(clip: AudioClip, splitTimelineTime: number): [AudioClip, AudioClip] | null {
    if (splitTimelineTime <= clip.startTime || splitTimelineTime >= clip.startTime + clip.duration) {
      return null;
    }

    const firstDuration = splitTimelineTime - clip.startTime;
    const secondDuration = clip.duration - firstDuration;

    const firstClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}-1`,
      name: `${clip.name} (Part 1)`,
      duration: firstDuration,
      fadeOut: Math.min(clip.fadeOut, 0.05),
    };

    const secondClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}-2`,
      name: `${clip.name} (Part 2)`,
      startTime: splitTimelineTime,
      offset: clip.offset + firstDuration,
      duration: secondDuration,
      fadeIn: Math.min(clip.fadeIn, 0.05),
    };

    return [firstClip, secondClip];
  }

  public autoStripSilence(clip: AudioClip, thresholdDb: number = -45): AudioClip[] {
    const silences = detectSilences(clip.audioBuffer, thresholdDb, 0.4);
    if (silences.length === 0) return [clip];

    const ctx = this.initContext();
    const resultClips: AudioClip[] = [];
    let currentOffset = clip.offset;
    let currentTimelineTime = clip.startTime;
    const clipEndOffset = clip.offset + clip.duration;

    // Filter silences within clip range
    const relevantSilences = silences.filter(
      (s) => s.end > currentOffset && s.start < clipEndOffset
    );

    let lastEnd = currentOffset;

    for (let i = 0; i < relevantSilences.length; i++) {
      const s = relevantSilences[i];
      const speechStart = lastEnd;
      const speechEnd = Math.max(speechStart, s.start);
      const speechDuration = speechEnd - speechStart;

      if (speechDuration > 0.15) {
        const slicedBuffer = sliceAudioBuffer(ctx, clip.audioBuffer, speechStart, speechDuration);
        resultClips.push({
          id: `clip-strip-${Date.now()}-${i}`,
          name: `${clip.name} (Cut ${i + 1})`,
          trackId: clip.trackId,
          startTime: currentTimelineTime,
          duration: speechDuration,
          offset: 0,
          audioBuffer: slicedBuffer,
          fadeIn: 0.02,
          fadeOut: 0.02,
          gain: clip.gain,
          color: clip.color,
          peaks: computePeaks(slicedBuffer, 600),
        });
        currentTimelineTime += speechDuration + 0.1; // small breathing gap
      }

      lastEnd = s.end;
    }

    // Remaining tail
    if (lastEnd < clipEndOffset && clipEndOffset - lastEnd > 0.15) {
      const remainingDuration = clipEndOffset - lastEnd;
      const slicedBuffer = sliceAudioBuffer(ctx, clip.audioBuffer, lastEnd, remainingDuration);
      resultClips.push({
        id: `clip-strip-${Date.now()}-tail`,
        name: `${clip.name} (End)`,
        trackId: clip.trackId,
        startTime: currentTimelineTime,
        duration: remainingDuration,
        offset: 0,
        audioBuffer: slicedBuffer,
        fadeIn: 0.02,
        fadeOut: 0.02,
        gain: clip.gain,
        color: clip.color,
        peaks: computePeaks(slicedBuffer, 600),
      });
    }

    return resultClips.length > 0 ? resultClips : [clip];
  }
}

export const audioEngine = AudioEngine.getInstance();
