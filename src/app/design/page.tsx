import { BellButton, Button, Card, KpiCard, Pill, ProgressBar, Sidebar, TopBar } from "@/components/ui";

// Living style guide for the Neubrutalist design system. All values here are SAMPLE data for visual review only.

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path d={d} />
  </svg>
);

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /> },
  { href: "/dashboard/enquiries", label: "Enquiries", icon: <Icon d="M4 6h16M4 12h16M4 18h10" /> },
  { href: "/dashboard/review", label: "Review queue", icon: <Icon d="M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" /> },
  { href: "/dashboard/costs", label: "Costs", icon: <Icon d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /> },
  { href: "/design", label: "Design system", icon: <Icon d="M12 2l9 5-9 5-9-5zM3 17l9 5 9-5M3 12l9 5 9-5" /> },
  { href: "/health", label: "Health", icon: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" /> },
];

const swatches = [
  ["Canvas", "#fdf9f0", "bg-canvas"],
  ["Ink", "#111111", "bg-ink"],
  ["Primary · Hot Pink", "#ff3d81", "bg-primary"],
  ["Success · Mint", "#3ddc97", "bg-success"],
  ["Warning · Canary", "#ffd23f", "bg-warning"],
  ["Accent · Lilac", "#c8a2ff", "bg-accent"],
  ["Danger · Coral", "#ff6b5e", "bg-danger"],
];

const bars = [42, 65, 38, 80, 55, 92, 60, 74, 48, 86, 58, 70];

export default function DesignSystemPage() {
  return (
    <div>
      <Sidebar items={nav} active="/design" />
      <main className="space-y-8 p-6 md:ml-[240px] md:p-10">
        <TopBar
          title="Design system"
          subtitle="Neubrutalist tokens and components for Aangan Lead Desk"
          actions={
            <>
              <input className="nb-input hidden w-56 sm:block" placeholder="Search…" aria-label="Search" />
              <Button>Sync</Button>
              <BellButton hasAlert />
              <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-ink bg-success font-display">
                N
              </div>
            </>
          }
        />

        <section>
          <h2 className="mb-4 text-xl">Colour</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {swatches.map(([name, hex, cls]) => (
              <Card key={hex} className="p-3">
                <div className={`h-16 rounded-[10px] border-2 border-ink ${cls}`} />
                <div className="mt-2 text-sm font-bold">{name}</div>
                <div className="font-mono text-xs">{hex}</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl">Type</h2>
          <Card hover={false} className="space-y-3">
            <div className="font-display text-4xl uppercase tracking-tight">Archivo Black · Headings</div>
            <div className="text-lg font-semibold">Space Grotesk · body text at 500 / 600 / 700</div>
            <div className="font-mono text-lg">Space Mono · 00:04:31 · 128 calls</div>
          </Card>
        </section>

        <section>
          <h2 className="mb-4 text-xl">KPI cards <span className="font-sans text-sm normal-case">(sample values)</span></h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard tone="primary" label="Calls answered" value="128" icon={<Icon d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />} delta={{ text: "12%", direction: "up" }} />
            <KpiCard tone="warning" label="Qualified leads" value="41" icon={<Icon d="M20 6 9 17l-5-5" />} delta={{ text: "4%", direction: "up" }} />
            <KpiCard tone="success" label="Median pickup" value="6m" icon={<Icon d="M12 6v6l4 2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20" />} delta={{ text: "2m", direction: "down" }} />
            <KpiCard tone="accent" label="Pricing breaches" value="0" icon={<Icon d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card hover={false} className="lg:col-span-2">
            <h3 className="text-lg">Calls per week <span className="font-sans text-sm normal-case">(sample)</span></h3>
            <svg viewBox="0 0 480 200" className="mt-4 w-full" role="img" aria-label="Sample bar chart">
              <line x1="0" y1="190" x2="480" y2="190" stroke="#111" strokeWidth="2" />
              {bars.map((v, i) => (
                <rect key={i} x={8 + i * 39} y={190 - v * 1.8} width="28" height={v * 1.8} rx="4" fill={i % 2 ? "#c8a2ff" : "#ff3d81"} stroke="#111" strokeWidth="2" />
              ))}
            </svg>
          </Card>
          <div className="space-y-6">
            <Card hover={false}>
              <h3 className="text-lg">Lead sources <span className="font-sans text-sm normal-case">(sample)</span></h3>
              <div className="mt-4 flex items-center gap-4">
                <svg viewBox="0 0 42 42" className="h-28 w-28" role="img" aria-label="Sample donut chart">
                  {[
                    [40, 0, "#ff3d81"],
                    [30, 40, "#ffd23f"],
                    [20, 70, "#3ddc97"],
                    [10, 90, "#c8a2ff"],
                  ].map(([len, off, c]) => (
                    <circle key={c} cx="21" cy="21" r="15.9" fill="none" stroke={c as string} strokeWidth="7" strokeDasharray={`${len} ${100 - (len as number)}`} strokeDashoffset={25 - (off as number)} />
                  ))}
                  <circle cx="21" cy="21" r="19.4" fill="none" stroke="#111" strokeWidth="1" />
                  <circle cx="21" cy="21" r="12.4" fill="none" stroke="#111" strokeWidth="1" />
                </svg>
                <ul className="space-y-1 text-sm font-semibold">
                  {[["Referral", "bg-primary"], ["Instagram", "bg-warning"], ["Google", "bg-success"], ["Other", "bg-accent"]].map(([n, bg]) => (
                    <li key={n} className="flex items-center gap-2">
                      <span className={`h-3 w-3 border-2 border-ink ${bg}`} />
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <Card hover={false}>
              <h3 className="text-lg">Designer pickups <span className="font-sans text-sm normal-case">(sample)</span></h3>
              <div className="mt-4 space-y-3">
                {[["Designer A", 82, "primary"], ["Designer B", 64, "accent"], ["Designer C", 45, "success"]].map(([n, v, t]) => (
                  <div key={n as string}>
                    <div className="mb-1 flex justify-between text-sm font-bold"><span>{n}</span><span className="font-mono">{v}%</span></div>
                    <ProgressBar value={v as number} tone={t as "primary"} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <section>
          <Card hover={false} className="p-0">
            <div className="border-b-2 border-ink px-5 py-4"><h3 className="text-lg">Recent calls <span className="font-sans text-sm normal-case">(sample)</span></h3></div>
            <table className="nb-table">
              <thead><tr><th>Caller</th><th>Locality</th><th>Ended</th><th>Outcome</th><th>Owner</th></tr></thead>
              <tbody>
                <tr><td className="font-bold">Sample caller 1</td><td>Baner</td><td className="font-mono">09:42</td><td><Pill status="success">Qualified</Pill></td><td>Designer A</td></tr>
                <tr><td className="font-bold">Sample caller 2</td><td>Kothrud</td><td className="font-mono">09:15</td><td><Pill status="active">Claimed</Pill></td><td>Designer B</td></tr>
                <tr><td className="font-bold">Sample caller 3</td><td>Wakad</td><td className="font-mono">08:51</td><td><Pill status="pending">Needs review</Pill></td><td>Nikhil</td></tr>
                <tr><td className="font-bold">Sample caller 4</td><td>Aundh</td><td className="font-mono">08:20</td><td><Pill status="error">Escalated</Pill></td><td className="font-bold text-danger">Unowned</td></tr>
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="mb-4 text-xl">Buttons &amp; pills</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Pill status="success">Completed</Pill>
            <Pill status="active">Active</Pill>
            <Pill status="pending">Pending</Pill>
            <Pill status="error">Error</Pill>
          </div>
        </section>
      </main>
    </div>
  );
}
