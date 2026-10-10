import { PHOTOS } from "@/lib/photos";
import TalkClient from "./TalkClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Talk to Aangan Studio" };

/** Public, customer-facing: no dashboard chrome. Anyone can start a voice enquiry from their browser. */
export default function Talk() {
  return (
    <div className="d-hero" style={{ backgroundImage: `url(${PHOTOS.leads})`, minHeight: "100vh" }}>
      <div className="d-hero-in" style={{ display: "grid", gap: 28, alignContent: "center", minHeight: "100vh" }}>
        <div>
          <div className="d-eyebrow">Aangan Studio · Pune</div>
          <h1>Let&apos;s talk about your space</h1>
          <p className="d-hero-tag">Interior design for homes and studios in Pune and PCMC. Tell us what you have in mind, and a designer will take it from there.</p>
        </div>
        <TalkClient />
      </div>
    </div>
  );
}
