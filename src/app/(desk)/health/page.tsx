import { requireAuth } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health";
import { PHOTOS } from "@/lib/photos";
import { DeskFrame, Tag } from "@/components/desk";

export const dynamic = "force-dynamic";

export default async function Health() {
  await requireAuth("/health");
  const checks = await runHealthChecks();
  const bad = checks.filter((c) => c.ok === false).length;
  const pending = checks.filter((c) => c.ok === null).length;
  return (
    <DeskFrame
      active="health"
      hero={{
        image: PHOTOS.health,
        eyebrow: "Aangan Studio · System health",
        title: bad ? `${bad} thing${bad > 1 ? "s" : ""} need attention` : "All systems working",
        meta: pending ? `${pending} connection${pending > 1 ? "s" : ""} not set up yet` : undefined,
      }}
    >
      <div className="d-grid cols-2">
        {checks.map((c) => (
          <div key={c.name} className="d-card flat" style={c.ok === false ? { background: "var(--clay-soft)", borderColor: "#ecc3b2" } : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <h3>{c.name}</h3>
              <Tag tone={c.ok === true ? "sage" : c.ok === false ? "clay" : "brass"}>{c.ok === true ? "Working" : c.ok === false ? "Problem" : "Not set up"}</Tag>
            </div>
            <p className="d-note" style={{ marginTop: 10 }}>{c.detail}</p>
          </div>
        ))}
      </div>
    </DeskFrame>
  );
}
