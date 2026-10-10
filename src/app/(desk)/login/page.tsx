import { PHOTOS } from "@/lib/photos";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="d-hero" style={{ backgroundImage: `url(${PHOTOS.login})`, minHeight: "100vh" }}>
      <div className="d-login">
        <div className="box d-card" style={{ color: "var(--ink)" }}>
          <div className="d-brand" style={{ marginBottom: 18 }}>
            <span className="d-wordmark">AANGAN</span>
            <span className="d-sub">Lead Desk</span>
          </div>
          <p className="d-i" style={{ fontSize: 19, marginBottom: 18 }}>Every enquiry answered. Every designer briefed.</p>
          <form action="/api/login" method="post" style={{ display: "grid", gap: 14 }}>
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <label className="d-label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoFocus required className="d-input" />
            {error && <p style={{ color: "var(--clay)", fontWeight: 800 }}>That password isn&apos;t right.</p>}
            <button className="d-btn" type="submit">Sign in</button>
          </form>
        </div>
      </div>
    </div>
  );
}
