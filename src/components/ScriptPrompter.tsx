import React, { useState, useEffect, useRef } from 'react';
import { ScriptPreset } from '../types/audio';
import { SAMPLE_SCRIPTS } from '../services/presets';
import { useTheme } from '../context/ThemeContext';
import { 
  BookOpen, Play, Pause, RotateCcw, 
  Type, Gauge, Sparkles, Edit3
} from 'lucide-react';

// Include the user's inspirational prompt into the built-in scripts
const ALL_SCRIPTS: ScriptPreset[] = [
  {
    id: 'script-breakthrough',
    title: 'The Breakthrough - Motivational Trailer',
    category: 'Commercial',
    character: 'Narrator (Grounded, Empathic, Resonant)',
    tone: 'Slow build, authentic emotion, resolute power',
    targetDuration: '30 seconds',
    content: `[Quiet inhale, gentle and intimate]
Nobody sees your struggle.
Nobody counts the late nights, or the silent doubts whispered in empty rooms.

[Subtle pause 1.0s]
They only see the finished painting.
They only hear the voice when the curtain rises.

[Rising resonance, unshakeable conviction]
Keep going.
Your breakthrough is closer than you think.`,
  },
  ...SAMPLE_SCRIPTS,
];

interface ScriptPrompterProps {
  onSyncRecord?: () => void;
}

export const ScriptPrompter: React.FC<ScriptPrompterProps> = ({ onSyncRecord }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [selectedScriptId, setSelectedScriptId] = useState<string>('script-breakthrough');
  const [customContent, setCustomContent] = useState<string>(ALL_SCRIPTS[0].content);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Teleprompter Auto-scroll state
  const [isScrolling, setIsScrolling] = useState<boolean>(false);
  const [scrollSpeedWpm, setScrollSpeedWpm] = useState<number>(140); // Words per min
  const [fontSizePx, setFontSizePx] = useState<number>(22);
  const [showReadingGuide, setShowReadingGuide] = useState<boolean>(true);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<number | null>(null);

  const activeScript = ALL_SCRIPTS.find((s) => s.id === selectedScriptId) || ALL_SCRIPTS[0];

  // Select script
  const handleSelectScript = (id: string) => {
    setSelectedScriptId(id);
    const found = ALL_SCRIPTS.find((s) => s.id === id);
    if (found) {
      setCustomContent(found.content);
    }
    setIsScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  // Word count & estimate read time
  const words = customContent.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round((words / (scrollSpeedWpm || 140)) * 60);

  // Auto-scroll loop
  useEffect(() => {
    if (!isScrolling) {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const linesPerMinute = scrollSpeedWpm / 10;
    const pixelsPerSecond = (linesPerMinute * (fontSizePx * 1.6)) / 60;

    let lastTimestamp = performance.now();

    const step = (now: number) => {
      const deltaSec = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      if (container) {
        container.scrollTop += pixelsPerSecond * deltaSec;
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 5) {
          setIsScrolling(false);
          return;
        }
      }

      scrollAnimRef.current = requestAnimationFrame(step);
    };

    scrollAnimRef.current = requestAnimationFrame(step);
    return () => {
      if (scrollAnimRef.current) cancelAnimationFrame(scrollAnimRef.current);
    };
  }, [isScrolling, scrollSpeedWpm, fontSizePx]);

  const handleResetScroll = () => {
    setIsScrolling(false);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  // Parse lines to highlight stage directions in brackets [Pause], [Whisper]
  const renderFormattedScript = () => {
    return customContent.split('\n').map((line, idx) => {
      if (!line.trim()) {
        return <div key={idx} className="h-4" />;
      }

      // Check if bracketed cue
      if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
        return (
          <div
            key={idx}
            className={`my-2 inline-block px-2.5 py-1 font-mono-code text-xs rounded border tracking-wide font-semibold ${
              isLight
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-amber-950/40 text-amber-300 border-amber-700/40'
            }`}
          >
            {line.trim()}
          </div>
        );
      }

      return (
        <p
          key={idx}
          className={`mb-4 font-medium leading-relaxed tracking-wide transition-[font-size] duration-75 select-text ${
            isLight ? 'text-slate-900 drop-shadow-none' : 'text-slate-100 drop-shadow-xs'
          }`}
          style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.65 }}
        >
          {line}
        </p>
      );
    });
  };

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col space-y-3 shadow-xl h-full transition-colors duration-200 ${
        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#10141f] border-[#1e2538] text-slate-100'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-slate-200' : 'border-[#1e2538]'}`}>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-500" />
          <h3 className={`font-semibold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            Voice Acting Script & Prompter
          </h3>
        </div>

        {/* Script Selection Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedScriptId}
            onChange={(e) => handleSelectScript(e.target.value)}
            className={`text-xs border rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 max-w-[210px] truncate ${
              isLight
                ? 'bg-slate-50 text-slate-800 border-slate-300'
                : 'bg-[#161c2b] text-slate-200 border-[#27324b]'
            }`}
          >
            {ALL_SCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                [{s.category}] {s.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 ${
              isEditing
                ? 'bg-cyan-700 text-white'
                : isLight
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-[#182030] text-slate-400 hover:text-white'
            }`}
            title="Edit script text"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Done' : 'Edit'}</span>
          </button>
        </div>
      </div>

      {/* Prompter Controls Bar */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs gap-3 flex-wrap ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0a0d14] border-[#1b2233]'
        }`}
      >
        {/* Play/Pause Scroll */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsScrolling(!isScrolling)}
            className={`flex items-center gap-1.5 px-3 py-1 font-semibold rounded transition-colors ${
              isScrolling
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isScrolling ? 'Pause Scroll' : 'Start Prompter'}</span>
          </button>
          <button
            onClick={handleResetScroll}
            className={`p-1 rounded ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
            title="Reset to top"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed (WPM) Slider */}
        <div className="flex items-center gap-2">
          <Gauge className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
          <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-400'}>Pace</span>
          <input
            type="range"
            min="90"
            max="220"
            step="5"
            value={scrollSpeedWpm}
            onChange={(e) => setScrollSpeedWpm(parseInt(e.target.value))}
            className={`w-18 h-1 rounded cursor-pointer ${isLight ? 'bg-slate-300' : 'bg-[#232a3b]'}`}
            title="Reading pace in words per minute"
          />
          <span className={`font-mono-code text-[11px] w-14 font-semibold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
            {scrollSpeedWpm} WPM
          </span>
        </div>

        {/* Font Size Slider & Quick Step Buttons */}
        <div className="flex items-center gap-2">
          <Type className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
          <span className={isLight ? 'text-slate-700 font-medium' : 'text-slate-400'}>Size</span>
          <input
            type="range"
            min="14"
            max="44"
            step="1"
            value={fontSizePx}
            onChange={(e) => setFontSizePx(parseInt(e.target.value))}
            className={`w-24 h-1 rounded cursor-pointer ${isLight ? 'bg-slate-300' : 'bg-[#232a3b]'}`}
            title="Scale text font size (14px - 44px)"
          />
          <span className={`font-mono-code text-[11px] w-8 font-semibold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
            {fontSizePx}px
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFontSizePx((s) => Math.max(14, s - 2))}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-[#161c2b] text-slate-300 hover:bg-[#20293d]'
              }`}
              title="Decrease font size"
            >
              A-
            </button>
            <button
              onClick={() => setFontSizePx((s) => Math.min(44, s + 2))}
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-[#161c2b] text-slate-300 hover:bg-[#20293d]'
              }`}
              title="Increase font size"
            >
              A+
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className={`text-[11px] font-mono-code ml-auto ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          {words} words · ~{estimatedSeconds}s
        </div>
      </div>

      {/* Script Prompter Viewport */}
      <div
        className={`relative flex-1 rounded-lg border overflow-hidden min-h-[220px] transition-colors ${
          isLight ? 'bg-white border-slate-300' : 'bg-[#090b10] border-[#1b2233]'
        }`}
      >
        {/* Fixed Eye-Level Reading Guide Line */}
        {showReadingGuide && !isEditing && (
          <div
            className={`absolute top-1/3 left-0 right-0 h-10 pointer-events-none z-10 flex items-center justify-between px-3 ${
              isLight
                ? 'border-y border-cyan-600/30 bg-cyan-50/50'
                : 'border-y border-cyan-500/20 bg-cyan-500/5'
            }`}
          >
            <span
              className={`text-[9px] uppercase tracking-widest font-mono-code font-bold ${
                isLight ? 'text-cyan-800' : 'text-cyan-400/70'
              }`}
            >
              Eye-Level Focus Line
            </span>
          </div>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto px-8 py-10 transition-all"
          style={{ fontSize: `${fontSizePx}px` }}
        >
          {isEditing ? (
            <textarea
              value={customContent}
              onChange={(e) => setCustomContent(e.target.value)}
              className={`w-full h-full bg-transparent resize-none focus:outline-none font-mono-code leading-relaxed text-sm ${
                isLight ? 'text-slate-900' : 'text-slate-100'
              }`}
              placeholder="Paste or write your script here... Use [Square Brackets] for acting notes and pauses."
            />
          ) : (
            <div className="max-w-2xl mx-auto">{renderFormattedScript()}</div>
          )}
        </div>
      </div>

      {/* Script Direction Context */}
      <div className={`flex items-center justify-between text-xs px-1 pt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
        <div className="flex items-center gap-2 truncate">
          <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{activeScript.character}:</span>
          <span className="italic truncate">{activeScript.tone}</span>
        </div>
        <div className={`shrink-0 font-mono-code text-[11px] font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
          Target: {activeScript.targetDuration}
        </div>
      </div>
    </div>
  );
};
