import React, { useRef, useEffect, useState } from 'react';
import { DspSettings, EqBand } from '../types/audio';
import { DSP_PRESETS } from '../services/presets';
import { audioEngine } from '../services/audioEngine';
import { useTheme } from '../context/ThemeContext';
import { 
  Sliders, Activity, Sparkles, VolumeX, 
  Wind, ShieldAlert, Check
} from 'lucide-react';

interface DspRackProps {
  dspSettings: DspSettings;
  setDspSettings: React.Dispatch<React.SetStateAction<DspSettings>>;
}

export const DspRack: React.FC<DspRackProps> = ({ dspSettings, setDspSettings }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState<'eq' | 'dynamics' | 'room'>('eq');
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);
  const [gainReductionDb, setGainReductionDb] = useState<number>(0);

  // Apply changes to real audio engine whenever dspSettings changes
  useEffect(() => {
    audioEngine.applyDspSettings(dspSettings);
  }, [dspSettings]);

  // Gain reduction monitoring loop
  useEffect(() => {
    let animId: number;
    const pollGainReduction = () => {
      // Approximate compressor GR based on master level and threshold
      if (dspSettings.compressor.enabled && audioEngine.isPlaying) {
        const levels = audioEngine.getMasterLevels();
        if (levels.peakDb > dspSettings.compressor.threshold) {
          const excess = levels.peakDb - dspSettings.compressor.threshold;
          const gr = excess * (1 - 1 / dspSettings.compressor.ratio);
          setGainReductionDb(Math.min(18, Math.max(0, gr)));
        } else {
          setGainReductionDb((prev) => Math.max(0, prev * 0.85));
        }
      } else {
        setGainReductionDb(0);
      }
      animId = requestAnimationFrame(pollGainReduction);
    };
    animId = requestAnimationFrame(pollGainReduction);
    return () => cancelAnimationFrame(animId);
  }, [dspSettings.compressor, dspSettings.compressor.enabled]);

  // Draw 4-Band Parametric EQ Response Curve
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = canvas.offsetWidth * 2);
    const height = (canvas.height = canvas.offsetHeight * 2);

    ctx.clearRect(0, 0, width, height);

    // Grid lines for frequency (20Hz to 20kHz log scale)
    const minFreq = 20;
    const maxFreq = 20000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    const freqToX = (f: number) => {
      const logF = Math.log10(Math.max(minFreq, Math.min(maxFreq, f)));
      return ((logF - logMin) / (logMax - logMin)) * width;
    };

    const dbToY = (db: number) => {
      // Range: +15 dB (top) to -15 dB (bottom)
      const normalized = (15 - db) / 30;
      return normalized * height;
    };

    // Draw background grid lines
    ctx.strokeStyle = isLight ? '#cbd5e1' : '#1a2233';
    ctx.lineWidth = 1;

    // dB lines (+12, +6, 0, -6, -12)
    [-12, -6, 0, 6, 12].forEach((db) => {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.font = '16px JetBrains Mono, monospace';
      ctx.fillStyle = db === 0 ? (isLight ? '#1e293b' : '#94a3b8') : (isLight ? '#64748b' : '#334155');
      ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 10, y - 4);
    });

    // Freq grid lines (100Hz, 1kHz, 10kHz)
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = isLight ? '#64748b' : '#334155';
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x + 4, height - 10);
    });

    // Compute composite frequency response curve
    ctx.beginPath();
    ctx.strokeStyle = isLight ? '#0284c7' : '#06b6d4';
    ctx.lineWidth = 3.5;

    for (let px = 0; px <= width; px += 4) {
      const logF = logMin + (px / width) * (logMax - logMin);
      const f = Math.pow(10, logF);

      let totalDb = 0;

      // 80Hz Low cut high-pass response
      if (dspSettings.lowCutEnabled) {
        const fc = dspSettings.lowCutFreq;
        if (f < fc) {
          totalDb -= Math.min(36, 18 * Math.log2(fc / f));
        }
      }

      // EQ bands contribution
      if (dspSettings.eqEnabled) {
        // Low Shelf
        const ls = dspSettings.eqBands.lowShelf;
        if (f < ls.frequency) {
          totalDb += ls.gain;
        } else if (f < ls.frequency * 2) {
          const ratio = (f - ls.frequency) / ls.frequency;
          totalDb += ls.gain * (1 - ratio);
        }

        // Low Mid peaking
        const lm = dspSettings.eqBands.lowMid;
        const bwLm = lm.frequency / lm.q;
        const distLm = Math.abs(f - lm.frequency);
        if (distLm < bwLm) {
          totalDb += lm.gain * Math.cos((distLm / bwLm) * (Math.PI / 2));
        }

        // High Mid peaking
        const hm = dspSettings.eqBands.highMid;
        const bwHm = hm.frequency / hm.q;
        const distHm = Math.abs(f - hm.frequency);
        if (distHm < bwHm) {
          totalDb += hm.gain * Math.cos((distHm / bwHm) * (Math.PI / 2));
        }

        // High Shelf
        const hs = dspSettings.eqBands.highShelf;
        if (f > hs.frequency) {
          totalDb += hs.gain;
        } else if (f > hs.frequency / 2) {
          const ratio = (hs.frequency - f) / (hs.frequency / 2);
          totalDb += hs.gain * (1 - ratio);
        }
      }

      const y = dbToY(totalDb);
      if (px === 0) {
        ctx.moveTo(px, y);
      } else {
        ctx.lineTo(px, y);
      }
    }
    ctx.stroke();

    // Fill area below curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, isLight ? 'rgba(2, 132, 199, 0.22)' : 'rgba(6, 182, 212, 0.25)');
    grad.addColorStop(1, isLight ? 'rgba(2, 132, 199, 0.02)' : 'rgba(6, 182, 212, 0.01)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw band control dots
    const bands: { band: EqBand; name: string; color: string }[] = [
      { band: dspSettings.eqBands.lowShelf, name: 'LS', color: '#38bdf8' },
      { band: dspSettings.eqBands.lowMid, name: 'LM', color: '#a855f7' },
      { band: dspSettings.eqBands.highMid, name: 'HM', color: '#ec4899' },
      { band: dspSettings.eqBands.highShelf, name: 'HS', color: '#eab308' },
    ];

    bands.forEach(({ band, color }) => {
      const bx = freqToX(band.frequency);
      const by = dbToY(dspSettings.eqEnabled ? band.gain : 0);

      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
  }, [dspSettings, isLight]);

  const applyPreset = (name: string) => {
    const preset = DSP_PRESETS[name];
    if (preset) {
      setDspSettings((prev) => ({
        ...prev,
        ...preset,
        presetName: name,
      }));
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col shadow-xl transition-colors duration-200 ${
        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#10141f] border-[#1e2538] text-slate-100'
      }`}
    >
      {/* Top Header with Presets */}
      <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#1e2538]'}`}>
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-500" />
          <h3 className={`font-semibold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Voice DSP Master Rack</h3>
          <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>· {dspSettings.presetName}</span>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <select
            value={dspSettings.presetName}
            onChange={(e) => applyPreset(e.target.value)}
            className={`text-xs border rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 ${
              isLight
                ? 'bg-slate-50 text-slate-800 border-slate-300'
                : 'bg-[#161c2b] text-slate-200 border-[#27324b]'
            }`}
          >
            {Object.keys(DSP_PRESETS).map((p) => (
              <option key={p} value={p}>
                Preset: {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rack Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 pt-3 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('eq')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'eq'
              ? isLight
                ? 'bg-slate-100 text-cyan-800 font-bold border border-cyan-500/40 shadow-2xs'
                : 'bg-[#1e273b] text-cyan-400 border border-cyan-500/30'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          4-Band Parametric EQ
        </button>
        <button
          onClick={() => setActiveTab('dynamics')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'dynamics'
              ? isLight
                ? 'bg-slate-100 text-cyan-800 font-bold border border-cyan-500/40 shadow-2xs'
                : 'bg-[#1e273b] text-cyan-400 border border-cyan-500/30'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Dynamics & De-Esser
        </button>
        <button
          onClick={() => setActiveTab('room')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'room'
              ? isLight
                ? 'bg-slate-100 text-cyan-800 font-bold border border-cyan-500/40 shadow-2xs'
                : 'bg-[#1e273b] text-cyan-400 border border-cyan-500/30'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Booth Reverb & Ambience
        </button>
      </div>

      {/* Tab 1: Parametric EQ Canvas & Frequencies */}
      {activeTab === 'eq' && (
        <div className="space-y-4">
          <div className="relative h-44 bg-[#0a0d14] rounded-lg border border-[#1b2233] overflow-hidden">
            <canvas ref={eqCanvasRef} className="w-full h-full block" />
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-[#161d2d]/80 px-2 py-1 rounded border border-[#27324b] cursor-pointer">
                <input
                  type="checkbox"
                  checked={dspSettings.lowCutEnabled}
                  onChange={(e) =>
                    setDspSettings((s) => ({ ...s, lowCutEnabled: e.target.checked }))
                  }
                  className="rounded text-cyan-500"
                />
                <span>Low-Cut 80Hz</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-[#161d2d]/80 px-2 py-1 rounded border border-[#27324b] cursor-pointer">
                <input
                  type="checkbox"
                  checked={dspSettings.eqEnabled}
                  onChange={(e) =>
                    setDspSettings((s) => ({ ...s, eqEnabled: e.target.checked }))
                  }
                  className="rounded text-cyan-500"
                />
                <span>Bypass EQ</span>
              </label>
            </div>
          </div>

          {/* 4 EQ Band Sliders */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            {/* Low Shelf */}
            <div className="bg-[#141926] p-2.5 rounded border border-[#20273a]">
              <div className="flex items-center justify-between text-sky-400 font-semibold mb-1.5">
                <span>Low Shelf</span>
                <span className="font-mono-code text-[11px]">
                  {dspSettings.eqBands.lowShelf.gain > 0 ? '+' : ''}
                  {dspSettings.eqBands.lowShelf.gain.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={dspSettings.eqBands.lowShelf.gain}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDspSettings((s) => ({
                    ...s,
                    eqBands: { ...s.eqBands, lowShelf: { ...s.eqBands.lowShelf, gain: val } },
                  }));
                }}
                className="w-full h-1 bg-[#232a3b] rounded cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-1">120 Hz · Warmth</div>
            </div>

            {/* Low Mid */}
            <div className="bg-[#141926] p-2.5 rounded border border-[#20273a]">
              <div className="flex items-center justify-between text-purple-400 font-semibold mb-1.5">
                <span>Low-Mid (Body)</span>
                <span className="font-mono-code text-[11px]">
                  {dspSettings.eqBands.lowMid.gain > 0 ? '+' : ''}
                  {dspSettings.eqBands.lowMid.gain.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={dspSettings.eqBands.lowMid.gain}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDspSettings((s) => ({
                    ...s,
                    eqBands: { ...s.eqBands, lowMid: { ...s.eqBands.lowMid, gain: val } },
                  }));
                }}
                className="w-full h-1 bg-[#232a3b] rounded cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-1">450 Hz · Mud Notch</div>
            </div>

            {/* High Mid */}
            <div className="bg-[#141926] p-2.5 rounded border border-[#20273a]">
              <div className="flex items-center justify-between text-pink-400 font-semibold mb-1.5">
                <span>Presence</span>
                <span className="font-mono-code text-[11px]">
                  {dspSettings.eqBands.highMid.gain > 0 ? '+' : ''}
                  {dspSettings.eqBands.highMid.gain.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={dspSettings.eqBands.highMid.gain}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDspSettings((s) => ({
                    ...s,
                    eqBands: { ...s.eqBands, highMid: { ...s.eqBands.highMid, gain: val } },
                  }));
                }}
                className="w-full h-1 bg-[#232a3b] rounded cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-1">3.2 kHz · Articulation</div>
            </div>

            {/* High Shelf */}
            <div className="bg-[#141926] p-2.5 rounded border border-[#20273a]">
              <div className="flex items-center justify-between text-amber-400 font-semibold mb-1.5">
                <span>Air (Highs)</span>
                <span className="font-mono-code text-[11px]">
                  {dspSettings.eqBands.highShelf.gain > 0 ? '+' : ''}
                  {dspSettings.eqBands.highShelf.gain.toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={dspSettings.eqBands.highShelf.gain}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDspSettings((s) => ({
                    ...s,
                    eqBands: { ...s.eqBands, highShelf: { ...s.eqBands.highShelf, gain: val } },
                  }));
                }}
                className="w-full h-1 bg-[#232a3b] rounded cursor-pointer"
              />
              <div className="text-[10px] text-slate-500 mt-1">9.5 kHz · Sheen & Clarity</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Dynamics Compressor, De-Esser & Noise Gate */}
      {activeTab === 'dynamics' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Studio Vocal Compressor */}
          <div className="bg-[#141926] p-3.5 rounded-lg border border-[#20273a] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-xs text-slate-100">Dynamics Compressor</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dspSettings.compressor.enabled}
                  onChange={(e) =>
                    setDspSettings((s) => ({
                      ...s,
                      compressor: { ...s.compressor, enabled: e.target.checked },
                    }))
                  }
                  className="rounded text-emerald-500"
                />
                <span>Active</span>
              </label>
            </div>

            {/* Live Gain Reduction Meter */}
            <div className="bg-[#0b0e15] p-2 rounded border border-[#1e2538]">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Gain Reduction (GR)</span>
                <span className="font-mono-code text-rose-400 font-semibold">
                  -{gainReductionDb.toFixed(1)} dB
                </span>
              </div>
              <div className="h-2 bg-[#192233] rounded overflow-hidden flex flex-row-reverse">
                <div
                  className="h-full bg-gradient-to-l from-rose-500 to-amber-400 transition-all duration-75"
                  style={{ width: `${Math.min(100, (gainReductionDb / 15) * 100)}%` }}
                />
              </div>
            </div>

            {/* Threshold & Ratio */}
            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Threshold</span>
                  <span className="font-mono-code text-cyan-400">
                    {dspSettings.compressor.threshold} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="0"
                  step="1"
                  value={dspSettings.compressor.threshold}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDspSettings((s) => ({
                      ...s,
                      compressor: { ...s.compressor, threshold: val },
                    }));
                  }}
                  className="w-full h-1 bg-[#232a3b] rounded"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Ratio</span>
                  <span className="font-mono-code text-cyan-400">
                    {dspSettings.compressor.ratio}:1
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  value={dspSettings.compressor.ratio}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDspSettings((s) => ({
                      ...s,
                      compressor: { ...s.compressor, ratio: val },
                    }));
                  }}
                  className="w-full h-1 bg-[#232a3b] rounded"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Makeup Gain</span>
                  <span className="font-mono-code text-emerald-400">
                    +{dspSettings.compressor.makeupGain} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={dspSettings.compressor.makeupGain}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDspSettings((s) => ({
                      ...s,
                      compressor: { ...s.compressor, makeupGain: val },
                    }));
                  }}
                  className="w-full h-1 bg-[#232a3b] rounded"
                />
              </div>
            </div>
          </div>

          {/* De-Esser & Noise Gate */}
          <div className="space-y-3">
            {/* De-Esser */}
            <div className="bg-[#141926] p-3.5 rounded-lg border border-[#20273a] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-slate-100">Sibilance De-Esser</span>
                </div>
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dspSettings.deEsser.enabled}
                    onChange={(e) =>
                      setDspSettings((s) => ({
                        ...s,
                        deEsser: { ...s.deEsser, enabled: e.target.checked },
                      }))
                    }
                    className="rounded text-purple-500"
                  />
                  <span>Active</span>
                </label>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Center Frequency</span>
                  <span className="font-mono-code text-purple-300">
                    {dspSettings.deEsser.frequency} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min="4500"
                  max="8500"
                  step="100"
                  value={dspSettings.deEsser.frequency}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDspSettings((s) => ({
                      ...s,
                      deEsser: { ...s.deEsser, frequency: val },
                    }));
                  }}
                  className="w-full h-1 bg-[#232a3b] rounded"
                />
              </div>
            </div>

            {/* Noise Gate */}
            <div className="bg-[#141926] p-3.5 rounded-lg border border-[#20273a] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-slate-100">Room Noise Gate</span>
                </div>
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dspSettings.noiseGate.enabled}
                    onChange={(e) =>
                      setDspSettings((s) => ({
                        ...s,
                        noiseGate: { ...s.noiseGate, enabled: e.target.checked },
                      }))
                    }
                    className="rounded text-amber-500"
                  />
                  <span>Active</span>
                </label>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Threshold</span>
                  <span className="font-mono-code text-amber-300">
                    {dspSettings.noiseGate.threshold} dB
                  </span>
                </div>
                <input
                  type="range"
                  min="-70"
                  max="-25"
                  step="1"
                  value={dspSettings.noiseGate.threshold}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDspSettings((s) => ({
                      ...s,
                      noiseGate: { ...s.noiseGate, threshold: val },
                    }));
                  }}
                  className="w-full h-1 bg-[#232a3b] rounded"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Booth Reverb & Ambience */}
      {activeTab === 'room' && (
        <div className="bg-[#141926] p-4 rounded-lg border border-[#20273a] space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-slate-100">Studio Acoustic Ambience</h4>
              <p className="text-slate-400 text-[11px]">
                Adds natural physical room reflection to dry microphones.
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={dspSettings.reverb.enabled}
                onChange={(e) =>
                  setDspSettings((s) => ({
                    ...s,
                    reverb: { ...s.reverb, enabled: e.target.checked },
                  }))
                }
                className="rounded text-cyan-500"
              />
              <span>Enable Ambience</span>
            </label>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'booth', name: 'Acoustic Booth', desc: 'Ultra-dry, minimal reflection' },
              { id: 'studio', name: 'Studio Vocal', desc: 'Warm treated broadcast room' },
              { id: 'broadcast', name: 'Radio Station', desc: 'Crisp broadcast room tone' },
              { id: 'warm', name: 'Warm Hall', desc: 'Expansive narrative depth' },
            ].map((room) => (
              <button
                key={room.id}
                onClick={() =>
                  setDspSettings((s) => ({
                    ...s,
                    reverb: { ...s.reverb, roomType: room.id as any },
                  }))
                }
                className={`p-2.5 rounded text-left border transition-colors ${
                  dspSettings.reverb.roomType === room.id
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-white'
                    : 'bg-[#182030] border-[#252f44] text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold text-xs mb-0.5">{room.name}</div>
                <div className="text-[10px] text-slate-400">{room.desc}</div>
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-slate-300 mb-1.5">
              <span>Wet / Dry Blend</span>
              <span className="font-mono-code text-cyan-400">
                {Math.round(dspSettings.reverb.mix * 100)}% Wet
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.4"
              step="0.01"
              value={dspSettings.reverb.mix}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDspSettings((s) => ({
                  ...s,
                  reverb: { ...s.reverb, mix: val },
                }));
              }}
              className="w-full h-1 bg-[#232a3b] rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};
