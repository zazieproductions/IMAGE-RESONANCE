import { useEffect, useRef } from "react";

interface StereoAnalysers {
  left: AnalyserNode;
  right: AnalyserNode;
}

interface VizProps {
  analyser: AnalyserNode | null;
  stereo: StereoAnalysers | null;
  active: boolean;
}

// Shared canvas hook: sets up a DPR-correct canvas and runs a draw callback.
function useCanvasLoop(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) => void,
  deps: unknown[]
) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const tick = () => {
      draw(ctx, canvas.width, canvas.height, dpr);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

const PHOS = "#7ee0a8";
const AMBER = "#e0a24a";
const ICE = "#6fa8c4";

// ─────────────────────────── OSCILLOSCOPE ───────────────────────────
export function Oscilloscope({ analyser, active }: VizProps) {
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ref = useCanvasLoop(
    (ctx, w, h) => {
      ctx.fillStyle = "rgba(4,6,10,0.35)";
      ctx.fillRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = "rgba(38,49,60,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      if (!analyser || !active) {
        ctx.strokeStyle = "rgba(63,122,91,0.5)";
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        return;
      }
      const n = analyser.fftSize;
      if (!buf.current || buf.current.length !== n) buf.current = new Uint8Array(new ArrayBuffer(n));
      analyser.getByteTimeDomainData(buf.current);
      const data = buf.current;
      // glow pass
      ctx.shadowColor = PHOS;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = PHOS;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = (data[i] / 255) * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    },
    [analyser, active]
  );
  return <canvas ref={ref} className="block h-full w-full" />;
}

// ─────────────────────────── VECTORSCOPE (stereo lissajous) ───────────────────────────
export function Vectorscope({ stereo, active }: VizProps) {
  const bufL = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const bufR = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ref = useCanvasLoop(
    (ctx, w, h) => {
      // fade for phosphor trails
      ctx.fillStyle = "rgba(4,6,10,0.2)";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      // reticle
      ctx.strokeStyle = "rgba(38,49,60,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      // 45° axes (L/R)
      ctx.moveTo(cx - R * 0.7, cy - R * 0.7);
      ctx.lineTo(cx + R * 0.7, cy + R * 0.7);
      ctx.moveTo(cx - R * 0.7, cy + R * 0.7);
      ctx.lineTo(cx + R * 0.7, cy - R * 0.7);
      ctx.stroke();
      if (!stereo || !active) return;
      const n = stereo.left.fftSize;
      if (!bufL.current || bufL.current.length !== n) bufL.current = new Uint8Array(new ArrayBuffer(n));
      if (!bufR.current || bufR.current.length !== n) bufR.current = new Uint8Array(new ArrayBuffer(n));
      stereo.left.getByteTimeDomainData(bufL.current);
      stereo.right.getByteTimeDomainData(bufR.current);
      const L = bufL.current;
      const Rr = bufR.current;
      ctx.shadowColor = ICE;
      ctx.shadowBlur = 6;
      for (let i = 0; i < n; i += 1) {
        const l = (L[i] - 128) / 128;
        const r = (Rr[i] - 128) / 128;
        // rotate 45°: x = (l - r), y = (l + r)
        const x = cx + ((l - r) / Math.SQRT2) * R;
        const y = cy - ((l + r) / Math.SQRT2) * R;
        const amp = Math.min(1, Math.hypot(l, r));
        ctx.fillStyle = `rgba(${111 + amp * 100},${168 + amp * 50},${196},${0.5 + amp * 0.5})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
      ctx.shadowBlur = 0;
    },
    [stereo, active]
  );
  return <canvas ref={ref} className="block h-full w-full" />;
}

// ─────────────────────────── RADIAL SPECTRUM (mandala) ───────────────────────────
export function RadialSpectrum({ analyser, active }: VizProps) {
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rot = useRef(0);
  const ref = useCanvasLoop(
    (ctx, w, h) => {
      ctx.fillStyle = "rgba(4,6,10,0.28)";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const inner = Math.min(w, h) * 0.12;
      const maxLen = Math.min(w, h) * 0.36;
      rot.current += active ? 0.004 : 0.001;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot.current);
      // inner ring
      ctx.strokeStyle = "rgba(63,122,91,0.4)";
      ctx.beginPath();
      ctx.arc(0, 0, inner, 0, Math.PI * 2);
      ctx.stroke();
      if (analyser && active) {
        const bins = analyser.frequencyBinCount;
        if (!buf.current || buf.current.length !== bins) buf.current = new Uint8Array(new ArrayBuffer(bins));
        analyser.getByteFrequencyData(buf.current);
        const data = buf.current;
        const bars = 96;
        for (let i = 0; i < bars; i++) {
          const bi = Math.floor(Math.pow(i / bars, 1.7) * bins);
          const v = data[bi] / 255;
          const ang = (i / bars) * Math.PI * 2;
          const len = inner + v * maxLen;
          const x1 = Math.cos(ang) * inner;
          const y1 = Math.sin(ang) * inner;
          const x2 = Math.cos(ang) * len;
          const y2 = Math.sin(ang) * len;
          const hue = 150 - v * 110; // green -> amber/red
          ctx.strokeStyle = `hsl(${hue}, 70%, ${40 + v * 30}%)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          // mirrored dot cap
          ctx.fillStyle = `hsla(${hue},80%,70%,${v})`;
          ctx.fillRect(x2 - 1, y2 - 1, 2, 2);
        }
      }
      ctx.restore();
    },
    [analyser, active]
  );
  return <canvas ref={ref} className="block h-full w-full" />;
}

// ─────────────────────────── BAR SPECTRUM ANALYZER ───────────────────────────
export function BarSpectrum({ analyser, active }: VizProps) {
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const peaks = useRef<number[]>([]);
  const ref = useCanvasLoop(
    (ctx, w, h) => {
      ctx.fillStyle = "#04060a";
      ctx.fillRect(0, 0, w, h);
      const bars = 48;
      if (peaks.current.length !== bars) peaks.current = new Array(bars).fill(0);
      const gap = 2;
      const bw = (w - gap * (bars - 1)) / bars;
      let data: Uint8Array | null = null;
      if (analyser && active) {
        const bins = analyser.frequencyBinCount;
        if (!buf.current || buf.current.length !== bins) buf.current = new Uint8Array(new ArrayBuffer(bins));
        analyser.getByteFrequencyData(buf.current);
        data = buf.current;
      }
      for (let i = 0; i < bars; i++) {
        let v = 0;
        if (data) {
          const bi = Math.floor(Math.pow(i / bars, 1.8) * data.length);
          const bi2 = Math.floor(Math.pow((i + 1) / bars, 1.8) * data.length);
          let m = 0;
          for (let k = bi; k <= bi2 && k < data.length; k++) m = Math.max(m, data[k]);
          v = m / 255;
        }
        const x = i * (bw + gap);
        const bh = v * h;
        // gradient column
        const grad = ctx.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, "#2b7a52");
        grad.addColorStop(0.6, PHOS);
        grad.addColorStop(1, AMBER);
        ctx.fillStyle = grad;
        ctx.fillRect(x, h - bh, bw, bh);
        // peak-hold
        peaks.current[i] = Math.max(peaks.current[i] * 0.94, v);
        const py = h - peaks.current[i] * h;
        ctx.fillStyle = "#f0d090";
        ctx.fillRect(x, py - 1, bw, 1.5);
      }
    },
    [analyser, active]
  );
  return <canvas ref={ref} className="block h-full w-full" />;
}
