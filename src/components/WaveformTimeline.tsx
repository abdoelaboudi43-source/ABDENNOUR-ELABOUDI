import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AudioClip, AudioTrack } from '../types/audio';
import { audioEngine } from '../services/audioEngine';
import { formatTimecode } from '../services/audioUtils';
import { useTheme } from '../context/ThemeContext';
import { 
  Play, Pause, Square, Scissors, Wand2, Volume2, 
  Trash2, Copy, ZoomIn, ZoomOut, Layers, Radio
} from 'lucide-react';

interface WaveformTimelineProps {
  tracks: AudioTrack[];
  setTracks: React.Dispatch<React.SetStateAction<AudioTrack[]>>;
  clips: AudioClip[];
  setClips: React.Dispatch<React.SetStateAction<AudioClip[]>>;
  selectedClipId: string | null;
  setSelectedClipId: (id: string | null) => void;
  playhead: number;
  setPlayhead: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onOpenCompliance: () => void;
  onOpenExport: () => void;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
  tracks,
  setTracks,
  clips,
  setClips,
  selectedClipId,
  setSelectedClipId,
  playhead,
  setPlayhead,
  isPlaying,
  setIsPlaying,
  onOpenCompliance,
  onOpenExport,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(50); // Zoom level
  const [activeTool, setActiveTool] = useState<'pointer' | 'razor'>('pointer');
  const [draggingClip, setDraggingClip] = useState<{
    id: string;
    startX: number;
    initialStartTime: number;
    mode: 'move' | 'trim-left' | 'trim-right';
    initialOffset: number;
    initialDuration: number;
  } | null>(null);

  // Calculate timeline max duration
  const maxClipEnd = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 30);
  const totalTimelineDuration = Math.max(60, maxClipEnd + 15);
  const timelinePixelWidth = totalTimelineDuration * pixelsPerSecond;

  // Handle Play / Pause
  const handleTogglePlay = () => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play(tracks, clips, playhead, () => {
        setIsPlaying(false);
      });
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    audioEngine.stopPlayback();
    audioEngine.seek(0);
    setPlayhead(0);
    setIsPlaying(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteSelectedClip();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, tracks, clips, playhead, selectedClipId]);

  // Draw ruler canvas
  useEffect(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = timelinePixelWidth;
    canvas.height = 28;

    ctx.fillStyle = isLight ? '#f1f5f9' : '#0c0e14';
    ctx.fillRect(0, 0, canvas.width, 28);

    ctx.strokeStyle = isLight ? '#cbd5e1' : '#283042';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 27.5);
    ctx.lineTo(canvas.width, 27.5);
    ctx.stroke();

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = isLight ? '#1e293b' : '#64748b';

    const stepSeconds = pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 35 ? 2 : 5;

    for (let sec = 0; sec <= totalTimelineDuration; sec += stepSeconds) {
      const x = sec * pixelsPerSecond;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 14);
      ctx.lineTo(x + 0.5, 27);
      ctx.strokeStyle = isLight ? '#64748b' : '#334155';
      ctx.stroke();

      const timeText = formatTimecode(sec).slice(0, 5); // MM:SS
      ctx.fillText(timeText, x + 4, 12);

      // Minor tick marks
      const minorCount = 4;
      for (let m = 1; m < minorCount; m++) {
        const mx = (sec + (m * stepSeconds) / minorCount) * pixelsPerSecond;
        ctx.beginPath();
        ctx.moveTo(mx + 0.5, 20);
        ctx.lineTo(mx + 0.5, 27);
        ctx.strokeStyle = isLight ? '#cbd5e1' : '#1e293b';
        ctx.stroke();
      }
    }
  }, [pixelsPerSecond, timelinePixelWidth, totalTimelineDuration, isLight]);

  // Click ruler or track to scrub playhead
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + (containerRef.current?.scrollLeft || 0);
    const newTime = Math.max(0, clickX / pixelsPerSecond);
    audioEngine.seek(newTime);
    setPlayhead(newTime);
    if (isPlaying) {
      audioEngine.play(tracks, clips, newTime, () => setIsPlaying(false));
    }
  };

  // Split selected clip or clip under playhead
  const handleSplitAtPlayhead = () => {
    const targetClip = clips.find(
      (c) => playhead > c.startTime && playhead < c.startTime + c.duration
    );
    if (!targetClip) return;

    const splitResult = audioEngine.splitClip(targetClip, playhead);
    if (!splitResult) return;

    const [first, second] = splitResult;
    setClips((prev) => prev.map((c) => (c.id === targetClip.id ? first : c)).concat(second));
    setSelectedClipId(second.id);
  };

  // Strip silence on selected clip
  const handleStripSilence = () => {
    if (!selectedClipId) return;
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const newClips = audioEngine.autoStripSilence(clip, -44);
    if (newClips.length > 1) {
      setClips((prev) => {
        const filtered = prev.filter((c) => c.id !== clip.id);
        return [...filtered, ...newClips];
      });
      setSelectedClipId(newClips[0].id);
    }
  };

  // Normalize clip to peak -1.0 dB
  const handleNormalize = () => {
    if (!selectedClipId) return;
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== selectedClipId) return c;
        const channel = c.audioBuffer.getChannelData(0);
        let max = 0;
        for (let i = 0; i < channel.length; i++) {
          const val = Math.abs(channel[i]);
          if (val > max) max = val;
        }
        if (max === 0) return c;
        const targetAmp = Math.pow(10, -1.0 / 20); // ~0.891
        const newGain = Math.min(2.0, targetAmp / max);
        return { ...c, gain: Number(newGain.toFixed(2)) };
      })
    );
  };

  // Duplicate selected clip
  const handleDuplicate = () => {
    if (!selectedClipId) return;
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const dup: AudioClip = {
      ...clip,
      id: `clip-dup-${Date.now()}`,
      name: `${clip.name} (Copy)`,
      startTime: clip.startTime + clip.duration + 0.5,
    };
    setClips((prev) => [...prev, dup]);
    setSelectedClipId(dup.id);
  };

  // Delete selected clip
  const handleDeleteSelectedClip = () => {
    if (!selectedClipId) return;
    setClips((prev) => prev.filter((c) => c.id !== selectedClipId));
    setSelectedClipId(null);
  };

  // Mouse handlers for dragging & trimming clips
  const handleMouseDownClip = (
    e: React.MouseEvent,
    clip: AudioClip,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();

    if (activeTool === 'razor') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickedTimeOnClip = clickX / pixelsPerSecond;
      const splitTime = clip.startTime + clickedTimeOnClip;
      const splitResult = audioEngine.splitClip(clip, splitTime);
      if (splitResult) {
        const [c1, c2] = splitResult;
        setClips((prev) => prev.map((c) => (c.id === clip.id ? c1 : c)).concat(c2));
        setSelectedClipId(c2.id);
      }
      return;
    }

    setSelectedClipId(clip.id);
    setDraggingClip({
      id: clip.id,
      startX: e.clientX,
      initialStartTime: clip.startTime,
      mode,
      initialOffset: clip.offset,
      initialDuration: clip.duration,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingClip) return;
      const deltaX = e.clientX - draggingClip.startX;
      const deltaSec = deltaX / pixelsPerSecond;

      setClips((prev) =>
        prev.map((clip) => {
          if (clip.id !== draggingClip.id) return clip;

          if (draggingClip.mode === 'move') {
            const newStart = Math.max(0, draggingClip.initialStartTime + deltaSec);
            return { ...clip, startTime: Math.round(newStart * 100) / 100 };
          } else if (draggingClip.mode === 'trim-left') {
            const maxTrim = draggingClip.initialDuration - 0.2;
            const clampedDelta = Math.max(-draggingClip.initialOffset, Math.min(deltaSec, maxTrim));
            const newStart = draggingClip.initialStartTime + clampedDelta;
            const newOffset = draggingClip.initialOffset + clampedDelta;
            const newDuration = draggingClip.initialDuration - clampedDelta;
            return {
              ...clip,
              startTime: Math.max(0, newStart),
              offset: Math.max(0, newOffset),
              duration: Math.max(0.2, newDuration),
            };
          } else if (draggingClip.mode === 'trim-right') {
            const maxDuration = clip.audioBuffer.duration - clip.offset;
            const newDuration = Math.max(0.2, Math.min(maxDuration, draggingClip.initialDuration + deltaSec));
            return {
              ...clip,
              duration: newDuration,
            };
          }
          return clip;
        })
      );
    };

    const handleMouseUp = () => {
      setDraggingClip(null);
    };

    if (draggingClip) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingClip, pixelsPerSecond, setClips]);

  return (
    <div
      className={`flex flex-col border rounded-lg overflow-hidden transition-colors duration-200 ${
        isLight
          ? 'bg-white border-slate-300 shadow-md text-slate-800'
          : 'bg-[#0f121a] border-[#1e2433] shadow-2xl text-slate-100'
      }`}
    >
      {/* Timeline Toolbar */}
      <div
        className={`flex items-center justify-between px-4 py-2 border-b text-sm transition-colors ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141824] border-[#1e2433]'
        }`}
      >
        {/* Playback Transport */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded transition-colors ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Space to Play/Pause"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={handleStop}
            className={`p-1.5 rounded transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-[#1f2638]'
            }`}
            title="Stop & Return to Zero"
          >
            <Square className="w-4 h-4" />
          </button>

          {/* Timecode display */}
          <div
            className={`ml-3 px-3 py-1 border rounded font-mono-code text-xs tracking-wider ${
              isLight
                ? 'bg-white border-slate-300 text-cyan-700 font-bold'
                : 'bg-[#090b10] border-[#232a3b] text-cyan-400'
            }`}
          >
            {formatTimecode(playhead)}
          </div>
        </div>

        {/* Editing Tools */}
        <div
          className={`flex items-center gap-1 p-1 rounded border ${
            isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-[#0d1017] border-[#232a3b]'
          }`}
        >
          <button
            onClick={() => setActiveTool('pointer')}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              activeTool === 'pointer'
                ? isLight
                  ? 'bg-white text-cyan-800 font-bold shadow-2xs'
                  : 'bg-[#232c40] text-cyan-400 font-semibold'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Pointer / Move / Trim Tool"
          >
            Select & Move
          </button>
          <button
            onClick={() => setActiveTool('razor')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${
              activeTool === 'razor'
                ? isLight
                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-300'
                  : 'bg-rose-900/60 text-rose-300 font-semibold'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white'
            }`}
            title="Razor Tool (S): Split clip at click point or playhead"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Razor (S)</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSplitAtPlayhead}
            disabled={!clips.some((c) => playhead > c.startTime && playhead < c.startTime + c.duration)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#1a2130] hover:bg-[#252e42] text-slate-300 border-[#2d374d]'
            }`}
            title="Split clip at playhead position"
          >
            <Scissors className="w-3 h-3 text-cyan-500" />
            <span>Split at Playhead</span>
          </button>
          <button
            onClick={handleStripSilence}
            disabled={!selectedClipId}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#1a2130] hover:bg-[#252e42] text-slate-300 border-[#2d374d]'
            }`}
            title="Automatically detect breaths and dead air below -44 dB"
          >
            <Wand2 className="w-3 h-3 text-amber-500" />
            <span>Strip Silence</span>
          </button>
          <button
            onClick={handleNormalize}
            disabled={!selectedClipId}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-[#1a2130] hover:bg-[#252e42] text-slate-300 border-[#2d374d]'
            }`}
            title="Normalize peak to -1.0 dBFS"
          >
            <Volume2 className="w-3 h-3 text-emerald-500" />
            <span>Normalize</span>
          </button>
          <button
            onClick={handleDuplicate}
            disabled={!selectedClipId}
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-[#1f2638]'
            }`}
            title="Duplicate clip"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteSelectedClip}
            disabled={!selectedClipId}
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              isLight ? 'text-slate-600 hover:text-rose-600 hover:bg-slate-200' : 'text-slate-400 hover:text-rose-400 hover:bg-[#1f2638]'
            }`}
            title="Delete selected clip (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-[#263045]'}`} />

          {/* Zoom controls */}
          <div className={`flex items-center gap-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            <button
              onClick={() => setPixelsPerSecond((z) => Math.max(20, z - 15))}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-200 hover:text-slate-900' : 'hover:text-white hover:bg-[#1f2638]'}`}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono-code w-8 text-center">{pixelsPerSecond}x</span>
            <button
              onClick={() => setPixelsPerSecond((z) => Math.min(180, z + 15))}
              className={`p-1 rounded ${isLight ? 'hover:bg-slate-200 hover:text-slate-900' : 'hover:text-white hover:bg-[#1f2638]'}`}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className={`h-4 w-px mx-1 ${isLight ? 'bg-slate-300' : 'bg-[#263045]'}`} />

          <button
            onClick={onOpenCompliance}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors ${
              isLight
                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                : 'bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 border-indigo-700/50'
            }`}
          >
            <Radio className="w-3 h-3 text-indigo-500" />
            <span>ACX Check</span>
          </button>

          <button
            onClick={onOpenExport}
            className="flex items-center gap-1 px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded transition-colors shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Export Master</span>
          </button>
        </div>
      </div>

      {/* Timeline Canvas & Tracks Area */}
      <div className="flex overflow-hidden">
        {/* Track Headers (Left column) */}
        <div
          className={`w-56 shrink-0 border-r z-10 transition-colors ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121622] border-[#1e2433]'
          }`}
        >
          {/* Header spacer aligned with ruler */}
          <div
            className={`h-7 border-b px-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider ${
              isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-[#0c0e14] border-[#1e2433] text-slate-500'
            }`}
          >
            <span>Tracks</span>
            <span>{tracks.length} Stems</span>
          </div>

          {/* Track Controls */}
          {tracks.map((track) => (
            <div
              key={track.id}
              className={`h-28 px-3 py-2.5 border-b flex flex-col justify-between transition-colors ${
                isLight
                  ? 'border-slate-200 bg-white hover:bg-slate-50/80 text-slate-800'
                  : 'border-[#1e2433] bg-[#121622]/90 hover:bg-[#161b2a] text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: track.color }}
                  />
                  <span className={`font-semibold text-xs truncate max-w-[100px] ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    {track.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setTracks((ts) =>
                        ts.map((t) => (t.id === track.id ? { ...t, muted: !t.muted } : t))
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                      track.muted
                        ? 'bg-rose-500 text-white'
                        : isLight
                        ? 'bg-slate-200 text-slate-600 hover:text-slate-900'
                        : 'bg-[#1e2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    M
                  </button>
                  <button
                    onClick={() =>
                      setTracks((ts) =>
                        ts.map((t) => (t.id === track.id ? { ...t, solo: !t.solo } : t))
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                      track.solo
                        ? 'bg-amber-400 text-black'
                        : isLight
                        ? 'bg-slate-200 text-slate-600 hover:text-slate-900'
                        : 'bg-[#1e2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    S
                  </button>
                </div>
              </div>

              {/* Volume & Pan faders */}
              <div className={`space-y-1.5 text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <div className="flex items-center justify-between">
                  <span>Gain</span>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={track.volume}
                    onChange={(e) =>
                      setTracks((ts) =>
                        ts.map((t) =>
                          t.id === track.id ? { ...t, volume: parseFloat(e.target.value) } : t
                        )
                      )
                    }
                    className={`w-24 h-1 rounded cursor-pointer ${isLight ? 'bg-slate-300' : 'bg-[#232a3b]'}`}
                  />
                  <span className="font-mono-code text-[10px] w-7 text-right">
                    {Math.round(track.volume * 100)}%
                  </span>
                </div>

                {track.type === 'music_bed' && (
                  <div className="flex items-center justify-between text-[10px] text-cyan-600">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={track.ducking}
                        onChange={(e) =>
                          setTracks((ts) =>
                            ts.map((t) =>
                              t.id === track.id ? { ...t, ducking: e.target.checked } : t
                            )
                          )
                        }
                        className="rounded"
                      />
                      <span className="font-medium">Auto-Duck (-12dB)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Timeline Lanes */}
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative select-none"
        >
          {/* Ruler */}
          <div
            onClick={handleRulerClick}
            className="sticky top-0 z-20 cursor-pointer h-7"
            style={{ width: `${timelinePixelWidth}px` }}
          >
            <canvas ref={rulerCanvasRef} className="block w-full h-7" />
          </div>

          {/* Track Lanes */}
          <div
            className="relative"
            style={{ width: `${timelinePixelWidth}px` }}
            onClick={handleRulerClick}
          >
            {/* Playhead Vertical Line */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{
                left: `${playhead * pixelsPerSecond}px`,
                width: '1px',
                backgroundColor: isLight ? '#0284c7' : '#06b6d4',
                boxShadow: isLight ? '0 0 6px rgba(2, 132, 199, 0.6)' : '0 0 8px rgba(6, 182, 212, 0.8)',
              }}
            >
              <div className={`w-3 h-3 rotate-45 -ml-1 -mt-1 shadow-sm ${isLight ? 'bg-cyan-600' : 'bg-cyan-400'}`} />
            </div>

            {/* Individual Track Rows */}
            {tracks.map((track) => {
              const trackClips = clips.filter((c) => c.trackId === track.id);

              return (
                <div
                  key={track.id}
                  className={`h-28 border-b relative overflow-hidden transition-colors ${
                    isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-[#0b0e15] border-[#1c2230]'
                  }`}
                >
                  {/* Background grid lines */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                      backgroundImage: `linear-gradient(to right, ${isLight ? '#475569' : '#ffffff'} 1px, transparent 1px)`,
                      backgroundSize: `${pixelsPerSecond}px 100%`,
                    }}
                  />

                  {/* Render Clips */}
                  {trackClips.map((clip) => {
                    const isSelected = selectedClipId === clip.id;
                    const leftPx = clip.startTime * pixelsPerSecond;
                    const widthPx = Math.max(12, clip.duration * pixelsPerSecond);

                    return (
                      <div
                        key={clip.id}
                        onMouseDown={(e) => handleMouseDownClip(e, clip, 'move')}
                        className={`absolute top-2 bottom-2 rounded cursor-grab active:cursor-grabbing border transition-shadow ${
                          isSelected
                            ? isLight
                              ? 'border-cyan-600 ring-2 ring-cyan-500/50 shadow-md z-10'
                              : 'border-cyan-400 ring-2 ring-cyan-500/40 shadow-lg z-10'
                            : isLight
                            ? 'border-slate-300 hover:border-slate-400 shadow-2xs'
                            : 'border-slate-700/60 hover:border-slate-500'
                        }`}
                        style={{
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                          backgroundColor: clip.color || '#1e293b',
                        }}
                      >
                        {/* Trim Left Handle */}
                        <div
                          onMouseDown={(e) => handleMouseDownClip(e, clip, 'trim-left')}
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 transition-colors z-20"
                          title="Drag to trim start"
                        />

                        {/* Trim Right Handle */}
                        <div
                          onMouseDown={(e) => handleMouseDownClip(e, clip, 'trim-right')}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 transition-colors z-20"
                          title="Drag to trim end"
                        />

                        {/* Clip Waveform Canvas */}
                        <ClipWaveformCanvas
                          clip={clip}
                          width={widthPx}
                          height={80}
                          isSelected={isSelected}
                          isLight={isLight}
                        />

                        {/* Clip Label */}
                        <div className="absolute top-1 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-[11px] font-medium text-white/95 drop-shadow-sm">
                          <span className="truncate">{clip.name}</span>
                          <span className="font-mono-code text-[10px] text-white/80">
                            {clip.duration.toFixed(2)}s {clip.gain !== 1 && `(x${clip.gain})`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component to render individual clip waveforms at high frame rate
const ClipWaveformCanvas: React.FC<{
  clip: AudioClip;
  width: number;
  height: number;
  isSelected: boolean;
  isLight?: boolean;
}> = ({ clip, width, height, isSelected, isLight = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = Math.max(10, Math.floor(width));
    canvas.height = height;

    ctx.clearRect(0, 0, canvas.width, height);

    const peaks = clip.peaks;
    if (!peaks || peaks.length < 2) return;

    const [mins, maxs] = peaks;
    const bucketCount = mins.length;
    const midY = height / 2;

    ctx.fillStyle = isSelected
      ? '#ffffff'
      : isLight
      ? '#ffffff'
      : '#cbd5e1';

    // Draw waveform vertical slices
    for (let x = 0; x < canvas.width; x++) {
      const bucketIdx = Math.floor((x / canvas.width) * bucketCount);
      const minVal = mins[bucketIdx] || 0;
      const maxVal = maxs[bucketIdx] || 0;

      const top = midY - maxVal * midY * clip.gain;
      const bot = midY - minVal * midY * clip.gain;
      const barH = Math.max(1, bot - top);

      ctx.fillRect(x, top, 1, barH);
    }
  }, [clip, width, height, isSelected, isLight]);

  return <canvas ref={canvasRef} className="w-full h-full block rounded pointer-events-none" />;
};
