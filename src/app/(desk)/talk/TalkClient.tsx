"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectionState, Room, RoomEvent, Track, type RemoteParticipant } from "livekit-client";

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
type AgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking" | "unknown";
type Turn = { id: string; who: "You" | "Aangan"; text: string; final: boolean; at: string };

const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Browser voice call with the full conversation flow made visible:
 *   mic → "Heard you" (live transcript of your words) → agent "Thinking" → agent "Speaking" → "Your turn".
 * The agent state comes from the agent's own LiveKit attribute (lk.agent.state); turns come from lk.transcription.
 */
export default function TalkClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [name, setName] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [agentJoined, setAgentJoined] = useState(false);
  const [agentAudio, setAgentAudio] = useState(false);
  const [micPublished, setMicPublished] = useState(false);
  const [heardYou, setHeardYou] = useState(false);
  const [level, setLevel] = useState(0);
  const [needsSound, setNeedsSound] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("initializing");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const room = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const ac = useRef<AudioContext | null>(null);
  const flowEnd = useRef<HTMLDivElement>(null);

  const note = (s: string) => setLog((l) => [...l.slice(-19), `${clock()}  ${s}`]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => flowEnd.current?.scrollIntoView({ block: "nearest" }), [turns, agentState]);

  useEffect(
    () => () => {
      room.current?.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      void ac.current?.close();
    },
    [],
  );

  function watchMic(track: MediaStreamTrack) {
    const ctx = new AudioContext();
    ac.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 6));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  }

  const readState = (p: RemoteParticipant) => {
    const s = p.attributes?.["lk.agent.state"] as AgentState | undefined;
    if (s) setAgentState(s);
  };

  async function start() {
    if (!name.trim()) {
      setError(lang === "hi" ? "कृपया अपना नाम लिखें।" : "Please enter your name first.");
      setPhase("error");
      return;
    }
    setError("");
    setPhase("connecting");
    setSeconds(0);
    setLog([]);
    setTurns([]);
    setAgentJoined(false);
    setAgentAudio(false);
    setMicPublished(false);
    setHeardYou(false);
    setNeedsSound(false);
    setAgentState("initializing");
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

      // Live transcript of both sides (the agent publishes it on the lk.transcription text stream).
      r.registerTextStreamHandler("lk.transcription", async (reader) => {
        const attrs = reader.info.attributes ?? {};
        const who: "You" | "Aangan" = attrs["lk.transcribed_track_id"] ? "You" : "Aangan";
        const id = attrs["lk.segment_id"] ?? reader.info.id;
        let text = "";
        for await (const chunk of reader) {
          text = who === "You" ? chunk : text + chunk; // user segments arrive as full interim text; agent text arrives as deltas
          setTurns((ts) => {
            const prev = ts.find((x) => x.id === id);
            return [...ts.filter((x) => x.id !== id), { id, who, text, final: false, at: prev?.at ?? clock() }].slice(-12);
          });
        }
        setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, final: true } : x)));
        if (who === "You") {
          setHeardYou(true);
          note(`heard you: "${text.slice(0, 60)}"`);
        } else note(`agent said: "${text.slice(0, 60)}"`);
      });

      r.on(RoomEvent.ConnectionStateChanged, (s: ConnectionState) => note(`connection: ${s}`));
      r.on(RoomEvent.ParticipantConnected, (p) => {
        setAgentJoined(true);
        readState(p);
        note(`assistant joined (${p.identity})`);
      });
      r.on(RoomEvent.ParticipantAttributesChanged, (_changed, p) => {
        if (p.isLocal) return;
        const s = p.attributes?.["lk.agent.state"] as AgentState | undefined;
        if (s) {
          setAgentState(s);
          note(`assistant is ${s}`);
        }
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
      r.on(RoomEvent.Disconnected, (reason) => {
        note(`call ended by ${reason === 1 ? "you" : "the server/assistant"}${reason !== undefined ? ` (reason ${reason})` : ""}`);
        setPhase((p) => (p === "error" ? p : "ended"));
      });

      await r.connect(data.connectionUrl, data.token);
      r.remoteParticipants.forEach((p) => {
        setAgentJoined(true);
        readState(p);
      });
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
    note("you ended the call");
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

  // One clear status line for the whole loop: it is always obvious whose turn it is.
  const status: { label: string; tone: string } = muted
    ? { label: "You are muted", tone: "var(--muted)" }
    : agentState === "speaking"
      ? { label: "Aangan is speaking…", tone: "var(--teal)" }
      : agentState === "thinking"
        ? { label: "Aangan is thinking…", tone: "var(--brass)" }
        : agentState === "initializing"
          ? { label: "Aangan is joining…", tone: "var(--muted)" }
          : { label: "Your turn: speak now", tone: "var(--sage)" };

  return (
    <div className="d-card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", color: "var(--ink)" }}>
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
          <div className="d-label" style={{ color: status.tone, fontSize: 14 }}>{status.label}</div>
          <div className="d-kpi" style={{ fontSize: 44 }}>{mm}:{ss}</div>
          <div style={{ height: 10, background: "#e3ebe6", borderRadius: 99, overflow: "hidden", margin: "6px auto 10px", maxWidth: 320 }} aria-label="Microphone level">
            <div style={{ width: `${Math.round(level * 100)}%`, height: "100%", background: "var(--teal)", transition: "width .08s" }} />
          </div>
          <p className="d-note" style={{ marginBottom: 12 }}>
            {tick(agentJoined)} assistant joined · {tick(agentAudio)} hearing the assistant · {tick(micPublished)} microphone sent · {tick(heardYou)} your words understood
          </p>

          <div style={{ textAlign: "left", display: "grid", gap: 8, margin: "0 0 14px", maxHeight: 260, overflow: "auto" }} aria-live="polite">
            {turns.length === 0 && <p className="d-note" style={{ textAlign: "center" }}>The conversation will appear here, turn by turn.</p>}
            {turns.map((t) => (
              <div key={t.id} className={`d-turn ${t.who === "You" ? "caller" : "agent"}`} style={{ maxWidth: "94%", opacity: t.final ? 1 : 0.7 }}>
                <small>{(t.who === "You" ? name || "YOU" : "AANGAN").toUpperCase()} · {t.at}{t.final ? "" : " · …"}</small>
                {t.text}
              </div>
            ))}
            {agentState === "thinking" && <div className="d-turn agent" style={{ opacity: 0.6 }}><small>AANGAN</small>Thinking…</div>}
            <div ref={flowEnd} />
          </div>

          {needsSound && <button className="d-btn brass" style={{ marginBottom: 12 }} onClick={() => room.current?.startAudio().then(() => setNeedsSound(false))} type="button">Enable sound</button>}
          {micPublished && !heardYou && seconds > 8 && <p className="d-alert" style={{ marginBottom: 12 }}>We haven&apos;t understood any speech from you yet. Check your microphone isn&apos;t muted and the right one is selected in your browser, then speak clearly.</p>}
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="d-btn ghost" onClick={toggleMute} type="button">{muted ? "Unmute" : "Mute"}</button>
            <button className="d-btn" style={{ background: "var(--clay)", borderColor: "var(--clay)" }} onClick={end} type="button">End call</button>
          </div>
        </>
      ) : (
        <>
          <h2>Call ended</h2>
          <p className="d-note" style={{ margin: "8px 0 18px" }}>If you gave us your email, a designer will be in touch shortly.</p>
          <button className="d-btn ghost" onClick={() => setPhase("idle")} type="button">Start another call</button>
        </>
      )}
      {log.length > 0 && (
        <details style={{ marginTop: 16, textAlign: "left" }} open={phase === "ended"}>
          <summary className="d-note" style={{ cursor: "pointer" }}>Call flow log (send this to support if something is wrong)</summary>
          <pre className="d-note" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{log.join("\n")}</pre>
        </details>
      )}
    </div>
  );
}
