import React, { useState, useEffect } from 'react';
import { AudioClip, AudioTrack, DspSettings } from './types/audio';
import { DEFAULT_DSP_SETTINGS } from './services/presets';
import { audioEngine } from './services/audioEngine';
import { createSynthesizedMusicBed, createSynthesizedSFX, computePeaks } from './services/audioUtils';
import { WaveformTimeline } from './components/WaveformTimeline';
import { RecordingBooth } from './components/RecordingBooth';
import { ScriptPrompter } from './components/ScriptPrompter';
import { DspRack } from './components/DspRack';
import { SfxDrawer } from './components/SfxDrawer';
import { ComplianceModal } from './components/ComplianceModal';
import { ExportModal } from './components/ExportModal';
import { 
  Mic, Sliders, BookOpen, Layers, 
  HelpCircle, Radio, Sparkles, Volume2, X,
  Sun, Moon
} from 'lucide-react';
import { useTheme } from './context/ThemeContext';

const INITIAL_TRACKS: AudioTrack[] = [
  {
    id: 'track-1',
    name: 'Primary Voice Over',
    type: 'voice',
    volume: 1.0,
    pan: 0,
    muted: false,
    solo: false,
    ducking: false,
    duckingAmount: -12,
    armRecord: true,
    color: '#0284c7', // cyan / sky
  },
  {
    id: 'track-2',
    name: 'Acoustic Music Bed',
    type: 'music_bed',
    volume: 0.65,
    pan: 0,
    muted: false,
    solo: false,
    ducking: true,
    duckingAmount: -12,
    armRecord: false,
    color: '#d97706', // amber
  },
  {
    id: 'track-3',
    name: 'Sound FX & Pips',
    type: 'sfx',
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    ducking: false,
    duckingAmount: -12,
    armRecord: false,
    color: '#059669', // emerald
  },
];

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [tracks, setTracks] = useState<AudioTrack[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [dspSettings, setDspSettings] = useState<DspSettings>(DEFAULT_DSP_SETTINGS);
  const [projectName, setProjectName] = useState<string>('The Breakthrough VO Session');

  // Active view tab for bottom studio consoles
  const [activeConsole, setActiveConsole] = useState<'booth' | 'script' | 'dsp'>('booth');

  // Modals
  const [complianceOpen, setComplianceOpen] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);

  // Seed initial demo audio on startup so timeline is immediately usable
  useEffect(() => {
    const ctx = audioEngine.initContext();

    // Create a 20s gentle narrative background music bed on Track 2
    const bedBuffer = createSynthesizedMusicBed(ctx, 20);
    const bedClip: AudioClip = {
      id: 'clip-initial-bed',
      name: 'Ambient Acoustic Bed',
      trackId: 'track-2',
      startTime: 0,
      duration: 20,
      offset: 0,
      audioBuffer: bedBuffer,
      fadeIn: 0.8,
      fadeOut: 1.5,
      gain: 0.55,
      color: '#d97706',
      peaks: computePeaks(bedBuffer, 800),
    };

    // Create an intro chime on Track 3
    const chimeBuffer = createSynthesizedSFX(ctx, 'chime');
    const chimeClip: AudioClip = {
      id: 'clip-initial-chime',
      name: 'Podcast Intro Chime',
      trackId: 'track-3',
      startTime: 0.2,
      duration: chimeBuffer.duration,
      offset: 0,
      audioBuffer: chimeBuffer,
      fadeIn: 0.01,
      fadeOut: 0.05,
      gain: 0.85,
      color: '#059669',
      peaks: computePeaks(chimeBuffer, 300),
    };

    setClips([bedClip, chimeClip]);

    // Subscribe to playhead tick
    const unsubscribe = audioEngine.subscribePlayhead((time) => {
      setPlayhead(time);
    });

    return () => unsubscribe();
  }, []);

  const handleAddClip = (clip: AudioClip) => {
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
  };

  const isLight = theme === 'light';

  return (
    <div
      className={`min-h-screen flex flex-col font-sans select-none transition-colors duration-200 ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0c12] text-slate-100'
      }`}
    >
      {/* Studio Top Navigation Bar */}
      <header
        className={`h-14 border-b px-5 flex items-center justify-between z-20 shrink-0 transition-colors ${
          isLight ? 'bg-white border-slate-300 shadow-xs' : 'bg-[#111520] border-[#1d2436]'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-sm tracking-wide bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
                VOXSTUDIO PRO
              </span>
              <span
                className={`text-[9px] uppercase tracking-widest -mt-0.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Voice Over & DAW
              </span>
            </div>
          </div>

          <div className={`h-5 w-px mx-2 ${isLight ? 'bg-slate-300' : 'bg-[#263147]'}`} />

          {/* Project Name editable */}
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className={`text-xs font-semibold bg-transparent border rounded px-2 py-1 transition-all max-w-xs ${
              isLight
                ? 'border-transparent hover:border-slate-300 focus:border-cyan-500 text-slate-800 focus:bg-slate-50'
                : 'border-transparent hover:border-[#263147] focus:border-cyan-500 text-slate-200 focus:bg-[#161c2b]'
            }`}
            title="Click to rename project"
          />
        </div>

        {/* Center Station / Console Tab Switcher */}
        <div
          className={`flex items-center p-1 rounded-lg border ${
            isLight ? 'bg-slate-100 border-slate-300' : 'bg-[#090b10] border-[#20283c]'
          }`}
        >
          <button
            onClick={() => setActiveConsole('booth')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeConsole === 'booth'
                ? isLight
                  ? 'bg-white text-cyan-700 font-bold shadow-xs border border-slate-200'
                  : 'bg-[#1e273b] text-cyan-400 font-semibold shadow-xs'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Recording Booth</span>
          </button>
          <button
            onClick={() => setActiveConsole('script')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeConsole === 'script'
                ? isLight
                  ? 'bg-white text-cyan-700 font-bold shadow-xs border border-slate-200'
                  : 'bg-[#1e273b] text-cyan-400 font-semibold shadow-xs'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Script & Prompter</span>
          </button>
          <button
            onClick={() => setActiveConsole('dsp')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeConsole === 'dsp'
                ? isLight
                  ? 'bg-white text-cyan-700 font-bold shadow-xs border border-slate-200'
                  : 'bg-[#1e273b] text-cyan-400 font-semibold shadow-xs'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Voice DSP Rack & EQ</span>
          </button>
        </div>

        {/* Right Tools & Theme Toggle */}
        <div className="flex items-center gap-2">
          {/* Global Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold border transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 shadow-2xs'
                : 'bg-[#161c2b] hover:bg-[#20293d] text-amber-300 border-[#28354d]'
            }`}
            title={isLight ? 'Switch to Dark Mode (Studio)' : 'Switch to High Contrast Light Mode (Daylight)'}
          >
            {isLight ? (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span>Dark Mode</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light Mode</span>
              </>
            )}
          </button>

          <button
            onClick={() => setComplianceOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                : 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border-indigo-700/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-indigo-500" />
            <span>ACX Check</span>
          </button>

          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow-xs transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Export WAV</span>
          </button>

          <button
            onClick={() => setShortcutsOpen(true)}
            className={`p-1.5 rounded ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                : 'text-slate-400 hover:text-white hover:bg-[#1a2130]'
            }`}
            title="Keyboard Shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <main className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
        {/* Upper Zone: Multi-Track Timeline & Waveform Editor */}
        <section className="shrink-0">
          <WaveformTimeline
            tracks={tracks}
            setTracks={setTracks}
            clips={clips}
            setClips={setClips}
            selectedClipId={selectedClipId}
            setSelectedClipId={setSelectedClipId}
            playhead={playhead}
            setPlayhead={setPlayhead}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            onOpenCompliance={() => setComplianceOpen(true)}
            onOpenExport={() => setExportOpen(true)}
          />
        </section>

        {/* Quick SFX & Music Bed Toolbar */}
        <section className="shrink-0">
          <SfxDrawer onAddClip={handleAddClip} playhead={playhead} />
        </section>

        {/* Lower Zone: Active Studio Workstation Module */}
        <section className="flex-1 min-h-[360px] pb-6">
          {activeConsole === 'booth' && (
            <RecordingBooth
              onAddClipToTimeline={handleAddClip}
              playhead={playhead}
              setPlayhead={setPlayhead}
            />
          )}

          {activeConsole === 'script' && (
            <ScriptPrompter
              onSyncRecord={() => {
                setActiveConsole('booth');
              }}
            />
          )}

          {activeConsole === 'dsp' && (
            <DspRack dspSettings={dspSettings} setDspSettings={setDspSettings} />
          )}
        </section>
      </main>

      {/* Modals */}
      <ComplianceModal
        isOpen={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        tracks={tracks}
        clips={clips}
        dspSettings={dspSettings}
        setDspSettings={setDspSettings}
        setTracks={setTracks}
      />

      <ExportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        tracks={tracks}
        clips={clips}
        dspSettings={dspSettings}
        projectName={projectName}
      />

      {/* Shortcuts Modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div
            className={`border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 transition-colors ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-[#121622] border-[#222a3d] text-slate-100'
            }`}
          >
            <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-slate-200' : 'border-[#222a3d]'}`}>
              <h3 className="font-bold text-sm">Keyboard Shortcuts & Hotkeys</h3>
              <button
                onClick={() => setShortcutsOpen(false)}
                className={isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`space-y-2.5 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              <div className={`flex justify-between items-center py-1 border-b ${isLight ? 'border-slate-100' : 'border-[#1b2233]'}`}>
                <span>Play / Pause Timeline</span>
                <kbd className={`px-2 py-0.5 rounded border font-mono-code ${isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-[#1a2130] border-[#2b354c]'}`}>
                  Space
                </kbd>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isLight ? 'border-slate-100' : 'border-[#1b2233]'}`}>
                <span>Razor Cut / Split at Playhead</span>
                <kbd className={`px-2 py-0.5 rounded border font-mono-code ${isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-[#1a2130] border-[#2b354c]'}`}>
                  S
                </kbd>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isLight ? 'border-slate-100' : 'border-[#1b2233]'}`}>
                <span>Delete Selected Clip</span>
                <kbd className={`px-2 py-0.5 rounded border font-mono-code ${isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-[#1a2130] border-[#2b354c]'}`}>
                  Del / Backspace
                </kbd>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isLight ? 'border-slate-100' : 'border-[#1b2233]'}`}>
                <span>Scrub Playhead</span>
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Click on Ruler / Timeline</span>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isLight ? 'border-slate-100' : 'border-[#1b2233]'}`}>
                <span>Trim Clip Start or End</span>
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Drag Left/Right edge handles</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Move Clip Position</span>
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Drag Clip Body</span>
              </div>
            </div>

            <button
              onClick={() => setShortcutsOpen(false)}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
