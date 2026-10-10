"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";

/**
 * Browser voice call: asks our server for a LiveKit token (Vaani WebRTC session), joins the room, plays the agent's
 * audio and publishes the mic. A live checklist + mic level meter make problems visible (no mic signal, blocked
 * audio playback, agent not joined) instead of a silent call.
 */
export default function TalkClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [agentJoined, setAgentJoined] = useState(false);
  const [agentAudio, setAgentAudio] = useState(false);
  const [micPublished, setMicPublished] = useState(false);
  const [level, setLevel] = useState(0);
  const [heardYou, setHeardYou] = useState(false);
  const [needsSound, setNeedsSound] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [captions, setCaptions] = useState<{ id: string; who: "You" | "Aangan"; text: string }[]>([]);
  const room = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);

  const note = (s: string) => setLog((l) => [...l.slice(-9), `${new Date().toLocaleTimeString()}  ${s}`]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      room.current?.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      void ctx.current?.close();
    },
    [],
  );

  function watchMic(track: MediaStreamTrack) {
    const ac = new AudioContext();
    ctx.current = ac;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    ac.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 6));
      if (rms > 0.02) setHeardYou(true);
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  }

  async function start() {
    if (!name.trim()) {
      setError(lang === "hi" ? "कृपया अपना नाम लिखें।" : "Please enter your name first.");
      setPhase("error");
      return;
    }
    setError("");
    setCaptions([]);
    setPhase("connecting");
    setSeconds(0);
    setLog([]);
    setAgentJoined(false);
    setAgentAudio(false);
    setMicPublished(false);
    setHeardYou(false);
    setNeedsSound(false);
    try {
      // Ask for the mic first so a refusal fails fast, before any billable session exists.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      note("microphone permission OK");

      const res = await fetch("/api/talk/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang, name: name.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the call.");
      note("session created");

      const r = new Room({ adaptiveStream: true, dynacast: true });
      room.current = r;
      // Live captions: the agent publishes its own and the caller's transcription on the lk.transcription text stream.
      r.registerTextStreamHandler("lk.transcription", async (reader) => {
        const attrs = reader.info.attributes ?? {};
        const who: "You" | "Aangan" = attrs["lk.transcribed_track_id"] ? "You" : "Aangan";
        const id = attrs["lk.segment_id"] ?? reader.info.id;
        let text = "";
        for await (const chunk of reader) {
          text += chunk;
          setCaptions((cs) => [...cs.filter((x) => x.id !== id), { id, who, text }].slice(-8));
        }
        if (who === "You") setHeardYou(true);
      });
      r.on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => note(`connection: ${s}`));
      r.on(RoomEvent.ParticipantConnected, (p) => {
        setAgentJoined(true);
        note(`agent joined (${p.identity})`);
      });
      r.on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
        if (track.kind === Track.Kind.Audio) {
          audioBox.current?.appendChild(track.attach());
          setAgentAudio(true);
          note(`receiving audio from ${p.identity}`);
        }
      });
      r.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Microphone) {
          setMicPublished(true);
          note("your microphone is being sent");
          const mt = pub.track?.mediaStreamTrack;
          if (mt) watchMic(mt);
        }
      });
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNeedsSound(!r.canPlaybackAudio);
        if (!r.canPlaybackAudio) note("browser blocked sound: tap 'Enable sound'");
      });
      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeaking(speakers.some((s) => !s.isLocal)));
      r.on(RoomEvent.Disconnected, (reason) => {
        note(`disconnected${reason !== undefined ? ` (reason ${reason})` : ""}`);
        setPhase((p) => (p === "error" ? p : "ended"));
      });
      await r.connect(data.connectionUrl, data.token);
      setAgentJoined(r.remoteParticipants.size > 0);
      await r.startAudio().catch(() => setNeedsSound(true));
      await r.localParticipant.setMicrophoneEnabled(true);
      setPhase("live");
    } catch (e) {
      room.current?.disconnect();
      const msg = e instanceof Error ? e.message : "Could not start the call.";
      note(`error: ${msg}`);
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
  const tick = (ok: boolean) => (ok ? "✓" : "…");

  return (
    <div className="d-card" style={{ maxWidth: 520, margin: "0 auto", textAlign: "center", color: "var(--ink)" }}>
      <div ref={audioBox} style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
      {phase === "idle" || phase === "error" ? (
        <>
          <h2 style={{ marginBottom: 8 }}>Talk to our front desk</h2>
          <p className="d-note" style={{ marginBottom: 18 }}>Speak to our assistant right from your browser. It answers at any hour, in English or Hindi. This call is recorded so a designer can follow up. Please use headphones if you can, and allow the microphone when asked.</p>
          <input
            className="d-input"
            style={{ marginBottom: 14, textAlign: "center" }}
            placeholder={lang === "hi" ? "आपका नाम" : "Your name"}
            aria-label="Your name"
            autoComplete="given-name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void start()}
          />
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
          <div className="d-label">{speaking ? "Aangan is speaking" : muted ? "Muted" : "Your turn: speak now"}</div>
          <div className="d-kpi" style={{ fontSize: 52 }}>{mm}:{ss}</div>
          <div style={{ height: 10, background: "#e3ebe6", borderRadius: 99, overflow: "hidden", margin: "6px auto 10px", maxWidth: 320 }} aria-label="Microphone level">
            <div style={{ width: `${Math.round(level * 100)}%`, height: "100%", background: "var(--teal)", transition: "width .08s" }} />
          </div>
          <p className="d-note" style={{ marginBottom: 12 }}>
            {tick(agentJoined)} assistant joined · {tick(agentAudio)} hearing the assistant · {tick(micPublished)} microphone sent · {tick(heardYou)} your voice detected
          </p>
          <div style={{ textAlign: "left", display: "grid", gap: 8, margin: "0 0 14px", maxHeight: 220, overflow: "auto" }} aria-live="polite">
            {captions.length === 0 && <p className="d-note" style={{ textAlign: "center" }}>The conversation will appear here as you talk.</p>}
            {captions.map((c) => (
              <div key={c.id} className={`d-turn ${c.who === "You" ? "caller" : "agent"}`} style={{ maxWidth: "92%" }}>
                <small>{c.who === "You" ? (name || "YOU").toUpperCase() : "AANGAN"}</small>
                {c.text}
              </div>
            ))}
          </div>
          {needsSound && <button className="d-btn brass" style={{ marginBottom: 12 }} onClick={() => room.current?.startAudio().then(() => setNeedsSound(false))} type="button">Enable sound</button>}
          {micPublished && !heardYou && seconds > 6 && <p className="d-alert" style={{ marginBottom: 12 }}>We can&apos;t hear any sound from your microphone. Check it isn&apos;t muted and that the right microphone is selected in your browser.</p>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
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
      {log.length > 0 && (
        <details style={{ marginTop: 16, textAlign: "left" }}>
          <summary className="d-note" style={{ cursor: "pointer" }}>Call details (for support)</summary>
          <pre className="d-note" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{log.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
