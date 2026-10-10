import { Card } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Card hover={false}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] border-2 border-ink bg-primary shadow-brutal-sm" />
          <h1 className="text-3xl">Aangan Lead Desk</h1>
        </div>
        <p className="mt-4 text-lg">Inbound phone enquiry desk for Aangan Studio, Pune.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a className="nb-btn" href="/dashboard">Open the dashboard</a>
          <a className="nb-btn nb-btn-secondary" href="/design">Design system</a>
        </div>
      </Card>
    </main>
  );
}
