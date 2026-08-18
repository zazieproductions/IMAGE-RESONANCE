import type { ReactNode } from "react";

// Bracketed section frame — evokes a device firmware panel.
export function Frame({
  id,
  title,
  children,
  right,
  className = "",
}: {
  id?: string;
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative border border-line bg-panel/70 ${className}`}>
      {/* corner brackets */}
      <Bracket className="left-[-1px] top-[-1px] border-l border-t" />
      <Bracket className="right-[-1px] top-[-1px] border-r border-t" />
      <Bracket className="bottom-[-1px] left-[-1px] border-b border-l" />
      <Bracket className="bottom-[-1px] right-[-1px] border-b border-r" />
      <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          {id && <span className="font-mono text-[9px] text-phos-dim">{id}</span>}
          <h3 className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-ash">
            {title}
          </h3>
        </div>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Bracket({ className }: { className: string }) {
  return <span className={`pointer-events-none absolute h-2 w-2 border-phos/50 ${className}`} />;
}

// Key: value readout row.
export function Field({
  k,
  v,
  accent = "phos",
}: {
  k: string;
  v: ReactNode;
  accent?: "phos" | "amber" | "ice" | "blood" | "bone";
}) {
  const color: Record<string, string> = {
    phos: "text-phos",
    amber: "text-amber",
    ice: "text-ice",
    blood: "text-blood",
    bone: "text-bone",
  };
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/40 py-1 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ash-dim">{k}</span>
      <span className={`font-mono text-[11px] tabular-nums ${color[accent]}`}>{v}</span>
    </div>
  );
}

export function TermButton({
  children,
  onClick,
  active = false,
  accent = "phos",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  accent?: "phos" | "amber" | "blood" | "ice" | "bruise";
  disabled?: boolean;
  className?: string;
}) {
  const map: Record<string, { on: string; off: string }> = {
    phos: { on: "border-phos bg-phos/12 text-phos", off: "hover:border-phos/60 hover:text-phos" },
    amber: { on: "border-amber bg-amber/12 text-amber", off: "hover:border-amber/60 hover:text-amber" },
    blood: { on: "border-blood bg-blood/12 text-blood", off: "hover:border-blood/60 hover:text-blood" },
    ice: { on: "border-ice bg-ice/12 text-ice", off: "hover:border-ice/60 hover:text-ice" },
    bruise: { on: "border-bruise bg-bruise/12 text-bruise", off: "hover:border-bruise/60 hover:text-bruise" },
  };
  const a = map[accent];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? a.on : `border-line bg-panel-2 text-ash ${a.off}`
      } ${className}`}
    >
      {children}
    </button>
  );
}
