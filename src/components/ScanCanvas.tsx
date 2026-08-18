import type { ImageAnalysis } from "../lib/analysis";

interface Props {
  imageUrl: string;
  analysis: ImageAnalysis | null;
  scanPos: number; // 0..1
  scanMode: string;
  active: boolean;
}

// Displays the scanned artwork under an optical-sensor sweep with a reticle,
// coordinate readout and column-energy spectrum overlay.
export default function ScanCanvas({ imageUrl, analysis, scanPos, active }: Props) {
  const linePct = scanPos * 100;
  const colIdx = analysis ? Math.floor(scanPos * (analysis.columns.length - 1)) : 0;
  const col = analysis?.columns[colIdx];

  return (
    <div className="relative h-full w-full overflow-hidden bg-void-2">
      <img
        src={imageUrl}
        alt="scanned artwork"
        className="absolute inset-0 h-full w-full object-contain"
        style={{
          filter: active
            ? "contrast(1.08) saturate(1.05) brightness(0.96)"
            : "grayscale(0.55) brightness(0.55) contrast(1.1)",
        }}
      />

      {/* grid + vignette */}
      <div className="pointer-events-none absolute inset-0 dotgrid opacity-[0.10]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(3,5,8,0.82) 100%)" }}
      />

      {/* column energy spectrum along the bottom */}
      {analysis && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end gap-px opacity-80 mix-blend-screen">
          {analysis.columns.map((c, i) => {
            const distance = Math.abs(i / analysis.columns.length - scanPos);
            const glow = Math.max(0, 1 - distance * 10);
            return (
              <div
                key={i}
                className="flex-1"
                style={{
                  height: `${12 + c.energy * 78}%`,
                  background: `hsla(${c.hue * 360}, ${30 + c.saturation * 45}%, ${
                    40 + glow * 28
                  }%, ${0.18 + glow * 0.7})`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* horizontal graticule center line */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-phos/10" />

      {/* scan head — sensor line + reticle */}
      {active && (
        <>
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px"
            style={{
              left: `${linePct}%`,
              background: "linear-gradient(180deg, transparent, rgba(126,224,168,0.9), rgba(126,224,168,0.4), rgba(126,224,168,0.9), transparent)",
              boxShadow: "0 0 12px 1px rgba(126,224,168,0.55)",
            }}
          />
          {/* leading fringe */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-6 -translate-x-full opacity-40"
            style={{ left: `${linePct}%`, background: "linear-gradient(90deg, transparent, rgba(126,224,168,0.14))" }}
          />
          {/* top + bottom reticle marks */}
          <div className="pointer-events-none absolute -translate-x-1/2" style={{ left: `${linePct}%`, top: 2 }}>
            <div className="font-arcane text-[10px] text-phos">▼</div>
          </div>
          <div className="pointer-events-none absolute -translate-x-1/2" style={{ left: `${linePct}%`, bottom: 2 }}>
            <div className="font-arcane text-[10px] text-phos">▲</div>
          </div>
        </>
      )}

      {/* live sensor readout, top-left corner inside frame */}
      {analysis && col && (
        <div className="pointer-events-none absolute bottom-16 left-3 space-y-0.5 font-mono text-[9px] leading-tight text-phos/70">
          <div>COL {String(colIdx).padStart(3, "0")}/{analysis.columns.length}</div>
          <div>LUM {col.brightness.toFixed(3)}</div>
          <div>NRG {col.energy.toFixed(3)}</div>
          <div>HUE {Math.round(col.hue * 360).toString().padStart(3, "0")}°</div>
        </div>
      )}

      {/* frame corner ticks */}
      <div className="pointer-events-none absolute inset-2 border border-line/40" />
      <Corner c="left-1 top-1 border-l border-t" />
      <Corner c="right-1 top-1 border-r border-t" />
      <Corner c="bottom-1 left-1 border-b border-l" />
      <Corner c="bottom-1 right-1 border-b border-r" />
    </div>
  );
}

function Corner({ c }: { c: string }) {
  return <div className={`pointer-events-none absolute h-4 w-4 border-phos/60 ${c}`} />;
}
