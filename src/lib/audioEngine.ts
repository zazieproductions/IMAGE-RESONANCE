// IMAGE//RESONANCE — generative audio engine
// A layered Web Audio instrument driven by ImageAnalysis:
//   - Sub-bass layer (deep sine/triangle foundation from image darkness)
//   - Drone bank (stacked detuned oscillators following the row-contour)
//   - Spectral voice bank (per-column carriers with optional FM/bell/vocal timbre)
//   - Texture layer (filtered noise + shimmer grains shaped by entropy/complexity)
//   - Rhythm engine (kick / tom / hat / rim / glitch triggered by column data)
//   - LFO modulating the master filter for movement
//   - Master chain: waveshaper drive -> filter -> convolution reverb -> delay -> limiter
//   - Recording via MediaStreamDestination + MediaRecorder
//   - Stereo analysers for oscilloscope, vectorscope, spectrum & waterfall

import type { ImageAnalysis } from "./analysis";

export type SynthMode = "harmonic" | "fm" | "bell" | "vocal";

export interface EngineParams {
  masterGain: number; // 0..1
  subLevel: number; // 0..1 sub-bass foundation
  droneLevel: number; // 0..1
  voiceLevel: number; // 0..1
  textureLevel: number; // 0..1
  rhythmLevel: number; // 0..1
  shimmer: number; // 0..1 glittering grain layer
  scanRate: number; // sweeps per second
  filterCutoff: number; // 0..1
  resonance: number; // 0..1
  reverb: number; // 0..1 wet
  delayFeedback: number; // 0..1
  drive: number; // 0..1 waveshaper amount
  detune: number; // 0..1 chorus/detune spread
  density: number; // 0..1 voice density
  chaos: number; // 0..1 random modulation depth
  fmAmount: number; // 0..1 FM / bell modulation index
  lfoRate: number; // 0..1 -> 0.02..8 Hz
  lfoDepth: number; // 0..1 filter sweep depth
  stereoWidth: number; // 0..1
  octaveShift: number; // -2..2
  waveform: OscillatorType;
  synthMode: SynthMode;
  scanMode: "linear" | "pingpong" | "random" | "spiral";
}

export const DEFAULT_PARAMS: EngineParams = {
  masterGain: 0.7,
  subLevel: 0.45,
  droneLevel: 0.55,
  voiceLevel: 0.55,
  textureLevel: 0.35,
  rhythmLevel: 0.4,
  shimmer: 0.3,
  scanRate: 0.12,
  filterCutoff: 0.6,
  resonance: 0.25,
  reverb: 0.55,
  delayFeedback: 0.35,
  drive: 0.2,
  detune: 0.4,
  density: 0.5,
  chaos: 0.25,
  fmAmount: 0.3,
  lfoRate: 0.18,
  lfoDepth: 0.3,
  stereoWidth: 0.7,
  octaveShift: 0,
  waveform: "sawtooth",
  synthMode: "harmonic",
  scanMode: "pingpong",
};

function makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return impulse;
}

function makeDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = amount * 100;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

interface DroneVoice {
  osc: OscillatorNode;
  gain: GainNode;
  baseHz: number;
}

interface SpectralVoice {
  osc: OscillatorNode; // carrier
  mod: OscillatorNode; // FM modulator
  modGain: GainNode; // modulation index -> carrier freq
  gain: GainNode;
  pan: StereoPannerNode;
}

// Vowel formant frequency triples for the vocal synth mode.
const FORMANTS: [number, number, number][] = [
  [730, 1090, 2440], // 'a'
  [270, 2290, 3010], // 'i'
  [300, 870, 2240], // 'u'
  [530, 1840, 2480], // 'e'
  [570, 840, 2410], // 'o'
];

export class ResonanceEngine {
  ctx: AudioContext;
  analysis: ImageAnalysis | null = null;
  params: EngineParams = { ...DEFAULT_PARAMS };
  playing = false;

  // Master chain
  private master: GainNode;
  private preGain: GainNode;
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private reverbWet: GainNode;
  private reverbDry: GainNode;
  private convolver: ConvolverNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delayWet: GainNode;
  private limiter: DynamicsCompressorNode;
  private analyser: AnalyserNode;
  private analyserL: AnalyserNode;
  private analyserR: AnalyserNode;
  private splitter: ChannelSplitterNode;
  private streamDest: MediaStreamAudioDestinationNode;

  // Layer buses
  private subBus: GainNode;
  private droneBus: GainNode;
  private voiceBus: GainNode;
  private textureBus: GainNode;
  private rhythmBus: GainNode;

  // Vocal formant path (parallel to dry voice bus)
  private voiceDry: GainNode;
  private voiceWet: GainNode;
  private formants: BiquadFilterNode[] = [];

  // LFO
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  private subVoices: DroneVoice[] = [];
  private droneVoices: DroneVoice[] = [];
  private spectralVoices: SpectralVoice[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;

  // Scan + scheduling
  private scanPos = 0;
  private scanDir = 1;
  private rafId = 0;
  private lastTime = 0;
  private beatTimer = 0;
  private shimmerTimer = 0;
  private spiralAngle = 0;

  // Recording
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];

  onScan: ((pos: number) => void) | null = null;

  constructor() {
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const c = this.ctx;

    this.master = c.createGain();
    this.preGain = c.createGain();
    this.shaper = c.createWaveShaper();
    this.filter = c.createBiquadFilter();
    this.convolver = c.createConvolver();
    this.reverbWet = c.createGain();
    this.reverbDry = c.createGain();
    this.delay = c.createDelay(2.0);
    this.delayFb = c.createGain();
    this.delayWet = c.createGain();
    this.limiter = c.createDynamicsCompressor();
    this.analyser = c.createAnalyser();
    this.analyserL = c.createAnalyser();
    this.analyserR = c.createAnalyser();
    this.splitter = c.createChannelSplitter(2);
    this.streamDest = c.createMediaStreamDestination();

    this.subBus = c.createGain();
    this.droneBus = c.createGain();
    this.voiceBus = c.createGain();
    this.textureBus = c.createGain();
    this.rhythmBus = c.createGain();
    this.voiceDry = c.createGain();
    this.voiceWet = c.createGain();

    this.filter.type = "lowpass";
    this.filter.frequency.value = 2400;
    this.filter.Q.value = 3;

    this.shaper.curve = makeDriveCurve(this.params.drive);
    this.shaper.oversample = "4x";

    this.convolver.buffer = makeImpulseResponse(c, 3.4, 2.6);

    this.delay.delayTime.value = 0.42;
    this.delayFb.gain.value = 0.35;

    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;

    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.72;
    this.analyserL.fftSize = 1024;
    this.analyserR.fftSize = 1024;
    this.analyserL.smoothingTimeConstant = 0;
    this.analyserR.smoothingTimeConstant = 0;

    // Vocal formant bank: three parallel bandpass filters
    for (let i = 0; i < 3; i++) {
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = FORMANTS[0][i];
      f.Q.value = 8;
      this.formants.push(f);
    }

    // Voice routing: voiceBus splits to dry + formant-wet, both -> preGain
    this.voiceBus.connect(this.voiceDry);
    this.voiceDry.connect(this.preGain);
    this.formants.forEach((f) => {
      this.voiceBus.connect(f);
      f.connect(this.voiceWet);
    });
    this.voiceWet.connect(this.preGain);

    // Other buses -> preGain
    this.subBus.connect(this.preGain);
    this.droneBus.connect(this.preGain);
    this.textureBus.connect(this.preGain);
    this.rhythmBus.connect(this.preGain);

    // preGain -> shaper -> filter -> [dry + reverb + delay] -> limiter -> master
    this.preGain.connect(this.shaper);
    this.shaper.connect(this.filter);

    this.filter.connect(this.reverbDry);
    this.reverbDry.connect(this.limiter);

    this.filter.connect(this.convolver);
    this.convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.limiter);

    this.filter.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.limiter);

    this.limiter.connect(this.master);
    this.master.connect(this.analyser);
    this.master.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    this.analyser.connect(c.destination);
    this.analyser.connect(this.streamDest);

    this.applyParams();
  }

  getAnalyser() {
    return this.analyser;
  }
  getStereoAnalysers() {
    return { left: this.analyserL, right: this.analyserR };
  }

  setAnalysis(a: ImageAnalysis) {
    this.analysis = a;
  }

  private noteHz(index: number): number {
    const a = this.analysis!;
    const scale = a.scale;
    const deg = ((index % scale.length) + scale.length) % scale.length;
    const oct = Math.floor(index / scale.length);
    const semis = scale[deg] + oct * 12 + this.params.octaveShift * 12;
    return a.rootHz * Math.pow(2, semis / 12);
  }

  build() {
    this.teardownVoices();
    if (!this.analysis) return;
    const a = this.analysis;
    const c = this.ctx;
    const now = c.currentTime;

    // SUB-BASS: 2 deep voices an octave/two below root, louder when image is dark
    const subIntervals = [-24, -17];
    this.subVoices = subIntervals.map((interval, i) => {
      const osc = c.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      const baseHz = a.rootHz * Math.pow(2, interval / 12) * Math.pow(2, this.params.octaveShift);
      osc.frequency.value = baseHz;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.subBus);
      osc.start(now);
      return { osc, gain, baseHz };
    });

    // DRONE BANK: 5 stacked voices following brightness contour of rows
    const droneIntervals = [0, 7, 12, 19, 24];
    this.droneVoices = droneIntervals.map((interval, i) => {
      const osc = c.createOscillator();
      osc.type = i < 2 ? "sine" : this.params.waveform === "sine" ? "triangle" : this.params.waveform;
      const baseHz = a.rootHz * Math.pow(2, (interval - 12) / 12) * Math.pow(2, this.params.octaveShift);
      osc.frequency.value = baseHz;
      osc.detune.value = (i - 2) * 4 * this.params.detune * 6;
      const gain = c.createGain();
      gain.gain.value = 0;
      const pan = c.createStereoPanner();
      pan.pan.value = ((i - 2) / 3) * this.params.stereoWidth;
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.droneBus);
      osc.start(now);
      return { osc, gain, baseHz };
    });

    // SPECTRAL VOICE BANK: carriers with FM modulators
    const poolSize = 16;
    this.spectralVoices = [];
    for (let i = 0; i < poolSize; i++) {
      const osc = c.createOscillator();
      osc.type = this.params.waveform;
      osc.frequency.value = 220;
      const mod = c.createOscillator();
      mod.type = "sine";
      mod.frequency.value = 220;
      const modGain = c.createGain();
      modGain.gain.value = 0;
      mod.connect(modGain);
      modGain.connect(osc.frequency);
      const gain = c.createGain();
      gain.gain.value = 0;
      const pan = c.createStereoPanner();
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.voiceBus);
      osc.start(now);
      mod.start(now);
      this.spectralVoices.push({ osc, mod, modGain, gain, pan });
    }

    // TEXTURE: pink-ish noise through bandpass following entropy
    const noiseLen = c.sampleRate * 2;
    const nb = c.createBuffer(1, noiseLen, c.sampleRate);
    const nd = nb.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < noiseLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099;
      b1 = 0.963 * b1 + white * 0.2965;
      b2 = 0.57 * b2 + white * 1.0526;
      nd[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
    }
    this.noiseSrc = c.createBufferSource();
    this.noiseSrc.buffer = nb;
    this.noiseSrc.loop = true;
    this.noiseFilter = c.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 800 + a.contrast * 3000;
    this.noiseFilter.Q.value = 0.6 + a.entropy * 4;
    this.noiseGain = c.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.textureBus);
    this.noiseSrc.start(now);

    // LFO -> filter cutoff modulation
    this.lfo = c.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.02 + this.params.lfoRate * 8;
    this.lfoGain = c.createGain();
    this.lfoGain.gain.value = this.params.lfoDepth * 1800;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start(now);

    this.applyParams();
  }

  private teardownVoices() {
    const stop = (o?: OscillatorNode | AudioBufferSourceNode | null) => {
      if (!o) return;
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.subVoices.forEach((v) => {
      stop(v.osc);
      v.gain.disconnect();
    });
    this.droneVoices.forEach((v) => {
      stop(v.osc);
      v.gain.disconnect();
    });
    this.spectralVoices.forEach((v) => {
      stop(v.osc);
      stop(v.mod);
      v.gain.disconnect();
      v.modGain.disconnect();
    });
    stop(this.noiseSrc);
    stop(this.lfo);
    this.lfoGain?.disconnect();
    this.lfo = null;
    this.lfoGain = null;
    this.subVoices = [];
    this.droneVoices = [];
    this.spectralVoices = [];
    this.noiseSrc = null;
  }

  applyParams() {
    const p = this.params;
    const c = this.ctx;
    const t = c.currentTime;
    const smooth = (param: AudioParam, val: number) => param.setTargetAtTime(val, t, 0.05);

    smooth(this.master.gain, p.masterGain);
    smooth(this.subBus.gain, p.subLevel * 0.85);
    smooth(this.droneBus.gain, p.droneLevel * 0.9);
    smooth(this.voiceBus.gain, p.voiceLevel * 0.7);
    smooth(this.textureBus.gain, p.textureLevel * 0.8);
    smooth(this.rhythmBus.gain, p.rhythmLevel * 0.9);

    // Vocal formant wet/dry
    const vocal = p.synthMode === "vocal";
    smooth(this.voiceWet.gain, vocal ? 1.1 : 0);
    smooth(this.voiceDry.gain, vocal ? 0.25 : 1);

    const minF = 120;
    const maxF = 12000;
    const cutoff = minF * Math.pow(maxF / minF, p.filterCutoff);
    smooth(this.filter.frequency, cutoff);
    smooth(this.filter.Q, 0.4 + p.resonance * 22);

    smooth(this.reverbWet.gain, p.reverb);
    smooth(this.reverbDry.gain, 1 - p.reverb * 0.5);
    smooth(this.delayFb.gain, p.delayFeedback * 0.85);
    smooth(this.delayWet.gain, p.delayFeedback * 0.5);

    if (this.lfo) this.lfo.frequency.setTargetAtTime(0.02 + p.lfoRate * 8, t, 0.1);
    if (this.lfoGain) this.lfoGain.gain.setTargetAtTime(p.lfoDepth * 1800, t, 0.1);

    this.shaper.curve = makeDriveCurve(p.drive);
  }

  setParam<K extends keyof EngineParams>(key: K, value: EngineParams[K]) {
    this.params[key] = value;
    if (key === "waveform") {
      this.droneVoices.forEach((v, i) => {
        v.osc.type = i < 2 ? "sine" : (value as OscillatorType);
      });
      this.spectralVoices.forEach((v) => (v.osc.type = value as OscillatorType));
    }
    this.applyParams();
  }

  setParams(next: Partial<EngineParams>) {
    Object.assign(this.params, next);
    this.applyParams();
  }

  async start() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.playing) return;
    if (this.droneVoices.length === 0) this.build();
    this.playing = true;
    this.lastTime = performance.now();
    this.beatTimer = 0;
    this.shimmerTimer = 0;
    this.loop();
  }

  stop() {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const t = this.ctx.currentTime;
    this.subVoices.forEach((v) => v.gain.gain.setTargetAtTime(0, t, 0.2));
    this.droneVoices.forEach((v) => v.gain.gain.setTargetAtTime(0, t, 0.15));
    this.spectralVoices.forEach((v) => v.gain.gain.setTargetAtTime(0, t, 0.1));
    if (this.noiseGain) this.noiseGain.gain.setTargetAtTime(0, t, 0.15);
  }

  private loop = () => {
    if (!this.playing || !this.analysis) return;
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - this.lastTime) / 1000);
    this.lastTime = nowMs;
    const a = this.analysis;
    const p = this.params;
    const t = this.ctx.currentTime;

    // Advance scan position
    const advance = p.scanRate * dt;
    switch (p.scanMode) {
      case "linear":
        this.scanPos = (this.scanPos + advance) % 1;
        break;
      case "pingpong":
        this.scanPos += advance * this.scanDir;
        if (this.scanPos >= 1) {
          this.scanPos = 1;
          this.scanDir = -1;
        } else if (this.scanPos <= 0) {
          this.scanPos = 0;
          this.scanDir = 1;
        }
        break;
      case "random":
        this.scanPos += advance * this.scanDir;
        if (this.scanPos >= 1 || this.scanPos <= 0) {
          this.scanDir *= -1;
          this.scanPos = Math.max(0, Math.min(1, this.scanPos));
          if (Math.random() < 0.4) this.scanPos = Math.random();
        }
        break;
      case "spiral":
        this.spiralAngle += advance * Math.PI * 2;
        this.scanPos = Math.sin(this.spiralAngle) * 0.5 + 0.5;
        break;
    }
    if (this.onScan) this.onScan(this.scanPos);

    // SUB-BASS: louder in dark images, gentle wobble
    this.subVoices.forEach((v, i) => {
      const target = (0.4 + (1 - a.avgBrightness) * 0.6) * (1 - i * 0.3) * 0.6;
      v.gain.gain.setTargetAtTime(target, t, 0.3);
    });

    // DRONE contour
    const rowIdx = Math.floor(this.scanPos * (a.rows.length - 1));
    const rowBright = a.rows[rowIdx] ?? a.avgBrightness;
    this.droneVoices.forEach((v, i) => {
      const target = (0.5 + rowBright * 0.5) * (1 - i * 0.13) * 0.55;
      v.gain.gain.setTargetAtTime(target, t, 0.2);
      const chaosGlide = 1 + (Math.random() - 0.5) * p.chaos * 0.02;
      const bendCents = (rowBright - 0.5) * 30 * p.chaos;
      v.osc.detune.setTargetAtTime((i - 2) * 4 * p.detune * 6 + bendCents, t, 0.3);
      v.osc.frequency.setTargetAtTime(v.baseHz * chaosGlide, t, 0.4);
    });

    // SPECTRAL SCAN
    const cols = a.columns;
    const scanIdx = this.scanPos * (cols.length - 1);
    const windowSize = Math.round(3 + p.density * 12);
    const activeVoices = Math.min(this.spectralVoices.length, windowSize);
    const bell = p.synthMode === "bell";
    const fm = p.synthMode === "fm" || bell;
    for (let vi = 0; vi < this.spectralVoices.length; vi++) {
      const v = this.spectralVoices[vi];
      if (vi < activeVoices) {
        const spread = (vi - activeVoices / 2) * 1.6;
        const ci = Math.max(0, Math.min(cols.length - 1, Math.round(scanIdx + spread)));
        const col = cols[ci];
        const degree = Math.round(col.brightness * 10 + col.hue * 7 + vi);
        const hz = this.noteHz(degree);
        const chaosCents = (Math.random() - 0.5) * p.chaos * 40;
        v.osc.frequency.setTargetAtTime(hz, t, 0.06);
        v.osc.detune.setTargetAtTime(chaosCents + (vi - activeVoices / 2) * p.detune * 8, t, 0.1);
        // FM: modulator ratio from hue, index from fmAmount + column energy
        if (fm) {
          const ratio = bell ? 1.41 + col.hue * 2.3 : 1 + Math.round(col.hue * 3);
          v.mod.frequency.setTargetAtTime(hz * ratio, t, 0.06);
          const index = (bell ? 1 : 1) * (p.fmAmount * (bell ? 900 : 500) * (0.4 + col.energy));
          v.modGain.gain.setTargetAtTime(index, t, 0.05);
        } else {
          v.modGain.gain.setTargetAtTime(0, t, 0.05);
        }
        const amp = (col.energy * 0.6 + col.saturation * 0.4) * (0.9 - vi * 0.04) * 0.5;
        v.gain.gain.setTargetAtTime(Math.max(0, amp), t, bell ? 0.03 : 0.08);
        v.pan.pan.setTargetAtTime(((ci / cols.length) * 2 - 1) * p.stereoWidth, t, 0.15);
      } else {
        v.gain.gain.setTargetAtTime(0, t, 0.12);
      }
    }

    // Vocal formant tracking: pick vowel from dominant hue, glide formants
    if (p.synthMode === "vocal") {
      const vowel = FORMANTS[Math.floor(this.scanPos * FORMANTS.length) % FORMANTS.length];
      this.formants.forEach((f, i) => {
        const drift = 1 + (Math.random() - 0.5) * p.chaos * 0.08;
        f.frequency.setTargetAtTime(vowel[i] * drift, t, 0.12);
      });
    }

    // TEXTURE
    if (this.noiseFilter && this.noiseGain) {
      const col = cols[Math.round(scanIdx)] ?? cols[0];
      const nf = 400 + col.energy * 5000 + a.entropy * 2000;
      this.noiseFilter.frequency.setTargetAtTime(nf, t, 0.1);
      this.noiseGain.gain.setTargetAtTime((0.2 + col.energy * 0.6) * 0.55, t, 0.15);
    }

    // SHIMMER grains: sparse high glittering sines, denser with shimmer + colorfulness
    this.shimmerTimer += dt;
    const shimmerInterval = 0.6 - p.shimmer * 0.5;
    if (p.shimmer > 0.02 && this.shimmerTimer >= shimmerInterval) {
      this.shimmerTimer = 0;
      if (Math.random() < 0.3 + p.shimmer * 0.6) this.triggerShimmer();
    }

    // RHYTHM
    const beatDur = 60 / a.tempo;
    this.beatTimer += dt;
    if (this.beatTimer >= beatDur / (1 + Math.floor(p.density * 3))) {
      this.beatTimer = 0;
      this.triggerPulse();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private triggerShimmer() {
    if (!this.analysis) return;
    const a = this.analysis;
    const c = this.ctx;
    const t = c.currentTime;
    const degree = 14 + Math.floor(Math.random() * 10);
    const hz = this.noteHz(degree) * 2;
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz * (1 + (Math.random() - 0.5) * 0.01);
    const g = c.createGain();
    const pan = c.createStereoPanner();
    pan.pan.value = (Math.random() * 2 - 1) * this.params.stereoWidth;
    const peak = 0.12 + a.colorfulness * 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4 + Math.random() * 0.5);
    osc.connect(g);
    g.connect(pan);
    pan.connect(this.textureBus);
    osc.start(t);
    osc.stop(t + 1.1);
  }

  private triggerPulse() {
    if (!this.analysis || this.params.rhythmLevel <= 0.001) return;
    const a = this.analysis;
    const c = this.ctx;
    const t = c.currentTime;
    const col = a.columns[Math.floor(this.scanPos * (a.columns.length - 1))];
    const isHit = Math.random() < 0.35 + a.complexity * 0.5;
    if (!isHit) return;

    // Choose a percussion voice from column character + entropy
    const roll = Math.random();
    const dark = col.brightness < 0.42;
    let kind: "kick" | "tom" | "hat" | "rim" | "glitch";
    if (dark && roll < 0.6) kind = "kick";
    else if (dark) kind = "tom";
    else if (a.entropy > 0.6 && roll < 0.35) kind = "glitch";
    else if (roll < 0.5) kind = "hat";
    else kind = "rim";

    const pan = c.createStereoPanner();
    pan.pan.value = (col.hue * 2 - 1) * this.params.stereoWidth;
    pan.connect(this.rhythmBus);

    if (kind === "kick") {
      const osc = c.createOscillator();
      osc.type = "sine";
      const g = c.createGain();
      const startHz = 62 + col.hue * 90;
      osc.frequency.setValueAtTime(startHz, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, startHz * 0.35), t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(pan);
      osc.start(t);
      osc.stop(t + 0.34);
    } else if (kind === "tom") {
      const osc = c.createOscillator();
      osc.type = "triangle";
      const g = c.createGain();
      const startHz = 120 + col.energy * 240;
      osc.frequency.setValueAtTime(startHz, t);
      osc.frequency.exponentialRampToValueAtTime(startHz * 0.5, t + 0.22);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(g);
      g.connect(pan);
      osc.start(t);
      osc.stop(t + 0.36);
    } else if (kind === "hat") {
      const len = c.sampleRate * 0.09;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 5000 + col.energy * 5000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.4 + col.energy * 0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      src.connect(f);
      f.connect(g);
      g.connect(pan);
      src.start(t);
      src.stop(t + 0.1);
    } else if (kind === "rim") {
      const osc = c.createOscillator();
      osc.type = "square";
      osc.frequency.value = 320 + col.hue * 900;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1400 + col.energy * 1800;
      f.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(f);
      f.connect(g);
      g.connect(pan);
      osc.start(t);
      osc.stop(t + 0.06);
    } else {
      // glitch: rapid pitched noise stutter
      const reps = 2 + Math.floor(Math.random() * 3);
      for (let r = 0; r < reps; r++) {
        const off = r * 0.03;
        const len = c.sampleRate * 0.02;
        const buf = c.createBuffer(1, len, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1000 + Math.random() * 6000;
        f.Q.value = 12;
        const g = c.createGain();
        g.gain.setValueAtTime(0.35, t + off);
        g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.025);
        src.connect(f);
        f.connect(g);
        g.connect(pan);
        src.start(t + off);
        src.stop(t + off + 0.03);
      }
    }
  }

  // ---- Recording ----
  isRecording() {
    return this.recorder?.state === "recording";
  }

  startRecording(): boolean {
    if (this.isRecording()) return false;
    this.recChunks = [];
    const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    try {
      this.recorder = new MediaRecorder(
        this.streamDest.stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined
      );
    } catch {
      return false;
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recChunks.push(e.data);
    };
    this.recorder.start(100);
    return true;
  }

  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        resolve(null);
        return;
      }
      this.recorder.onstop = () => {
        const type = this.recorder?.mimeType || "audio/webm";
        const blob = new Blob(this.recChunks, { type });
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  dispose() {
    this.stop();
    this.teardownVoices();
    try {
      this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
