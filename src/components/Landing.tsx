import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onImage: (file: File) => void;
}

const SAMPLES = [
  { code: "NGC-957", label: "nebula field", query: "https://images.pexels.com/photos/957061/milky-way-starry-sky-night-sky-star-957061.jpeg?auto=compress&cs=tinysrgb&w=900" },
  { code: "OIL-153", label: "chroma oil", query: "https://images.pexels.com/photos/1509534/pexels-photo-1509534.jpeg?auto=compress&cs=tinysrgb&w=900" },
  { code: "OXD-129", label: "oxide plate", query: "https://images.pexels.com/photos/129731/pexels-photo-129731.jpeg?auto=compress&cs=tinysrgb&w=900" },
  { code: "NEO-224", label: "sodium haze", query: "https://images.pexels.com/photos/2246476/pexels-photo-2246476.jpeg?auto=compress&cs=tinysrgb&w=900" },
];

const BOOT_LINES = [
  "► init resonance core .............. ok",
  "► mount web-audio graph ............ ok",
  "► calibrate spectral bank [16] ..... ok",
  "► load convolution kernel 3.4s ..... ok",
  "► arm optical scan head ............ ok",
  "► fft analyser 2048 · log-freq ..... ok",
  "► awaiting input aperture .......... █",
];

export default function Landing({ onImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [bootCount, setBootCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setBootCount((c) => (c < BOOT_LINES.length ? c + 1 : c));
    }, 260);
    return () => clearInterval(id);
  }, []);

  const pick = useCallback(
    (f: File | undefined) => {
      if (f && f.type.startsWith("image/")) onImage(f);
    },
    [onImage]
  );

  const loadSample = useCallback(
    async (url: string, code: string) => {
      try {
        setLoadingSample(code);
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], `${code}.jpg`, { type: blob.type || "image/jpeg" });
        onImage(file);
      } catch {
        setLoadingSample(null);
      }
    },
    [onImage]
  );

  return (
    <div className="crt grain relative min-h-screen overflow-hidden bg-void text-bone" style={{ animation: "crt-flicker 8s infinite" }}>
      <div className="pointer-events-none absolute inset-0 dotgrid opacity-[0.08]" style={{ animation: "drift 60s linear infinite" }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, rgba(126,224,168,0.09), transparent 42%), radial-gradient(circle at 90% 92%, rgba(224,162,74,0.07), transparent 45%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-6 sm:px-8">
        {/* masthead */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-arcane text-sm text-phos text-phos-glow">◈</span>
            <span className="font-mono text-[12px] font-bold tracking-[0.32em] text-bone">
              IMAGE<span className="text-phos">//</span>RESONANCE
            </span>
          </div>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.3em] text-ash-dim sm:block">
            spectral analysis unit · rev 1.0
          </span>
        </div>

        {/* main split */}
        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* left — manifesto */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 border border-line bg-panel/60 px-3 py-1">
              <span className="h-1.5 w-1.5 bg-phos" style={{ animation: "blink 1.4s steps(1) infinite" }} />
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-ash">
                sig::visual → sig::acoustic transducer
              </span>
            </div>

            <h1 className="font-serif text-[42px] italic leading-[0.98] text-bone sm:text-[58px]">
              An instrument that
              <br />
              <span className="text-phos text-phos-glow">hears images.</span>
            </h1>

            <p className="max-w-md font-mono text-[12px] leading-relaxed text-ash">
              Feed the aperture any poster, painting, photograph or collage. The unit decomposes
              luminance, chroma clusters, contrast, entropy and edge structure — then transduces
              them into drone beds, spectral voices, granular texture and rhythm. Shape the signal.
              Record the artifact.
            </p>

            {/* spec strip */}
            <div className="grid grid-cols-2 gap-px border border-line bg-line text-[9px] sm:grid-cols-4">
              {[
                ["FFT", "2048"],
                ["VOICES", "16"],
                ["LAYERS", "4"],
                ["OUTPUT", "WEBM"],
              ].map(([k, v]) => (
                <div key={k} className="bg-void-2 px-2.5 py-2">
                  <div className="font-mono uppercase tracking-[0.14em] text-ash-dim">{k}</div>
                  <div className="mt-0.5 font-mono text-[13px] text-phos">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* right — aperture + boot log */}
          <div className="space-y-4">
            {/* boot log */}
            <div className="border border-line bg-void-2/80 p-3 font-mono text-[10px] leading-relaxed">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[8px] uppercase tracking-[0.2em] text-ash-dim">
                <span>boot.log</span>
                <span className="text-phos-dim">tty0</span>
              </div>
              <div className="space-y-0.5">
                {BOOT_LINES.slice(0, bootCount).map((l, i) => (
                  <div key={i} className="text-phos/85" style={{ animation: "rise 0.2s ease-out" }}>
                    {l}
                  </div>
                ))}
                {bootCount < BOOT_LINES.length && <span className="caret text-phos" />}
              </div>
            </div>

            {/* aperture / dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={`group relative flex cursor-pointer flex-col items-center overflow-hidden border px-6 py-8 text-center transition-all ${
                drag ? "border-phos bg-phos/10" : "border-line-bright bg-panel/50 hover:border-phos/60 hover:bg-panel/80"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 hatch opacity-40" />
              <div className="relative">
                <div className="font-arcane text-3xl text-phos text-phos-glow transition-transform group-hover:scale-110">
                  ◎
                </div>
              </div>
              <div className="relative mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-bone">
                drop artwork into aperture
              </div>
              <div className="relative mt-1 font-mono text-[9px] tracking-wide text-ash-dim">
                jpg · png · webp · gif — transduced on-device, nothing leaves the unit
              </div>
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </div>

            {/* sample specimens */}
            <div className="border border-line bg-panel/40 p-3">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ash-dim">
                ├─ specimen archive
              </div>
              <div className="grid grid-cols-2 gap-px bg-line">
                {SAMPLES.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => loadSample(s.query, s.code)}
                    disabled={loadingSample !== null}
                    className="group flex items-center justify-between bg-void-2 px-2.5 py-2 text-left transition-colors hover:bg-panel-2 disabled:opacity-40"
                  >
                    <span>
                      <span className="block font-mono text-[10px] text-phos">{s.code}</span>
                      <span className="block font-mono text-[8px] uppercase tracking-wider text-ash-dim">
                        {loadingSample === s.code ? "loading…" : s.label}
                      </span>
                    </span>
                    <span className="font-arcane text-[10px] text-ash-dim group-hover:text-phos">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* footer strip */}
        <div className="flex items-center justify-between border-t border-line pt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-ash-dim">
          <span>◦ local synthesis · no upload</span>
          <span className="hidden sm:block">headphones advised — full stereo field</span>
          <span className="text-phos-dim">status: ready</span>
        </div>
      </div>
    </div>
  );
}
