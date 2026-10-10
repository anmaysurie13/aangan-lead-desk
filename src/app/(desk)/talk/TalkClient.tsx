"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

/** Browser voice call: asks our server for a LiveKit token (Vaani WebRTC session), joins the room, plays the agent's audio, sends the mic. */
export default function TalkClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const room = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => void room.current?.disconnect(), []);

  async function start() {
    setError("");
    setPhase("connecting");
    setSeconds(0);
    try {
      // Ask for the mic first so a refusal fails fast, before any billable session exists.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/talk/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the call.");

      const r = new Room({ adaptiveStream: true, dynacast: true });
      room.current = r;
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audioBox.current?.appendChild(track.attach());
      });
      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeaking(speakers.some((s) => !s.isLocal)));
      r.on(RoomEvent.Disconnected, () => setPhase((p) => (p === "error" ? p : "ended")));
      await r.connect(data.connectionUrl, data.token);
      await r.localParticipant.setMicrophoneEnabled(true);
      setPhase("live");
    } catch (e) {
      room.current?.disconnect();
      const msg = e instanceof Error ? e.message : "Could not start the call.";
      setError(/permission|denied|NotAllowed/i.test(msg) ? "Please allow microphone access in your browser, then try again." : msg);
      setPhase("error");
    }
  }

  function end() {
    room.current?.disconnect();
    setPhase("ended");
  }

  async function toggleMute() {
    const next = !muted;
    await room.current?.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="d-card" style={{ maxWidth: 520, margin: "0 auto", textAlign: "center", color: "var(--ink)" }}>
      <div ref={audioBox} hidden />
      {phase === "idle" || phase === "error" ? (
        <>
          <h2 style={{ marginBottom: 8 }}>Talk to our front desk</h2>
          <p className="d-note" style={{ marginBottom: 18 }}>Speak to our assistant right from your browser. It answers at any hour, in English or Hindi. This call is recorded so a designer can follow up.</p>
          <div className="d-chips" style={{ justifyContent: "center", marginBottom: 18 }}>
            <button className="d-pill" aria-current={lang === "en"} onClick={() => setLang("en")} type="button">English</button>
            <button className="d-pill" aria-current={lang === "hi"} onClick={() => setLang("hi")} type="button">हिन्दी</button>
          </div>
          <button className="d-btn" style={{ fontSize: 17, padding: "14px 30px" }} onClick={start} type="button">Start voice call</button>
          {error && <p style={{ color: "var(--clay)", fontWeight: 800, marginTop: 14 }}>{error}</p>}
        </>
      ) : phase === "connecting" ? (
        <>
          <h2>Connecting…</h2>
          <p className="d-note" style={{ marginTop: 8 }}>Setting up your call. Please allow the microphone if asked.</p>
        </>
      ) : phase === "live" ? (
        <>
          <div className="d-label">{speaking ? "Aangan is speaking" : muted ? "Muted" : "Listening"}</div>
          <div className="d-kpi" style={{ fontSize: 52 }}>{mm}:{ss}</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
            <button className="d-btn ghost" onClick={toggleMute} type="button">{muted ? "Unmute" : "Mute"}</button>
            <button className="d-btn" style={{ background: "var(--clay)", borderColor: "var(--clay)" }} onClick={end} type="button">End call</button>
          </div>
        </>
      ) : (
        <>
          <h2>Thank you</h2>
          <p className="d-note" style={{ margin: "8px 0 18px" }}>If you gave us your email, a designer will be in touch shortly.</p>
          <button className="d-btn ghost" onClick={() => setPhase("idle")} type="button">Start another call</button>
        </>
      )}
    </div>
  );
}
