/**
 * Runs the LIVE /talk page in a real Chrome with a fake microphone that plays scripts/_say.wav,
 * then prints the flow log and conversation exactly as a caller would see them.
 */
import path from "node:path";
import { chromium } from "playwright-core";

(async () => {
  const wav = path.join(__dirname, "_say.wav");
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  const t0 = Date.now();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log(`[console ${m.type()}]`, m.text().slice(0, 200)); });
  await page.goto("https://aangan-lead-desk-hazel.vercel.app/talk");
  await page.getByPlaceholder("Your name").fill("Priya");
  await page.getByRole("button", { name: "Start voice call" }).click();
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(5000);
    const status = await page.locator(".d-label").first().innerText().catch(() => "(no status)");
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s status:`, status.replace(/\s+/g, " "));
  }
  console.log("\n--- conversation on screen ---");
  console.log((await page.locator(".d-turn").allInnerTexts()).join("\n"));
  await page.locator("details summary").first().click().catch(() => undefined);
  console.log("\n--- flow log ---");
  console.log(await page.locator("details pre").first().innerText().catch(() => "(no log)"));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
