import { useEffect, useRef } from "react";

interface Props {
  analyser: AnalyserNode | null;
  active: boolean;
}

// Scrolling spectrograph — renders the live FFT of the master output as a
// waterfall display, drawing newest data on the right and shifting left.
export default function Spectrograph({ analyser, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // color ramp from magnitude (0..255) -> [r,g,b]
    // deep void -> phosphor green -> amber -> hot white (thermal-scope feel)
    const ramp = (v: number): [number, number, number] => {
      const t = v / 255;
      if (t < 0.001) return [4, 6, 9];
      if (t < 0.35) {
        const k = t / 0.35;
        return [6 + k * 20, 14 + k * 130, 20 + k * 70];
      } else if (t < 0.68) {
        const k = (t - 0.35) / 0.33;
        return [26 + k * 200, 144 + k * 20, 90 - k * 40];
      } else if (t < 0.88) {
        const k = (t - 0.68) / 0.2;
        return [226 + k * 25, 164 + k * 40, 50 + k * 70];
      } else {
        const k = (t - 0.88) / 0.12;
        return [251, 204 + k * 51, 120 + k * 135];
      }
    };

    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      // shift existing image left by 2px
      const shift = Math.max(1, Math.floor(2 * dpr));
      const img = ctx.getImageData(shift, 0, w - shift, h);
      ctx.putImageData(img, 0, 0);
      // clear new column region
      ctx.fillStyle = "#04060a";
      ctx.fillRect(w - shift, 0, shift, h);

      if (analyser && freqData && active) {
        analyser.getByteFrequencyData(freqData);
        const bins = freqData.length;
        // draw a log-frequency column
        for (let y = 0; y < h; y++) {
          // map y (bottom=low freq) log scale
          const norm = 1 - y / h;
          const binF = Math.pow(norm, 2.2); // emphasize lows
          const bi = Math.min(bins - 1, Math.floor(binF * bins));
          const v = freqData[bi];
          const [r, g, b] = ramp(v);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(w - shift, y, shift, 1);
        }
      } else {
        // idle: faint noise floor
        for (let y = 0; y < h; y += 2) {
          const v = Math.random() * 22;
          ctx.fillStyle = `rgb(${4 + v},${8 + v},${12 + v})`;
          ctx.fillRect(w - shift, y, shift, 2);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyser, active]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="h-full w-full block" />
      {/* frequency axis labels */}
      <div className="pointer-events-none absolute right-1 top-1 flex h-[calc(100%-8px)] flex-col justify-between font-mono text-[8px] text-phos/50">
        <span>16k</span>
        <span>4k</span>
        <span>1k</span>
        <span>250</span>
        <span>60</span>
      </div>
      {/* scanline sweep */}
      <div
        className="pointer-events-none absolute inset-x-0 h-16 opacity-10"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(126,224,168,0.5), transparent)",
          animation: "scanline 6s linear infinite",
        }}
      />
    </div>
  );
}
