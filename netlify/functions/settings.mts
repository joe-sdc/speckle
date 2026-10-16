import { getStore } from "@netlify/blobs";

/*
 * GET  /api/settings              Public. Returns the shared word if the admin has set one that is still active.
 * GET  /api/settings  + password  Admin sign-in check. Also returns start time and length.
 * POST /api/settings  + password  { word, hours } sets the shared word, { clear: true } ends it early.
 *
 * The admin password is the ADMIN_PASSWORD environment variable (scope: Functions).
 */

type Setting = { id: string; word: string; start: number; end: number; hours: number };

const store = () => getStore({ name: "speckle-settings", consistency: "strong" });

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function check(req: Request): Promise<"none" | "ok" | "bad" | "unconfigured"> {
  const header = req.headers.get("authorization");
  if (!header) return "none";
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  if (!expected) return "unconfigured";
  const given = header.replace(/^Bearer\s+/i, "");
  if (sameText(given, expected)) return "ok";
  await sleep(900); // slows down password guessing
  return "bad";
}

async function current(): Promise<Setting | null> {
  const s = (await store().get("current", { type: "json" })) as Setting | null;
  return s && s.end > Date.now() ? s : null;
}

export default async (req: Request) => {
  const auth = await check(req);
  if (auth === "unconfigured") return reply({ error: "ADMIN_PASSWORD has not been set for this site." }, 503);
  if (auth === "bad") return reply({ error: "Wrong password." }, 401);

  if (req.method === "GET") {
    const s = await current();
    const base = { active: !!s, id: s?.id, word: s?.word, end: s?.end, now: Date.now() };
    return reply(auth === "ok" ? { ...base, start: s?.start, hours: s?.hours } : base);
  }

  if (req.method === "POST") {
    if (auth !== "ok") return reply({ error: "Sign in as admin first." }, 401);
    let body: { word?: unknown; hours?: unknown; clear?: unknown };
    try {
      body = await req.json();
    } catch {
      return reply({ error: "Send JSON." }, 400);
    }
    if (body.clear === true) {
      await store().delete("current");
      return reply({ active: false, now: Date.now() });
    }
    const word = String(body.word ?? "").toLowerCase();
    const hours = Number(body.hours);
    if (!/^[a-z]{5}$/.test(word)) return reply({ error: "The word must be five letters." }, 400);
    if (!Number.isFinite(hours) || hours < 0.25 || hours > 24 * 30) {
      return reply({ error: "Choose a length between 15 minutes and 30 days." }, 400);
    }
    const start = Date.now();
    const setting: Setting = { id: "admin-" + start, word, start, end: start + Math.round(hours * 3600 * 1000), hours };
    await store().setJSON("current", setting);
    return reply({ active: true, id: setting.id, word, start, end: setting.end, hours, now: Date.now() });
  }

  return reply({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/settings", method: ["GET", "POST"] };
