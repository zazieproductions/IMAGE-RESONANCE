import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeImage, type ImageAnalysis } from "./lib/analysis";
import { DEFAULT_PARAMS, ResonanceEngine, type EngineParams, type SynthMode } from "./lib/audioEngine";
import Spectrograph from "./components/Spectrograph";
import ScanCanvas from "./components/ScanCanvas";
import AnalysisReadout from "./components/AnalysisReadout";
import { Slider, SegButton } from "./components/Controls";
import { Frame, Field, TermButton } from "./components/ui";
import { Oscilloscope, Vectorscope, RadialSpectrum, BarSpectrum } from "./components/Visualizers";
import Landing from "./components/Landing";

type StereoAnalysers = { left: AnalyserNode; right: AnalyserNode };

type Phase = "landing" | "loading" | "instrument";

interface Recording {
  url: string;
  blob: Blob;
  name: string;
  ext: string;
  seconds: number;
}

const LOAD_STEPS = [
  "reading pixel buffer 320×N",
  "computing luminance field",
  "clustering chroma [12 bins]",
  "measuring contrast · entropy",
  "running sobel edge pass",
  "deriving harmonic seed",
  "mapping column energy [96]",
  "arming transducer",
];

export default function App() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [fileName, setFileName] = useState<string>("untitled");
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);
  const [params, setParams] = useState<EngineParams>({ ...DEFAULT_PARAMS });
  const [playing, setPlaying] = useState(false);
  const [scanPos, setScanPos] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [lastRecording, setLastRecording] = useState<Recording | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [stereo, setStereo] = useState<StereoAnalysers | null>(null);
  const [loadStep, setLoadStep] = useState(0);

  const engineRef = useRef<ResonanceEngine | null>(null);
  const recTimerRef = useRef<number>(0);
  const recStartRef = useRef<number>(0);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      const e = new ResonanceEngine();
      e.onScan = (p) => setScanPos(p);
      engineRef.current = e;
      setAnalyser(e.getAnalyser());
      setStereo(e.getStereoAnalysers());
    }
    return engineRef.current;
  }, []);

  const handleImage = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setFileName(file.name.replace(/\.[^.]+$/, "") || "untitled");
      setPhase("loading");
      setLoadStep(0);
      const stepId = window.setInterval(() => {
        setLoadStep((s) => Math.min(LOAD_STEPS.length - 1, s + 1));
      }, 140);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setTimeout(() => {
          window.clearInterval(stepId);
          const result = analyzeImage(img, 96);
          setAnalysis(result);
          setImageUrl(url);
          const e = ensureEngine();
          e.setAnalysis(result);
          const synthMode: SynthMode =
            result.entropy > 0.8
              ? "fm"
              : result.colorfulness > 0.55
              ? "bell"
              : result.saturation > 0.45 && result.warmth > 0
              ? "vocal"
              : "harmonic";
          const seeded: Partial<EngineParams> = {
            filterCutoff: 0.35 + result.avgBrightness * 0.5,
            reverb: 0.4 + (1 - result.complexity) * 0.4,
            drive: 0.1 + result.contrast * 0.4,
            chaos: 0.1 + result.entropy * 0.6,
            detune: 0.2 + result.colorfulness * 0.5,
            shimmer: 0.15 + result.colorfulness * 0.55,
            subLevel: 0.3 + (1 - result.avgBrightness) * 0.5,
            fmAmount: 0.2 + result.entropy * 0.5,
            lfoDepth: 0.15 + result.complexity * 0.4,
            stereoWidth: 0.5 + result.colorfulness * 0.5,
            synthMode,
            waveform: result.warmth > 0.2 ? "sawtooth" : result.saturation < 0.2 ? "sine" : "square",
          };
          e.setParams(seeded);
          setParams({ ...e.params });
          setPhase("instrument");
        }, 1150);
      };
      img.onerror = () => {
        window.clearInterval(stepId);
        setPhase("landing");
      };
      img.src = url;
    },
    [ensureEngine]
  );

  const togglePlay = useCallback(async () => {
    const e = ensureEngine();
    if (playing) {
      e.stop();
      setPlaying(false);
    } else {
      if (analysis) e.setAnalysis(analysis);
      e.build();
      await e.start();
      setPlaying(true);
    }
  }, [playing, analysis, ensureEngine]);

  const updateParam = useCallback(<K extends keyof EngineParams>(key: K, value: EngineParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    engineRef.current?.setParam(key, value);
  }, []);

  const randomize = useCallback(() => {
    const r = (min: number, max: number) => min + Math.random() * (max - min);
    const waves: OscillatorType[] = ["sine", "triangle", "sawtooth", "square"];
    const modes: SynthMode[] = ["harmonic", "fm", "bell", "vocal"];
    const next: EngineParams = {
      ...params,
      subLevel: r(0.2, 0.7),
      droneLevel: r(0.3, 0.8),
      voiceLevel: r(0.3, 0.7),
      textureLevel: r(0.1, 0.6),
      rhythmLevel: r(0, 0.6),
      shimmer: r(0, 0.7),
      scanRate: r(0.04, 0.4),
      filterCutoff: r(0.3, 0.9),
      resonance: r(0.05, 0.6),
      reverb: r(0.3, 0.8),
      delayFeedback: r(0.1, 0.6),
      drive: r(0.05, 0.5),
      detune: r(0.1, 0.8),
      density: r(0.2, 0.9),
      chaos: r(0.1, 0.7),
      fmAmount: r(0.1, 0.8),
      lfoRate: r(0.02, 0.5),
      lfoDepth: r(0, 0.6),
      stereoWidth: r(0.4, 1),
      waveform: waves[Math.floor(Math.random() * waves.length)],
      synthMode: modes[Math.floor(Math.random() * modes.length)],
      scanMode: (["linear", "pingpong", "random", "spiral"] as const)[Math.floor(Math.random() * 4)],
    };
    setParams(next);
    engineRef.current?.setParams(next);
  }, [params]);

  const resetParams = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
    engineRef.current?.setParams({ ...DEFAULT_PARAMS });
  }, []);

  const toggleRecord = useCallback(async () => {
    const e = ensureEngine();
    if (recording) {
      const blob = await e.stopRecording();
      window.clearInterval(recTimerRef.current);
      setRecording(false);
      if (blob) {
        const type = blob.type || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const url = URL.createObjectURL(blob);
        const seconds = (performance.now() - recStartRef.current) / 1000;
        setLastRecording({ url, blob, name: fileName, ext, seconds });
      }
    } else {
      if (!playing) {
        if (analysis) e.setAnalysis(analysis);
        e.build();
        await e.start();
        setPlaying(true);
      }
      const ok = e.startRecording();
      if (ok) {
        setRecording(true);
        recStartRef.current = performance.now();
        setRecElapsed(0);
        recTimerRef.current = window.setInterval(() => {
          setRecElapsed((performance.now() - recStartRef.current) / 1000);
        }, 100);
      }
    }
  }, [recording, playing, analysis, fileName, ensureEngine]);

  const downloadRecording = useCallback(() => {
    if (!lastRecording) return;
    const a = document.createElement("a");
    a.href = lastRecording.url;
    a.download = `resonance_${lastRecording.name}.${lastRecording.ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [lastRecording]);

  const newImage = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
    setPhase("landing");
    setAnalysis(null);
    setImageUrl("");
    setLastRecording(null);
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      window.clearInterval(recTimerRef.current);
    };
  }, []);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (phase === "landing") return <Landing onImage={handleImage} />;

  if (phase === "loading") {
    return (
      <div className="crt grain flex min-h-screen items-center justify-center bg-void">
        <div className="w-full max-w-md px-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="font-arcane text-lg text-phos" style={{ animation: "spin-slow 3s linear infinite", display: "inline-block" }}>
              ◈
            </span>
            <div className="font-mono text-[12px] uppercase tracking-[0.28em] text-bone">transducing specimen</div>
          </div>
          <div className="border border-line bg-void-2/80 p-3 font-mono text-[10px] leading-relaxed">
            {LOAD_STEPS.slice(0, loadStep + 1).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-phos/85">
                <span>► {s}</span>
                <span className="text-phos-dim">{i < loadStep ? "ok" : "··"}</span>
              </div>
            ))}
            <span className="caret text-phos" />
          </div>
          <div className="mt-3 h-1 w-full bg-line">
            <div
              className="h-full bg-phos transition-all duration-150"
              style={{ width: `${((loadStep + 1) / LOAD_STEPS.length) * 100}%`, boxShadow: "0 0 8px rgba(126,224,168,0.6)" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="crt grain min-h-screen bg-void text-bone">
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 15% 0%, rgba(126,224,168,0.05), transparent 40%), radial-gradient(circle at 88% 100%, rgba(224,162,74,0.045), transparent 45%)",
        }}
      />

      {/* Top status bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-line bg-void-2/85 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-arcane text-sm text-phos text-phos-glow">◈</span>
          <div>
            <h1 className="font-mono text-[11px] font-bold tracking-[0.3em] text-bone">
              IMAGE<span className="text-phos">//</span>RESONANCE
            </h1>
            <div className="font-mono text-[8px] uppercase tracking-[0.28em] text-ash-dim">
              spectral analysis unit
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 border border-line bg-panel px-2.5 py-1 sm:flex">
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ash-dim">specimen</span>
            <span className="max-w-[160px] truncate font-mono text-[10px] text-phos">{fileName}</span>
          </div>
          <div className="flex items-center gap-1.5 border border-line bg-panel px-2.5 py-1">
            <span
              className="h-1.5 w-1.5"
              style={{
                background: playing ? "var(--color-phos)" : "var(--color-ash-dim)",
                animation: playing ? "blink 1s steps(1) infinite" : undefined,
              }}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ash">
              {playing ? "resonating" : "standby"}
            </span>
          </div>
          <TermButton onClick={newImage} accent="phos">
            ◎ new scan
          </TermButton>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1640px] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_388px]">
        {/* LEFT — visuals */}
        <div className="space-y-3">
          {/* Scan viewport */}
          <Frame
            id="OPT-01"
            title="Optical Scan Field"
            right={<span className="font-mono text-[9px] text-ash-dim">SCAN {(scanPos * 100).toFixed(1).padStart(5, "0")}%</span>}
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden border border-line bg-void-2">
              <ScanCanvas imageUrl={imageUrl} analysis={analysis} scanPos={scanPos} scanMode={params.scanMode} active={playing} />
            </div>
          </Frame>

          {/* Spectrograph waterfall */}
          <Frame
            id="FFT-02"
            title="Spectrograph Waterfall"
            right={<span className="font-mono text-[9px] text-ash-dim">2048 · log-freq · thermal</span>}
          >
            <div className="h-40 border border-line bg-void-2">
              <Spectrograph analyser={analyser} active={playing} />
            </div>
          </Frame>

          {/* Bar spectrum analyzer */}
          <Frame
            id="SPC-03"
            title="Spectrum Analyzer"
            right={<span className="font-mono text-[9px] text-ash-dim">48-band · peak-hold</span>}
          >
            <div className="h-28 border border-line bg-void-2">
              <BarSpectrum analyser={analyser} stereo={stereo} active={playing} />
            </div>
          </Frame>

          {/* Oscilloscope + Vectorscope + Radial mandala */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Frame id="OSC-04" title="Oscilloscope" right={<span className="font-mono text-[9px] text-ash-dim">time</span>}>
              <div className="h-32 border border-line bg-void-2">
                <Oscilloscope analyser={analyser} stereo={stereo} active={playing} />
              </div>
            </Frame>
            <Frame id="VEC-05" title="Vectorscope" right={<span className="font-mono text-[9px] text-ash-dim">L·R</span>}>
              <div className="h-32 border border-line bg-void-2">
                <Vectorscope analyser={analyser} stereo={stereo} active={playing} />
              </div>
            </Frame>
            <Frame id="RAD-06" title="Radial Field" right={<span className="font-arcane text-[10px] text-ash-dim">◎</span>}>
              <div className="h-32 border border-line bg-void-2">
                <RadialSpectrum analyser={analyser} stereo={stereo} active={playing} />
              </div>
            </Frame>
          </div>

          {/* Transport */}
          <Frame id="TRN-03" title="Transport & Capture">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={togglePlay}
                className={`flex h-11 items-center gap-2 border px-4 font-mono text-[11px] uppercase tracking-[0.2em] transition-all ${
                  playing
                    ? "border-phos bg-phos/12 text-phos shadow-[0_0_16px_rgba(126,224,168,0.28)]"
                    : "border-line-bright bg-panel-2 text-bone hover:border-phos hover:text-phos"
                }`}
              >
                <span className="font-arcane text-sm">{playing ? "◼" : "▶"}</span>
                {playing ? "halt" : "resonate"}
              </button>

              <div className="h-8 w-px bg-line" />

              <TermButton onClick={toggleRecord} active={recording} accent="blood" className="h-9">
                <span className="font-arcane text-xs">{recording ? "◼" : "●"}</span>
                {recording ? `rec ${fmtTime(recElapsed)}` : "record"}
              </TermButton>

              {lastRecording && (
                <TermButton onClick={downloadRecording} accent="amber" className="h-9">
                  ↓ export .{lastRecording.ext} · {fmtTime(lastRecording.seconds)}
                </TermButton>
              )}

              <div className="ml-auto flex items-center gap-2">
                <TermButton onClick={randomize} accent="bruise" className="h-9">
                  ✳ perturb
                </TermButton>
                <TermButton onClick={resetParams} accent="ice" className="h-9">
                  ↺ reset
                </TermButton>
              </div>
            </div>

            {lastRecording && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ash-dim">
                  └─ artifact · resonance_{lastRecording.name}.{lastRecording.ext}
                </div>
                <audio src={lastRecording.url} controls className="w-full" />
              </div>
            )}
          </Frame>
        </div>

        {/* RIGHT — controls */}
        <div className="space-y-3">
          {analysis && (
            <Frame id="ANL-04" title="Spectral Analysis" right={<span className="font-arcane text-[10px] text-ash-dim">≈</span>}>
              <AnalysisReadout a={analysis} />
            </Frame>
          )}

          <Frame id="MIX-05" title="Layer Mixer">
            <div className="space-y-3">
              <Slider label="master out" value={params.masterGain} onChange={(v) => updateParam("masterGain", v)} accent="phos" />
              <Slider label="drone bed" value={params.droneLevel} onChange={(v) => updateParam("droneLevel", v)} accent="phos" />
              <Slider label="spectral voices" value={params.voiceLevel} onChange={(v) => updateParam("voiceLevel", v)} accent="blood" />
              <Slider label="granular texture" value={params.textureLevel} onChange={(v) => updateParam("textureLevel", v)} accent="amber" />
              <Slider label="rhythm engine" value={params.rhythmLevel} onChange={(v) => updateParam("rhythmLevel", v)} accent="ice" />
            </div>
          </Frame>

          <Frame id="SCN-06" title="Scan Head">
            <div className="space-y-3">
              <SegButton
                label="traversal"
                value={params.scanMode}
                onChange={(v) => updateParam("scanMode", v)}
                options={[
                  { value: "linear", label: "sweep" },
                  { value: "pingpong", label: "ping" },
                  { value: "random", label: "drift" },
                  { value: "spiral", label: "spiral" },
                ]}
              />
              <Slider
                label="scan rate"
                value={params.scanRate}
                min={0.02}
                max={0.8}
                onChange={(v) => updateParam("scanRate", v)}
                accent="phos"
                format={(v) => `${(v * 60).toFixed(1)}/m`}
              />
              <Slider label="voice density" value={params.density} onChange={(v) => updateParam("density", v)} accent="blood" />
            </div>
          </Frame>

          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex w-full items-center justify-between border border-line bg-panel/70 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ash transition-colors hover:border-line-bright hover:text-bone"
          >
            <span>▚ advanced synthesis</span>
            <span className="font-arcane">{showAdvanced ? "−" : "+"}</span>
          </button>

          {showAdvanced && (
            <>
              <Frame id="OSC-07" title="Oscillator & Timbre">
                <div className="space-y-3">
                  <SegButton
                    label="waveform"
                    value={params.waveform as string}
                    onChange={(v) => updateParam("waveform", v as OscillatorType)}
                    options={[
                      { value: "sine", label: "sin" },
                      { value: "triangle", label: "tri" },
                      { value: "sawtooth", label: "saw" },
                      { value: "square", label: "sqr" },
                    ]}
                  />
                  <Slider
                    label="octave shift"
                    value={params.octaveShift}
                    min={-2}
                    max={2}
                    step={1}
                    onChange={(v) => updateParam("octaveShift", v)}
                    accent="amber"
                    format={(v) => (v > 0 ? `+${v}` : `${v}`)}
                  />
                  <Slider label="detune spread" value={params.detune} onChange={(v) => updateParam("detune", v)} accent="ice" />
                  <Slider label="drive / fold" value={params.drive} onChange={(v) => updateParam("drive", v)} accent="blood" />
                  <Slider label="chaos modulation" value={params.chaos} onChange={(v) => updateParam("chaos", v)} accent="blood" />
                </div>
              </Frame>

              <Frame id="FLT-08" title="Filter & Space">
                <div className="space-y-3">
                  <Slider label="filter cutoff" value={params.filterCutoff} onChange={(v) => updateParam("filterCutoff", v)} accent="phos" />
                  <Slider label="resonance q" value={params.resonance} onChange={(v) => updateParam("resonance", v)} accent="amber" />
                  <Slider label="reverb wet" value={params.reverb} onChange={(v) => updateParam("reverb", v)} accent="phos" />
                  <Slider label="delay feedback" value={params.delayFeedback} onChange={(v) => updateParam("delayFeedback", v)} accent="ice" />
                </div>
              </Frame>
            </>
          )}

          <Frame id="SIG-09" title="Signal Path">
            <div className="space-y-1">
              <Field k="chain" v="bus→fold→lpf→verb→dly→lim" accent="phos" />
              <Field k="capture" v="master tap · 256kbps" accent="amber" />
              <Field k="privacy" v="local only · no upload" accent="ice" />
            </div>
          </Frame>
        </div>
      </main>

      <footer className="relative z-10 border-t border-line px-4 py-3 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ash-dim">
          image//resonance — a speculative transducer · all synthesis executes locally in-browser
        </p>
      </footer>
    </div>
  );
}
