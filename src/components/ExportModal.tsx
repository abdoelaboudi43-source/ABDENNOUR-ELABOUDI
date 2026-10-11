import React, { useState } from 'react';
import { AudioClip, AudioTrack, DspSettings } from '../types/audio';
import { audioEngine } from '../services/audioEngine';
import { audioBufferToWav } from '../services/audioUtils';
import { useTheme } from '../context/ThemeContext';
import { Download, X, Layers, CheckCircle2, Music, Mic } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioTrack[];
  clips: AudioClip[];
  dspSettings: DspSettings;
  projectName: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  tracks,
  clips,
  dspSettings,
  projectName,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [format, setFormat] = useState<'wav24' | 'wav16'>('wav24');
  const [exportTarget, setExportTarget] = useState<'master' | 'voice_only' | 'bed_only'>('master');
  const [customFilename, setCustomFilename] = useState<string>(
    `${projectName.replace(/\s+/g, '_')}_Master.wav`
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportedSizeMb, setExportedSizeMb] = useState<number>(0);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setDownloadUrl(null);

    try {
      let filteredTracks = tracks;
      if (exportTarget === 'voice_only') {
        filteredTracks = tracks.map((t) => (t.type === 'voice' ? t : { ...t, muted: true }));
      } else if (exportTarget === 'bed_only') {
        filteredTracks = tracks.map((t) => (t.type === 'music_bed' ? t : { ...t, muted: true }));
      }

      const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 5);
      const renderedBuffer = await audioEngine.renderFinalMix(
        filteredTracks,
        clips,
        dspSettings,
        totalDuration
      );

      const bitDepth = format === 'wav24' ? 24 : 16;
      const wavBlob = audioBufferToWav(renderedBuffer, bitDepth);
      const url = URL.createObjectURL(wavBlob);

      setDownloadUrl(url);
      setExportedSizeMb(parseFloat((wavBlob.size / (1024 * 1024)).toFixed(2)));

      // Trigger instant download
      const a = document.createElement('a');
      a.href = url;
      a.download = customFilename.endsWith('.wav') ? customFilename : `${customFilename}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export audio file.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div
        className={`border rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 transition-colors duration-200 ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#121622] border-[#222a3d] text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#222a3d]'}`}>
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-600" />
            <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Export Studio Audio</h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-[#1a2130]'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-4 text-xs">
          {/* Filename */}
          <div>
            <label className={`block font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>File Name</label>
            <input
              type="text"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              className={`w-full border rounded px-3 py-2 focus:outline-none focus:border-cyan-500 font-mono-code ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-[#0b0e15] border-[#222a3d] text-slate-100'
              }`}
            />
          </div>

          {/* Export Source / Stems */}
          <div>
            <label className={`block font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Stem / Mix Target</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setExportTarget('master')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  exportTarget === 'master'
                    ? isLight
                      ? 'bg-cyan-50 border-cyan-500 text-cyan-900 font-semibold'
                      : 'bg-cyan-950/40 border-cyan-500/60 text-white'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    : 'bg-[#161c2b] border-[#222a3d] text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Full Master</span>
                </div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>All tracks mixed</div>
              </button>

              <button
                onClick={() => setExportTarget('voice_only')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  exportTarget === 'voice_only'
                    ? isLight
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold'
                      : 'bg-cyan-950/40 border-cyan-500/60 text-white'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    : 'bg-[#161c2b] border-[#222a3d] text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Voice Stem</span>
                </div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Isolated voice track</div>
              </button>

              <button
                onClick={() => setExportTarget('bed_only')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  exportTarget === 'bed_only'
                    ? isLight
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-semibold'
                      : 'bg-cyan-950/40 border-cyan-500/60 text-white'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                    : 'bg-[#161c2b] border-[#222a3d] text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-amber-600" />
                  <span>Music Bed</span>
                </div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Backing audio stem</div>
              </button>
            </div>
          </div>

          {/* Bit depth */}
          <div>
            <label className={`block font-semibold mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Resolution & Quality</label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer ${
                  format === 'wav24'
                    ? isLight
                      ? 'bg-cyan-50 border-cyan-500 text-slate-900'
                      : 'bg-cyan-950/40 border-cyan-500/60 text-white'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-600'
                    : 'bg-[#161c2b] border-[#222a3d] text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  checked={format === 'wav24'}
                  onChange={() => setFormat('wav24')}
                  className="text-cyan-600"
                />
                <div>
                  <div className="font-semibold">24-Bit Studio Master WAV</div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Lossless 48kHz / 24-bit PCM</div>
                </div>
              </label>

              <label
                className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer ${
                  format === 'wav16'
                    ? isLight
                      ? 'bg-cyan-50 border-cyan-500 text-slate-900'
                      : 'bg-cyan-950/40 border-cyan-500/60 text-white'
                    : isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-600'
                    : 'bg-[#161c2b] border-[#222a3d] text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  checked={format === 'wav16'}
                  onChange={() => setFormat('wav16')}
                  className="text-cyan-600"
                />
                <div>
                  <div className="font-semibold">16-Bit Broadcast WAV</div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Standard ACX / Podcast 16-bit</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Download ready indicator */}
        {downloadUrl && (
          <div
            className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
              isLight
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Export rendered successfully ({exportedSizeMb} MB)</span>
            </div>
            <a
              href={downloadUrl}
              download={customFilename}
              className="font-bold underline hover:opacity-80"
            >
              Download again
            </a>
          </div>
        )}

        {/* Footer */}
        <div className={`flex items-center justify-end gap-2 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-[#222a3d]'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded text-xs transition-colors ${
              isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-[#1a2130] hover:bg-[#232c40] text-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Rendering Audio...' : 'Render & Download'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
