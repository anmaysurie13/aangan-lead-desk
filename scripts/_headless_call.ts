/**
 * Headless test of the LIVE /talk flow: calls the production /api/talk/start with a name, joins the room, speaks a
 * synthetic sentence, prints the lk.transcription captions (exactly what the page shows) and when the agent talks.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, TrackPublishOptions, TrackSource, RoomEvent } from "@livekit/rtc-node";

const SR = 48000;
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

(async () => {
  const res = await fetch("https://aangan-lead-desk-hazel.vercel.app/api/talk/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: "en", name: "Priya" }) });
  const s = await res.json();
  if (!res.ok) throw new Error(`start failed: ${JSON.stringify(s)}`);
  console.log(at(), "session", s.roomName);
  const room = new Room();
  room.registerTextStreamHandler("lk.transcription", async (reader) => {
    const attrs = reader.info.attributes ?? {};
    const who = attrs["lk.transcribed_track_id"] ? "YOU   " : "AANGAN";
    let text = "";
    for await (const chunk of reader) text += chunk;
    if (attrs["lk.transcription_final"] === "true" || who === "AANGAN") console.log(at(), `caption ${who}: ${text}`);
  });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    void (async () => { for await (const _ of new AudioStream(track) as unknown as AsyncIterable<unknown>) { void _; } })();
  });
  await room.connect(s.connectionUrl.replace(/^http/, "ws"), s.token, { autoSubscribe: true, dynacast: false });
  const source = new AudioSource(SR, 1);
  const track = LocalAudioTrack.createAudioTrack("mic", source);
  const opts = new TrackPublishOptions();
  opts.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant!.publishTrack(track, opts);

  const wav = fs.readFileSync(path.join(__dirname, "_say.wav"));
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength));
  const f = SR / 100;
  const send = async (x: Int16Array) => {
    for (let i = 0; i < x.length; i += f) {
      const chunk = new Int16Array(f);
      chunk.set(x.subarray(i, i + f));
      await source.captureFrame(new AudioFrame(chunk, SR, 1, f));
    }
  };
  await send(new Int16Array(SR * 11));
  console.log(at(), ">>> I speak now");
  await send(pcm);
  console.log(at(), ">>> done speaking; listening");
  await send(new Int16Array(SR * 16));
  await room.disconnect();
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
