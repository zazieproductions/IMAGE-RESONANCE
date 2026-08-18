type Accent = "phos" | "amber" | "blood" | "ice";

const accentClass: Record<Accent, string> = {
  phos: "",
  amber: "accent-amber",
  blood: "accent-blood",
  ice: "accent-ice",
};

const accentText: Record<Accent, string> = {
  phos: "text-phos",
  amber: "text-amber",
  blood: "text-blood",
  ice: "text-ice",
};

// Draw a small mechanical scale of ticks under the slider label.
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  accent = "phos",
  format,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  accent?: Accent;
  format?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block select-none">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ash">{label}</span>
        <span className={`font-mono text-[11px] tabular-nums ${accentText[accent]}`}>
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={accentClass[accent]}
      />
      <div className="mt-1 flex justify-between px-px">
        {Array.from({ length: 21 }).map((_, i) => {
          const on = (i / 20) * 100 <= pct;
          return (
            <span
              key={i}
              className={`w-px ${i % 5 === 0 ? "h-1.5" : "h-1"}`}
              style={{ background: on ? "var(--color-phos-dim)" : "var(--color-line)" }}
            />
          );
        })}
      </div>
    </label>
  );
}

export function SegButton<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="select-none">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ash">{label}</div>
      <div className="grid grid-flow-col auto-cols-fr border border-line">
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
              i > 0 ? "border-l border-line" : ""
            } ${
              value === o.value
                ? "bg-phos/12 text-phos"
                : "bg-panel text-ash-dim hover:bg-panel-2 hover:text-ash"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
