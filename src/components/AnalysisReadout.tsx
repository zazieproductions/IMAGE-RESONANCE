import type { ImageAnalysis } from "../lib/analysis";

// A gauge rendered as a discrete character bar — looks like a firmware meter.
function Gauge({ label, value, pct, accent }: { label: string; value: string; pct: number; accent: string }) {
  const cells = 16;
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * cells);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[68px] shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-ash-dim">{label}</span>
      <span className="font-mono text-[10px] leading-none tracking-[-1px]" style={{ color: accent }}>
        {"▮".repeat(filled)}
        <span className="text-line-bright">{"▯".repeat(cells - filled)}</span>
      </span>
      <span className="ml-auto font-mono text-[10px] tabular-nums text-bone">{value}</span>
    </div>
  );
}

export default function AnalysisReadout({ a }: { a: ImageAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Musical seed — presented as derived registers */}
      <div className="grid grid-cols-3 gap-px border border-line bg-line">
        {[
          { l: "KEY", v: a.key.split(" ")[0], s: a.key.split(" ")[1], c: "text-phos" },
          { l: "ROOT_HZ", v: Math.round(a.rootHz).toString(), s: "hertz", c: "text-amber" },
          { l: "TEMPO", v: a.tempo.toString(), s: "bpm", c: "text-ice" },
        ].map((x) => (
          <div key={x.l} className="bg-void-2 px-2 py-2 text-center">
            <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-ash-dim">{x.l}</div>
            <div className={`mt-1 font-arcane text-base ${x.c}`}>{x.v}</div>
            <div className="font-mono text-[8px] text-ash-dim">{x.s}</div>
          </div>
        ))}
      </div>

      {/* Gauges */}
      <div className="space-y-1.5">
        <Gauge label="lumin" value={a.avgBrightness.toFixed(3)} pct={a.avgBrightness} accent="#7ee0a8" />
        <Gauge label="contrast" value={a.contrast.toFixed(3)} pct={a.contrast} accent="#e0a24a" />
        <Gauge label="chroma" value={a.saturation.toFixed(3)} pct={a.saturation} accent="#c8514f" />
        <Gauge label="colorfl" value={a.colorfulness.toFixed(3)} pct={a.colorfulness} accent="#8a7bb0" />
        <Gauge label="cmplx" value={a.complexity.toFixed(3)} pct={a.complexity} accent="#7ee0a8" />
        <Gauge label="entropy" value={a.entropy.toFixed(3)} pct={a.entropy} accent="#e0a24a" />
        <Gauge label="warmth" value={(a.warmth > 0 ? "+" : "") + a.warmth.toFixed(3)} pct={(a.warmth + 1) / 2} accent="#c8514f" />
        <Gauge label="hue°" value={`${Math.round(a.dominantHue * 360)}`} pct={a.dominantHue} accent="#6fa8c4" />
      </div>

      {/* Palette */}
      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ash-dim">
          ├─ chroma clusters [{a.huePalette.length}]
        </div>
        <div className="flex h-5 overflow-hidden border border-line">
          {a.huePalette.length ? (
            a.huePalette.map((p, i) => (
              <div
                key={i}
                style={{
                  flexGrow: Math.max(0.4, p.weight * 10),
                  background: `hsl(${p.hue * 360}, ${Math.round(p.sat * 100)}%, ${Math.round(p.light * 100)}%)`,
                }}
                title={`${Math.round(p.hue * 360)}° · ${(p.weight * 100).toFixed(0)}%`}
              />
            ))
          ) : (
            <div className="flex-1 bg-line" />
          )}
        </div>
      </div>

      {/* Luminance histogram */}
      <div>
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ash-dim">
          └─ luminance distribution
        </div>
        <div className="flex h-9 items-end gap-px border-b border-line/60">
          {a.histogram.map((v, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                height: `${Math.max(3, Math.min(100, (v / Math.max(...a.histogram)) * 100))}%`,
                background: `hsl(150, ${20 + (i / a.histogram.length) * 40}%, ${22 + (i / a.histogram.length) * 44}%)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
