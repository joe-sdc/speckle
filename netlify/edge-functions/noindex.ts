import type { Config, Context } from "@netlify/edge-functions";

/*
 * When the admin switches "No-index" on (the default), every page and file gets
 * an X-Robots-Tag header, and HTML pages also get a robots meta tag, so search
 * engines don't list the site. The switch is read from /api/seo and remembered
 * for 30 seconds. If it can't be read, the site stays hidden.
 */

let cached: { noindex: boolean; at: number } | null = null;

async function isNoindex(request: Request): Promise<boolean> {
  if (cached && Date.now() - cached.at < 30_000) return cached.noindex;
  let noindex = true;
  try {
    const res = await fetch(new URL("/api/seo", request.url), { headers: { "cache-control": "no-cache" } });
    if (res.ok) noindex = (await res.json()).noindex !== false;
    else if (cached) noindex = cached.noindex;
  } catch {
    if (cached) noindex = cached.noindex;
  }
  cached = { noindex, at: Date.now() };
  return noindex;
}

export default async (request: Request, context: Context) => {
  const response = await context.next();
  if (!(await isNoindex(request))) return response;

  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex, nofollow");

  if ((headers.get("content-type") || "").includes("text/html")) {
    const html = await response.text();
    const tag = '<meta name="robots" content="noindex, nofollow">';
    const out = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, tag + "</head>") : html;
    headers.delete("content-length");
    return new Response(out, { status: response.status, statusText: response.statusText, headers });
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const config: Config = { path: "/*", excludedPath: ["/api/*"] };
