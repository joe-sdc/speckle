import { getStore } from "@netlify/blobs";

/*
 * Public
 *   GET  /api/settings      The shared word if one is active, plus which word list is loaded.
 *   GET  /api/list          The loaded word list (words and notes), for the game.
 * Admin (Authorization: Bearer <ADMIN_PASSWORD>)
 *   GET  /api/settings      Also checks the password; adds start time and length.
 *   POST /api/settings      { word, hours } sets the shared word, { clear: true } ends it early.
 *   GET  /api/admin/lists   Every list: the main list (if edited) and all Speckle Specials.
 *   POST /api/admin/lists   { action: "save" | "create" | "delete" | "activate" | "resetMain", ... }
 *
 * The admin password is the ADMIN_PASSWORD environment variable (scope: Functions).
 */

type Setting = { id: string; word: string; start: number; end: number; hours: number };
type Words = Record<string, string>;
type List = { name: string; description?: string; words: Words; created?: number };
type Lists = { version: string; active: string; main: List | null; specials: Record<string, List> };

const MAX_WORDS = 5000;
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
  if (sameText(header.replace(/^Bearer\s+/i, ""), expected)) return "ok";
  await sleep(900); // slows down password guessing
  return "bad";
}

async function currentWord(): Promise<Setting | null> {
  const s = (await store().get("current", { type: "json" })) as Setting | null;
  return s && s.end > Date.now() ? s : null;
}

async function readLists(): Promise<Lists> {
  const l = (await store().get("lists", { type: "json" })) as Lists | null;
  return l ?? { version: "", active: "main", main: null, specials: {} };
}
async function writeLists(l: Lists) {
  l.version = Date.now().toString(36);
  await store().setJSON("lists", l);
}

/* The loaded list, or null when the game should use its built-in main list. */
function activeList(l: Lists): { id: string; name: string | null; words: Words } | null {
  if (l.active !== "main" && l.specials[l.active]) {
    const s = l.specials[l.active];
    return { id: l.active, name: s.name, words: s.words };
  }
  return l.main ? { id: "main", name: null, words: l.main.words } : null;
}

function cleanWords(input: unknown): Words | string {
  if (!input || typeof input !== "object") return "Send the words as { word: note }.";
  const out: Words = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const w = k.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(w)) return `"${k}" is not a five-letter word.`;
    out[w] = String(v ?? "").trim().slice(0, 240);
  }
  const n = Object.keys(out).length;
  if (n === 0) return "A list needs at least one word.";
  if (n > MAX_WORDS) return `A list can hold up to ${MAX_WORDS} words.`;
  return out;
}

function slug(name: string, taken: Record<string, unknown>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "special";
  let id = base === "main" ? "main-special" : base;
  for (let i = 2; taken[id]; i++) id = `${base}-${i}`;
  return id;
}

async function settings(req: Request, auth: string) {
  if (req.method === "GET") {
    const [s, l] = await Promise.all([currentWord(), readLists()]);
    const list = activeList(l);
    const base = {
      active: !!s, id: s?.id, word: s?.word, end: s?.end, now: Date.now(),
      list: list ? { id: list.id, name: list.name, version: l.version + ":" + list.id } : null,
    };
    return reply(auth === "ok" ? { ...base, start: s?.start, hours: s?.hours } : base);
  }
  if (auth !== "ok") return reply({ error: "Sign in as admin first." }, 401);
  let body: { word?: unknown; hours?: unknown; clear?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Send JSON." }, 400); }
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
  const s: Setting = { id: "admin-" + start, word, start, end: start + Math.round(hours * 3600 * 1000), hours };
  await store().setJSON("current", s);
  return reply({ active: true, id: s.id, word, start, end: s.end, hours, now: Date.now() });
}

async function publicList() {
  const l = await readLists();
  const list = activeList(l);
  if (!list) return reply({ id: "main", name: null, version: null, words: null });
  return reply({ ...list, version: l.version + ":" + list.id });
}

async function adminLists(req: Request) {
  const l = await readLists();
  if (req.method === "GET") return reply(l);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Send JSON." }, 400); }
  const id = String(body.id ?? "");
  const name = String(body.name ?? "").trim().slice(0, 60);
  const description = String(body.description ?? "").trim().slice(0, 240);

  switch (body.action) {
    case "save": {
      const words = cleanWords(body.words);
      if (typeof words === "string") return reply({ error: words }, 400);
      if (id === "main") l.main = { name: "Main list", words };
      else if (l.specials[id]) l.specials[id] = { ...l.specials[id], name: name || l.specials[id].name, description, words };
      else return reply({ error: "That list no longer exists." }, 404);
      break;
    }
    case "create": {
      if (!name) return reply({ error: "Give the special a name." }, 400);
      const words = cleanWords(body.words);
      if (typeof words === "string") return reply({ error: words }, 400);
      const newId = slug(name, l.specials);
      l.specials[newId] = { name, description, words, created: Date.now() };
      await writeLists(l);
      return reply({ ...l, created: newId });
    }
    case "delete":
      if (!l.specials[id]) return reply({ error: "That list no longer exists." }, 404);
      delete l.specials[id];
      if (l.active === id) l.active = "main";
      break;
    case "activate":
      if (id !== "main" && !l.specials[id]) return reply({ error: "That list no longer exists." }, 404);
      l.active = id;
      break;
    case "resetMain":
      l.main = null;
      break;
    default:
      return reply({ error: "Unknown action." }, 400);
  }
  await writeLists(l);
  return reply(l);
}

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const auth = await check(req);
  if (auth === "unconfigured") return reply({ error: "ADMIN_PASSWORD has not been set for this site." }, 503);
  if (auth === "bad") return reply({ error: "Wrong password." }, 401);

  if (path === "/api/list") return publicList();
  if (path === "/api/admin/lists") {
    if (auth !== "ok") return reply({ error: "Sign in as admin first." }, 401);
    return adminLists(req);
  }
  return settings(req, auth);
};

export const config = { path: ["/api/settings", "/api/list", "/api/admin/lists"], method: ["GET", "POST"] };
