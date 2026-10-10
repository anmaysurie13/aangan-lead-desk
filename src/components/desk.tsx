import type { ReactNode } from "react";
import Link from "next/link";
import { PHOTO_CREDIT } from "@/lib/photos";
import { authEnabled } from "@/lib/auth";

export type TabKey = "leads" | "insights" | "monthly" | "health";
const TABS: { key: TabKey; href: string; label: string }[] = [
  { key: "leads", href: "/dashboard", label: "Leads" },
  { key: "insights", href: "/dashboard/insights", label: "Insights" },
  { key: "monthly", href: "/dashboard/monthly", label: "Monthly" },
  { key: "health", href: "/health", label: "Health" },
];

/** Page frame: wordmark, tabs, photo hero. The hero is rendered by the page via `hero` so each tab has its own photo. */
export function DeskFrame({
  active,
  hero,
  children,
  actions,
}: {
  active: TabKey;
  hero: { image: string; eyebrow: string; title: string; meta?: ReactNode; tagline?: string; extra?: ReactNode };
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <header>
        <div className="d-top">
          <div className="d-brand">
            <span className="d-wordmark">AANGAN</span>
            <span className="d-sub">Lead Desk</span>
          </div>
          <div className="d-actions">
            {actions}
            <Link className="d-btn" href="/talk">Talk to us</Link>
            {authEnabled() && (
              <form action="/api/logout" method="post">
                <button className="d-pill" type="submit">Sign out</button>
              </form>
            )}
          </div>
        </div>
        <nav className="d-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <Link key={t.key} href={t.href} className="d-tab" aria-current={t.key === active ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <section className="d-hero" style={{ backgroundImage: `url(${hero.image})` }}>
        <div className="d-hero-in">
          <div className="d-eyebrow">{hero.eyebrow}</div>
          <h1>{hero.title}</h1>
          {hero.meta && <div className="d-hero-meta">{hero.meta}</div>}
          {hero.tagline && <p className="d-hero-tag">{hero.tagline}</p>}
          {hero.extra}
        </div>
      </section>
      <main className="d-wrap">
        {children}
        <p className="d-credit">AANGAN · Interior design for homes and studios in Pune and PCMC · {PHOTO_CREDIT}</p>
      </main>
    </>
  );
}

export function Tag({ tone, children }: { tone?: "clay" | "sage" | "brass" | "teal"; children: ReactNode }) {
  return (
    <span className={`d-tag ${tone ?? ""}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="d-card">
      <div className="d-label">{label}</div>
      <div className="d-kpi">{value}</div>
      {note && <div className="d-note">{note}</div>}
    </div>
  );
}

export function BarRow({ label, n, max, tone }: { label: string; n: number; max: number; tone?: "brass" | "clay" | "sage" }) {
  return (
    <div className="d-bar-row">
      <span>{label}</span>
      <div className="d-bar"><i className={tone} style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></div>
      <span className="d-num">{n}</span>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="d-empty">{children}</div>;
