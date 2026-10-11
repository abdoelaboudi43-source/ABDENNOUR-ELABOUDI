import React from 'react';
import { AudioClip } from '../types/audio';
import { audioEngine } from '../services/audioEngine';
import { createSynthesizedMusicBed, createSynthesizedSFX, computePeaks } from '../services/audioUtils';
import { useTheme } from '../context/ThemeContext';
import { Sparkles, Music, Bell, Plus, Volume2 } from 'lucide-react';

interface SfxDrawerProps {
  onAddClip: (clip: AudioClip) => void;
  playhead: number;
}

export const SfxDrawer: React.FC<SfxDrawerProps> = ({ onAddClip, playhead }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const addBedTrack = () => {
    const ctx = audioEngine.initContext();
    const bedBuffer = createSynthesizedMusicBed(ctx, 24);
    const clip: AudioClip = {
      id: `clip-bed-${Date.now()}`,
      name: 'Gentle Acoustic Narrative Bed',
      trackId: 'track-2',
      startTime: 0,
      duration: 24,
      offset: 0,
      audioBuffer: bedBuffer,
      fadeIn: 1.0,
      fadeOut: 2.0,
      gain: 0.6,
      color: '#d97706',
      peaks: computePeaks(bedBuffer, 800),
    };
    onAddClip(clip);
  };

  const addSfx = (type: 'countdown' | 'beep' | 'shutter' | 'chime', label: string) => {
    const ctx = audioEngine.initContext();
    const buffer = createSynthesizedSFX(ctx, type);
    const clip: AudioClip = {
      id: `clip-sfx-${Date.now()}`,
      name: label,
      trackId: 'track-3',
      startTime: playhead,
      duration: buffer.duration,
      offset: 0,
      audioBuffer: buffer,
      fadeIn: 0.01,
      fadeOut: 0.05,
      gain: 0.9,
      color: '#059669',
      peaks: computePeaks(buffer, 300),
    };
    onAddClip(clip);
  };

  return (
    <div
      className={`border rounded-lg p-3 text-xs space-y-2 transition-colors duration-200 ${
        isLight ? 'bg-white border-slate-300 shadow-xs' : 'bg-[#10141f] border-[#1e2538]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
          <Music className="w-3.5 h-3.5 text-amber-500" />
          <span>Studio Audio Beds & Sound FX</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <button
          onClick={addBedTrack}
          className={`flex items-center justify-between px-2.5 py-1.5 border rounded transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#161c2b] hover:bg-[#20293d] border-[#27324b] text-slate-300 hover:text-white'
          }`}
          title="Generates 24s ambient acoustic chord bed on Track 2 (with auto-ducking)"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Volume2 className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate">Music Bed</span>
          </div>
          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
        </button>

        <button
          onClick={() => addSfx('countdown', 'Countdown Beep')}
          className={`flex items-center justify-between px-2.5 py-1.5 border rounded transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#161c2b] hover:bg-[#20293d] border-[#27324b] text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Bell className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="truncate">Countdown Pip</span>
          </div>
          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
        </button>

        <button
          onClick={() => addSfx('chime', 'Studio Chime')}
          className={`flex items-center justify-between px-2.5 py-1.5 border rounded transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#161c2b] hover:bg-[#20293d] border-[#27324b] text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Sparkles className="w-3 h-3 text-cyan-500 shrink-0" />
            <span className="truncate">Podcast Chime</span>
          </div>
          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
        </button>

        <button
          onClick={() => addSfx('shutter', 'Tape Click')}
          className={`flex items-center justify-between px-2.5 py-1.5 border rounded transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#161c2b] hover:bg-[#20293d] border-[#27324b] text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Bell className="w-3 h-3 text-purple-500 shrink-0" />
            <span className="truncate">Tape Click</span>
          </div>
          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
        </button>

        <button
          onClick={() => addSfx('beep', 'High Pip')}
          className={`flex items-center justify-between px-2.5 py-1.5 border rounded transition-colors ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
              : 'bg-[#161c2b] hover:bg-[#20293d] border-[#27324b] text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Bell className="w-3 h-3 text-rose-500 shrink-0" />
            <span className="truncate">Censor Bleep</span>
          </div>
          <Plus className="w-3 h-3 text-cyan-500 shrink-0" />
        </button>
      </div>
    </div>
  );
};
