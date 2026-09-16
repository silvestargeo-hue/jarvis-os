/**
 * A-to-Z browser test against a running JARVIS OS instance.
 * Verifies the exact user journey: auth → dashboard → AI panel → real answer.
 * Run: BASE_URL=http://localhost:3100 node scripts/e2e-browser.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const failures = [];

function ok(label) {
  console.log(`  ✅ ${label}`);
}
function fail(label, err) {
  failures.push(label);
  console.log(`  ❌ ${label}: ${err}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const failedResponses = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});
page.on("response", (r) => {
  if (r.status() >= 400) failedResponses.push(`${r.status()} ${r.url().slice(0, 120)}`);
});

try {
  // 1. Auth page loads and guest login works
  console.log("\n[1/5] AUTH → GUEST LOGIN");
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  const guestBtn = page.getByText("CONTINUE AS GUEST");
  if ((await guestBtn.count()) === 0) throw new Error("guest button not found");
  await guestBtn.click();
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  ok("guest login → /dashboard");

  // 2. Dashboard renders panels (not stuck on INITIALIZING)
  console.log("\n[2/5] DASHBOARD RENDER");
  await page.waitForTimeout(1500);
  const init = await page.getByText("INITIALIZING DECK").count();
  const briefing = await page.getByText("MORNING BRIEFING").count();
  const modules = await page.getByText("AI TERMINAL").count();
  if (init > 0) throw new Error("stuck on INITIALIZING DECK");
  if (briefing === 0) throw new Error("briefing panel missing");
  if (modules === 0) throw new Error("modules panel missing");
  ok("command deck renders (briefing + modules panels live)");

  // 3. AI panel opens — THE critical regression test
  console.log("\n[3/5] AI PANEL OPENS");
  await page.goto(`${BASE}/dashboard/ai`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (page.url().includes("/auth")) throw new Error("BOUNCED TO /auth (the old bug)");
  await page.waitForSelector('textarea[placeholder*="directive"]', { timeout: 15000 });
  ok("AI terminal stays open with composer (no /auth bounce)");

  // 4. Send a real message, expect a real streamed answer
  console.log("\n[4/5] AI ANSWER ROUND-TRIP");
  await page.fill('textarea[placeholder*="directive"]', "Reply with exactly: SYSTEMS NOMINAL");
  await page.keyboard.press("Enter");
  // Wait for the user bubble to confirm the send path works
  try {
    await page.waitForFunction(() => document.body.innerText.includes("SYSTEMS NOMINAL"), undefined, {
      timeout: 20000,
    });
    ok("message sent, user bubble shows");
  } catch {
    const note = await page.locator("p.truncate").last().innerText().catch(() => "(no engine note)");
    const body = (await page.evaluate(() => document.body.innerText)).slice(0, 600);
    fail("send", `user bubble never appeared — engine note: ${note} | failed responses: ${failedResponses.slice(0, 8).join(" ; ")} | console: ${consoleErrors.slice(0, 5).join(" || ")}`);
    throw new Error("stop");
  }
  // Then wait up to 2 min for the assistant answer (stream can be slow)
  let answered = false;
  try {
    await page.waitForFunction(
      () => /SYSTEMS\s*NOMINAL/.test(document.body.innerText) &&
        document.querySelectorAll("p.whitespace-pre-wrap").length >= 2,
      undefined,
      { timeout: 120000 }
    );
    answered = true;
    ok("AI streamed a real answer back");
  } catch {
    const note = await page.locator("p.truncate").last().innerText().catch(() => "(no engine note)");
    fail("AI answer", `no assistant reply — engine note: ${note}`);
  }

  // 5. Library page loads (Convex-backed module)
  console.log("\n[5/5] LIBRARY MODULE");
  await page.goto(`${BASE}/dashboard/library`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  if (page.url().includes("/auth")) throw new Error("library bounced to /auth");
  ok("library module opens");

  // Console error audit — hydration crashes kill interactivity silently
  const fatal = consoleErrors.filter(
    (e) =>
      e.includes("Minified React error") ||
      e.includes("Hydration") ||
      e.includes("process is not defined") ||
      e.includes("undefined is not an object") ||
      e.includes("Cannot read properties")
  );
  if (fatal.length) fail("console", fatal.slice(0, 3).join(" | "));
  else ok(`no fatal console errors (${consoleErrors.length} benign)`);
} catch (e) {
  fail("journey", e.message);
  try {
    await page.screenshot({ path: "/tmp/jarvis-e2e-fail.png", fullPage: true });
    console.log("  📸 screenshot: /tmp/jarvis-e2e-fail.png");
  } catch {}
} finally {
  await browser.close();
}

console.log(failures.length ? `\nFAILED: ${failures.join(", ")}\n` : "\nALL CHECKS PASSED — A TO Z\n");
process.exit(failures.length ? 1 : 0);
