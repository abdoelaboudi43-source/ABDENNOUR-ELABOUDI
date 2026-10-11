import React, { useState, useEffect } from 'react';
import { AudioClip, AudioTrack, ComplianceReport, DspSettings } from '../types/audio';
import { audioEngine } from '../services/audioEngine';
import { analyzeCompliance } from '../services/audioUtils';
import { useTheme } from '../context/ThemeContext';
import { 
  ShieldCheck, AlertCircle, CheckCircle2, 
  X, Wand2, RefreshCw, Radio
} from 'lucide-react';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: AudioTrack[];
  clips: AudioClip[];
  dspSettings: DspSettings;
  setDspSettings: React.Dispatch<React.SetStateAction<DspSettings>>;
  setTracks: React.Dispatch<React.SetStateAction<AudioTrack[]>>;
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({
  isOpen,
  onClose,
  tracks,
  clips,
  dspSettings,
  setDspSettings,
  setTracks,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [appliedFix, setAppliedFix] = useState<boolean>(false);

  // Run compliance analysis
  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAppliedFix(false);

    try {
      const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 10);
      const renderedBuffer = await audioEngine.renderFinalMix(
        tracks,
        clips,
        dspSettings,
        totalDuration
      );
      const res = analyzeCompliance(renderedBuffer);
      setReport(res);
    } catch (err) {
      console.error('Compliance analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runAnalysis();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1-Click Auto-Fix to ACX Requirements
  const handleAutoFixAcx = () => {
    if (!report) return;

    // Target RMS: -20.0 dBFS
    const currentRms = report.rmsDb;
    const diffRms = -20.0 - currentRms;

    // Adjust compressor makeup gain and enable noise gate
    setDspSettings((prev) => ({
      ...prev,
      compressor: {
        ...prev.compressor,
        enabled: true,
        threshold: -22,
        ratio: 3.5,
        makeupGain: Math.max(0, Math.min(12, prev.compressor.makeupGain + diffRms)),
      },
      noiseGate: {
        ...prev.noiseGate,
        enabled: true,
        threshold: -52,
      },
      lowCutEnabled: true,
      lowCutFreq: 85,
    }));

    setAppliedFix(true);
    setTimeout(() => {
      runAnalysis();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div
        className={`border rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 transition-colors duration-200 ${
          isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#121622] border-[#222a3d] text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#222a3d]'}`}>
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-indigo-500" />
            <div>
              <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>ACX Audiobook & Podcast Compliance</h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Verifies audio against Audible ACX, Spotify, and Apple Podcasts standards.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-[#1a2130]'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        {isAnalyzing ? (
          <div className="flex items-center justify-center gap-3 py-10 text-cyan-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Analyzing audio mix levels...</span>
          </div>
        ) : report ? (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-lg border flex items-center justify-between ${
                report.acxPass
                  ? isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : isLight
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {report.acxPass ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {report.acxPass
                      ? 'ACX Audiobook & Podcast Compliant!'
                      : 'Audiobook Adjustments Needed'}
                  </div>
                  <div className="text-xs opacity-85 mt-0.5">
                    {report.acxPass
                      ? 'Meets Audible ACX RMS, True Peak, and Noise Floor thresholds.'
                      : `${report.issues.length} standard requirement(s) out of spec.`}
                  </div>
                </div>
              </div>

              {!report.acxPass && (
                <button
                  onClick={handleAutoFixAcx}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-semibold shadow transition-colors shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Auto-Master for ACX</span>
                </button>
              )}
            </div>

            {/* Metrics Breakdown */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              {/* RMS */}
              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e15] border-[#1b2233]'
                }`}
              >
                <div className={isLight ? 'text-slate-500 mb-1' : 'text-slate-400 mb-1'}>RMS Loudness</div>
                <div className={`font-mono-code text-lg font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                  {report.rmsDb.toFixed(1)} dBFS
                </div>
                <div className={`text-[10px] mt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Target: -23 to -18 dBFS</div>
                <div className="mt-2 text-[11px] font-semibold">
                  {report.rmsDb >= -23 && report.rmsDb <= -18 ? (
                    <span className="text-emerald-500 font-bold">PASS</span>
                  ) : (
                    <span className="text-amber-500 font-bold">OUT OF SPEC</span>
                  )}
                </div>
              </div>

              {/* Peak */}
              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e15] border-[#1b2233]'
                }`}
              >
                <div className={isLight ? 'text-slate-500 mb-1' : 'text-slate-400 mb-1'}>Peak Amplitude</div>
                <div className={`font-mono-code text-lg font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                  {report.peakDb.toFixed(1)} dBFS
                </div>
                <div className={`text-[10px] mt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Target: ≤ -3.0 dBFS</div>
                <div className="mt-2 text-[11px] font-semibold">
                  {report.peakDb <= -3.0 ? (
                    <span className="text-emerald-500 font-bold">PASS</span>
                  ) : (
                    <span className="text-rose-500 font-bold">FAIL (PEAK)</span>
                  )}
                </div>
              </div>

              {/* Noise floor */}
              <div
                className={`p-3 rounded-lg border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e15] border-[#1b2233]'
                }`}
              >
                <div className={isLight ? 'text-slate-500 mb-1' : 'text-slate-400 mb-1'}>Noise Floor</div>
                <div className={`font-mono-code text-lg font-bold ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                  {report.noiseFloorDb.toFixed(1)} dBFS
                </div>
                <div className={`text-[10px] mt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Target: ≤ -60.0 dBFS</div>
                <div className="mt-2 text-[11px] font-semibold">
                  {report.noiseFloorDb <= -60.0 ? (
                    <span className="text-emerald-500 font-bold">PASS</span>
                  ) : (
                    <span className="text-amber-500 font-bold">NEEDS GATE</span>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations List */}
            {report.recommendations.length > 0 && (
              <div
                className={`p-3 rounded-lg border space-y-1.5 text-xs ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e15] border-[#1b2233]'
                }`}
              >
                <div className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Engineering Recommendations:</div>
                {report.recommendations.map((rec, i) => (
                  <div key={i} className={`flex items-start gap-2 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span className="text-cyan-600">•</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className={`flex items-center justify-between pt-3 border-t text-xs ${isLight ? 'border-slate-200' : 'border-[#222a3d]'}`}>
          <button
            onClick={runAnalysis}
            className={`flex items-center gap-1.5 ${isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-scan Master Mix</span>
          </button>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded font-medium transition-colors ${
              isLight
                ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                : 'bg-[#1e2638] hover:bg-[#28324a] text-slate-200'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
