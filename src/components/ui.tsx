import type { ReactNode } from "react";

// Neubrutalist UI kit. Visual rules live in globals.css (.nb-*); these are thin typed wrappers.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type Tone = "primary" | "success" | "warning" | "accent" | "danger";

const toneBg: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  accent: "bg-accent",
  danger: "bg-danger",
};

export function Card({ children, className, hover = true }: { children: ReactNode; className?: string; hover?: boolean }) {
  return <div className={cx("nb-card p-5", hover && "nb-card-hover", className)}>{children}</div>;
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button className={cx("nb-btn", variant === "secondary" && "nb-btn-secondary", className)} {...props}>
      {children}
    </button>
  );
}

export type PillStatus = "success" | "pending" | "active" | "error" | "primary" | "neutral";

export function Pill({ status = "neutral", children }: { status?: PillStatus; children: ReactNode }) {
  return <span className={cx("nb-pill", status !== "neutral" && `nb-pill-${status}`)}>{children}</span>;
}

/** Maps a lead outcome to the design system's status colours. */
export const outcomeStatus: Record<string, PillStatus> = {
  QUALIFIED: "success",
  QUALIFIED_WITH_NOTE: "success",
  BOOKED: "success",
  CLAIMED: "active",
  NEEDS_REVIEW: "pending",
  OPEN: "pending",
  ESCALATED: "error",
  PRICING_BREACH: "error",
  DECLINED: "neutral",
};

export function KpiCard({
  label,
  value,
  tone,
  icon,
  delta,
}: {
  label: string;
  value: ReactNode;
  tone: Tone;
  icon: ReactNode;
  delta?: { text: string; direction: "up" | "down" };
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className={cx("nb-icon", toneBg[tone])}>{icon}</div>
        {delta && (
          <span className={cx("nb-delta", delta.direction === "up" ? "bg-success" : "bg-danger")}>
            {delta.direction === "up" ? "▲" : "▼"} {delta.text}
          </span>
        )}
      </div>
      <div className="mt-4 font-display text-[30px] leading-none">{value}</div>
      <div className="mt-2 font-medium">{label}</div>
    </Card>
  );
}

export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="nb-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className={toneBg[tone]} style={{ width: `${pct}%` }} />
    </div>
  );
}

export type NavItem = { href: string; label: string; icon: ReactNode };

export function Sidebar({ items, active }: { items: NavItem[]; active: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[240px] flex-col border-r-2 border-ink bg-canvas p-4 md:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-9 w-9 rounded-[10px] border-2 border-ink bg-primary shadow-brutal-sm" />
        <span className="font-display text-lg uppercase tracking-tight">Aangan</span>
      </div>
      <nav className="flex flex-col gap-2">
        {items.map((i) => (
          <a key={i.href} href={i.href} className="nb-nav-item" aria-current={i.href === active ? "page" : undefined}>
            {i.icon}
            {i.label}
          </a>
        ))}
      </nav>
      <div className="nb-card mt-auto flex items-center gap-3 p-3">
        <div className="grid h-10 w-10 place-items-center rounded-[10px] border-2 border-ink bg-accent font-display">
          ND
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold">Nikhil Deshpande</div>
          <span className="nb-pill bg-warning px-2 py-0.5 text-[10px] shadow-none">TEAM PLAN</span>
        </div>
      </div>
    </aside>
  );
}

export function TopBar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[36px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[18px]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">{actions}</div>
    </header>
  );
}

export function BellButton({ hasAlert }: { hasAlert: boolean }) {
  return (
    <button aria-label="Alerts" className="nb-btn nb-btn-secondary relative h-10 w-10 justify-center p-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {hasAlert && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-ink bg-danger" />}
    </button>
  );
}
