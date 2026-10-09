/**
 * One-off, reproducible: splits evals/source-transcripts.txt (text of "Aangan_Sep 2026_Enquiries.pdf")
 * into one fixture per phone call. Staff "Note:" annotations are stripped: a real call transcript
 * would not contain them, so the scorer must reach its verdict from the conversation alone.
 * T17 (dropped call) becomes two files so the eval exercises the merge path.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "evals", "source-transcripts.txt"), "utf8").replace(/\r\n/g, "\n");
const phone = src.slice(src.indexOf("SECTION 1"), src.indexOf("SECTION 2"));
const outDir = path.join(root, "evals", "fixtures");
fs.mkdirSync(outDir, { recursive: true });

const SPEAKER = /^(Front Desk|Caller)\s*:/;
const blocks = phone.split(/\n(?=T\d{2} · Phone)/).filter((b) => /^T\d{2} · Phone/.test(b));

function clean(lines: string[]): string {
  const out: string[] = [];
  let inNote = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { inNote = false; continue; }
    if (/^Note:/i.test(line)) { inNote = true; continue; }
    if (inNote && !SPEAKER.test(line)) continue;
    inNote = false;
    out.push(line);
  }
  return out.join("\n") + "\n";
}

const index: Record<string, { header: string; files: string[] }> = {};
for (const block of blocks) {
  const [header, ...rest] = block.split("\n");
  const id = header.slice(0, 3);
  if (/MISSED CALL/.test(header)) { index[id] = { header: header.trim(), files: [] }; continue; }
  if (id === "T17") {
    const body = rest.join("\n");
    const second = body.indexOf("Second call");
    const parts = [body.slice(0, second), body.slice(body.indexOf("\n", second))];
    const files = parts.map((p, i) => {
      const f = `T17${"ab"[i]}.txt`;
      fs.writeFileSync(path.join(outDir, f), clean(p.split("\n").filter((l) => !/^First call/.test(l.trim()))));
      return f;
    });
    index[id] = { header: header.trim(), files };
    continue;
  }
  fs.writeFileSync(path.join(outDir, `${id}.txt`), clean(rest));
  index[id] = { header: header.trim(), files: [`${id}.txt`] };
}
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
console.log(Object.entries(index).map(([k, v]) => `${k}: ${v.files.join(", ") || "(no content)"}`).join("\n"));
