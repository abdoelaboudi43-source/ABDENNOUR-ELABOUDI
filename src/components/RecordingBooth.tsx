import React, { useState, useEffect, useRef } from 'react';
import { AudioClip, TakeRecord } from '../types/audio';
import { audioEngine } from '../services/audioEngine';
import { computePeaks, formatTimecode } from '../services/audioUtils';
import { useTheme } from '../context/ThemeContext';
import { 
  Mic, MicOff, Headphones, Star, Plus, 
  Play, Pause, Trash2, CheckCircle2, AlertTriangle, Disc
} from 'lucide-react';

interface RecordingBoothProps {
  onAddClipToTimeline: (clip: AudioClip) => void;
  playhead: number;
  setPlayhead: (time: number) => void;
}

export const RecordingBooth: React.FC<RecordingBoothProps> = ({
  onAddClipToTimeline,
  playhead,
  setPlayhead,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [isMicConnected, setIsMicConnected] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordDuration, setRecordDuration] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownEnabled, setCountdownEnabled] = useState<boolean>(true);

  // Monitoring
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [monitorVolume, setMonitorVolume] = useState<number>(0.8);

  // Metering
  const [peakDb, setPeakDb] = useState<number>(-96);
  const [rmsDb, setRmsDb] = useState<number>(-96);
  const [isClipping, setIsClipping] = useState<boolean>(false);

  // Audio devices
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Takes management
  const [takes, setTakes] = useState<TakeRecord[]>([]);
  const [auditioningTakeId, setAuditioningTakeId] = useState<string | null>(null);
  const auditionSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Device enumeration
  useEffect(() => {
    async function loadDevices() {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devs.filter((d) => d.kind === 'audioinput');
        setDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error('Error querying audio devices:', err);
      }
    }
    loadDevices();
  }, [isMicConnected]);

  // Connect microphone
  const handleConnectMic = async () => {
    try {
      await audioEngine.startMicrophone(selectedDeviceId || undefined);
      setIsMicConnected(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Microphone access was denied or not found. Please check browser permissions.');
    }
  };

  const handleDisconnectMic = () => {
    audioEngine.stopMicrophone();
    setIsMicConnected(false);
    setIsMonitoring(false);
  };

  // Real-time VU meter loop
  useEffect(() => {
    if (!isMicConnected) {
      setPeakDb(-96);
      setRmsDb(-96);
      return;
    }

    let animId: number;
    const pollLevels = () => {
      const levels = audioEngine.getMicLevels();
      setPeakDb(levels.peakDb);
      setRmsDb(levels.rmsDb);
      if (levels.isClipping) {
        setIsClipping(true);
      }
      animId = requestAnimationFrame(pollLevels);
    };
    animId = requestAnimationFrame(pollLevels);
    return () => cancelAnimationFrame(animId);
  }, [isMicConnected]);

  // Clear clipping indicator after 2 seconds of clean signal
  useEffect(() => {
    if (isClipping) {
      const timer = setTimeout(() => setIsClipping(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isClipping]);

  // Toggle headphone monitoring
  const handleToggleMonitoring = () => {
    const next = !isMonitoring;
    setIsMonitoring(next);
    audioEngine.setMonitoring(next, monitorVolume);
  };

  const handleMonitorVolumeChange = (vol: number) => {
    setMonitorVolume(vol);
    if (isMonitoring) {
      audioEngine.setMonitoring(true, vol);
    }
  };

  // Start / Stop Recording with optional 3-second countdown
  const handleToggleRecord = () => {
    if (isRecording) {
      // Stop recording
      audioEngine.stopRecording();
      setIsRecording(false);
    } else {
      if (!isMicConnected) {
        handleConnectMic().then(() => {
          triggerRecording();
        });
      } else {
        triggerRecording();
      }
    }
  };

  const triggerRecording = () => {
    if (countdownEnabled) {
      setCountdown(3);
      const timer1 = setTimeout(() => setCountdown(2), 1000);
      const timer2 = setTimeout(() => setCountdown(1), 2000);
      const timer3 = setTimeout(() => {
        setCountdown(null);
        startActualRecord();
      }, 3000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      startActualRecord();
    }
  };

  const startActualRecord = () => {
    setIsRecording(true);
    setRecordDuration(0);

    audioEngine.startRecording((buffer, duration) => {
      const takeNumber = takes.length + 1;
      const newTake: TakeRecord = {
        id: `take-${Date.now()}`,
        takeNumber,
        timestamp: Date.now(),
        duration,
        audioBuffer: buffer,
        name: `Voice Take ${takeNumber}`,
        rating: 4,
        notes: '',
        kept: true,
      };

      setTakes((prev) => [newTake, ...prev]);

      // Automatically add to primary voice track at current playhead
      const clip: AudioClip = {
        id: `clip-rec-${Date.now()}`,
        name: `Take ${takeNumber}`,
        trackId: 'track-1',
        startTime: playhead,
        duration: duration,
        offset: 0,
        audioBuffer: buffer,
        fadeIn: 0.02,
        fadeOut: 0.02,
        gain: 1.0,
        color: '#0284c7',
        peaks: computePeaks(buffer, 700),
      };
      onAddClipToTimeline(clip);
      setPlayhead(playhead + duration);
    });
  };

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordDuration((d) => d + 0.1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Audition take
  const handleAuditionTake = (take: TakeRecord) => {
    if (auditioningTakeId === take.id) {
      if (auditionSourceRef.current) {
        auditionSourceRef.current.stop();
        auditionSourceRef.current = null;
      }
      setAuditioningTakeId(null);
    } else {
      if (auditionSourceRef.current) {
        auditionSourceRef.current.stop();
      }
      const ctx = audioEngine.initContext();
      const src = ctx.createBufferSource();
      src.buffer = take.audioBuffer;
      src.connect(ctx.destination);
      src.onended = () => setAuditioningTakeId(null);
      src.start();
      auditionSourceRef.current = src;
      setAuditioningTakeId(take.id);
    }
  };

  // Add take to timeline manually
  const handleAddTakeToTimeline = (take: TakeRecord) => {
    const clip: AudioClip = {
      id: `clip-take-${Date.now()}`,
      name: take.name,
      trackId: 'track-1',
      startTime: playhead,
      duration: take.duration,
      offset: 0,
      audioBuffer: take.audioBuffer,
      fadeIn: 0.02,
      fadeOut: 0.02,
      gain: 1.0,
      color: '#0284c7',
      peaks: computePeaks(take.audioBuffer, 700),
    };
    onAddClipToTimeline(clip);
    setPlayhead(playhead + take.duration);
  };

  // Convert dBFS (-60 to 0) to percentage (0 to 100%)
  const dbToPercent = (db: number) => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return Math.round(((db + 60) / 60) * 100);
  };

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col space-y-4 shadow-xl transition-colors duration-200 ${
        isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#10141f] border-[#1e2538] text-slate-100'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#1e2538]'}`}>
        <div className="flex items-center gap-2">
          <Disc className="w-4 h-4 text-rose-500 animate-pulse" />
          <h3 className={`font-semibold text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Live Recording Booth</h3>
        </div>

        {/* Mic Input Device Picker */}
        <div className="flex items-center gap-2">
          <select
            value={selectedDeviceId}
            onChange={(e) => {
              setSelectedDeviceId(e.target.value);
              if (isMicConnected) {
                audioEngine.startMicrophone(e.target.value);
              }
            }}
            className={`text-xs border rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 max-w-[200px] truncate ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-[#161c2b] text-slate-200 border-[#27324b]'
            }`}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
              </option>
            ))}
            {devices.length === 0 && <option value="">Default Studio Mic</option>}
          </select>

          {isMicConnected ? (
            <button
              onClick={handleDisconnectMic}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border ${
                isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <MicOff className="w-3.5 h-3.5 text-rose-500" />
              <span>Disconnect</span>
            </button>
          ) : (
            <button
              onClick={handleConnectMic}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded font-medium shadow-2xs"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Engage Mic</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Recording Console */}
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* Big Record Button & Countdown */}
        <div
          className={`col-span-5 flex flex-col items-center justify-center p-3 rounded-lg border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0a0d14] border-[#1b2233]'
          }`}
        >
          {countdown !== null ? (
            <div className="text-4xl font-extrabold text-amber-500 animate-ping my-3 font-mono-code">
              {countdown}
            </div>
          ) : (
            <button
              onClick={handleToggleRecord}
              className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all shadow-xl ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white ring-8 ring-rose-900/50 animate-pulse'
                  : 'bg-rose-600 hover:bg-rose-500 text-white hover:scale-105'
              }`}
            >
              <div
                className={`transition-all ${
                  isRecording ? 'w-6 h-6 bg-white rounded-xs' : 'w-7 h-7 bg-white rounded-full'
                }`}
              />
              <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5">
                {isRecording ? 'Stop' : 'Record'}
              </span>
            </button>
          )}

          {/* Time display & Options */}
          <div className="mt-2 text-center">
            <div className="font-mono-code text-xs text-rose-500 font-semibold tracking-wider">
              {isRecording ? formatTimecode(recordDuration) : 'Ready to Punch-in'}
            </div>
            <label className={`flex items-center justify-center gap-1.5 text-[11px] mt-1 cursor-pointer ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <input
                type="checkbox"
                checked={countdownEnabled}
                onChange={(e) => setCountdownEnabled(e.target.checked)}
                className="rounded text-rose-500"
              />
              <span>3s Countdown Cue</span>
            </label>
          </div>
        </div>

        {/* Hardware VU Meter & Clipping */}
        <div
          className={`col-span-4 p-3 rounded-lg border space-y-2 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0a0d14] border-[#1b2233]'
          }`}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Input Meter (dBFS)</span>
            <div
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                isClipping
                  ? 'bg-rose-600 text-white animate-bounce'
                  : isLight
                  ? 'bg-slate-200 text-slate-500'
                  : 'bg-[#182030] text-slate-500'
              }`}
            >
              CLIP
            </div>
          </div>

          {/* Peak Meter Bar */}
          <div>
            <div className={`flex justify-between text-[10px] mb-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <span>Peak</span>
              <span className={`font-mono-code font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                {peakDb > -90 ? `${peakDb.toFixed(1)} dB` : '-inf'}
              </span>
            </div>
            <div className={`h-3 rounded overflow-hidden flex ${isLight ? 'bg-slate-200' : 'bg-[#161d2d]'}`}>
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-75"
                style={{ width: `${dbToPercent(peakDb)}%` }}
              />
            </div>
          </div>

          {/* RMS Meter Bar */}
          <div>
            <div className={`flex justify-between text-[10px] mb-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <span>RMS (Body)</span>
              <span className={`font-mono-code font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                {rmsDb > -90 ? `${rmsDb.toFixed(1)} dB` : '-inf'}
              </span>
            </div>
            <div className={`h-2 rounded overflow-hidden flex ${isLight ? 'bg-slate-200' : 'bg-[#161d2d]'}`}>
              <div
                className="h-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${dbToPercent(rmsDb)}%` }}
              />
            </div>
          </div>

          <div className={`flex justify-between text-[9px] font-mono-code ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>
            <span>-60</span>
            <span>-36</span>
            <span>-18</span>
            <span>-6</span>
            <span>0 dB</span>
          </div>
        </div>

        {/* Headphone Live Monitoring */}
        <div
          className={`col-span-3 p-3 rounded-lg border space-y-2 text-xs ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0a0d14] border-[#1b2233]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-1.5 ${isLight ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
              <Headphones className="w-3.5 h-3.5 text-cyan-500" />
              <span className="font-medium">Direct Monitor</span>
            </div>
            <button
              onClick={handleToggleMonitoring}
              disabled={!isMicConnected}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                isMonitoring
                  ? 'bg-cyan-600 text-white'
                  : isLight
                  ? 'bg-slate-200 text-slate-600 hover:text-slate-900'
                  : 'bg-[#182030] text-slate-400 hover:text-white'
              }`}
            >
              {isMonitoring ? 'ON' : 'OFF'}
            </button>
          </div>

          <div>
            <div className={`flex justify-between text-[10px] mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <span>Monitor Vol</span>
              <span className="font-mono-code">{Math.round(monitorVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={monitorVolume}
              onChange={(e) => handleMonitorVolumeChange(parseFloat(e.target.value))}
              disabled={!isMonitoring}
              className={`w-full h-1 rounded cursor-pointer ${isLight ? 'bg-slate-300' : 'bg-[#232a3b]'}`}
            />
          </div>

          <div className="text-[9px] text-amber-600 leading-tight">
            * Use headphones to prevent feedback loop.
          </div>
        </div>
      </div>

      {/* Takes Manager / Take Comping Stack */}
      <div className={`space-y-2 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-[#1e2538]'}`}>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>Session Takes Stack</span>
            <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>({takes.length} takes recorded)</span>
          </div>
          {takes.length > 0 && (
            <button
              onClick={() => setTakes([])}
              className="text-[11px] text-slate-500 hover:text-rose-500 transition-colors"
            >
              Clear Takes
            </button>
          )}
        </div>

        {takes.length === 0 ? (
          <div
            className={`py-4 text-center text-xs rounded border border-dashed ${
              isLight
                ? 'bg-slate-50 text-slate-500 border-slate-300'
                : 'bg-[#0a0d14] text-slate-500 border-[#1f283d]'
            }`}
          >
            Hit Record or spacebar to lay down Take 1. Each take is captured and saved here.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {takes.map((take) => (
              <div
                key={take.id}
                className={`flex items-center justify-between px-3 py-2 border rounded text-xs transition-colors ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-[#141926] hover:bg-[#182030] border-[#20283c] text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAuditionTake(take)}
                    className={`p-1 rounded transition-colors ${
                      isLight
                        ? 'bg-slate-200 hover:bg-cyan-600 hover:text-white text-slate-700'
                        : 'bg-[#202b40] hover:bg-cyan-700 text-slate-200 hover:text-white'
                    }`}
                    title="Audition Take"
                  >
                    {auditioningTakeId === take.id ? (
                      <Pause className="w-3.5 h-3.5 text-cyan-500" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <div>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{take.name}</div>
                    <div className={`text-[10px] font-mono-code ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatTimecode(take.duration)}
                    </div>
                  </div>
                </div>

                {/* Rating stars */}
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() =>
                        setTakes((ts) =>
                          ts.map((t) => (t.id === take.id ? { ...t, rating: star } : t))
                        )
                      }
                      className={isLight ? 'text-slate-300 hover:text-amber-500' : 'text-slate-600 hover:text-amber-400'}
                    >
                      <Star
                        className={`w-3 h-3 ${
                          star <= take.rating ? 'fill-amber-400 text-amber-500' : ''
                        }`}
                      />
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAddTakeToTimeline(take)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-cyan-700 hover:bg-cyan-600 text-white rounded font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Drop onto Timeline</span>
                  </button>

                  <button
                    onClick={() => setTakes((ts) => ts.filter((t) => t.id !== take.id))}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded"
                    title="Delete take"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
