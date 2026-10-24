// Use this before the server fetches any URL a user supplied (scrapers, link
// previews, webhooks, imports). It rejects what an attacker would aim a
// server-side request at: non-http schemes, localhost, private and link-local
// ranges, and bare IP literals. It checks the hostname text only, so it does
// not stop DNS rebinding: for high-risk fetches also resolve the name and check
// the resulting IP.

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^255\./,
];
const PRIVATE_HOSTS = new Set(["localhost", "localhost.localdomain"]);

export function validateUrlSecurity(raw: unknown): URL | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host)) return null;
  if (host.startsWith("[")) return null; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // IPv4 literal
  if (PRIVATE_IPV4.some((block) => block.test(host))) return null;
  return url;
}

/** Same, plus the host must be on an allowlist (exact match or a subdomain). */
export function validateAllowedUrl(raw: unknown, allowedHosts: string[]): string | null {
  const url = validateUrlSecurity(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const ok = allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  return ok ? url.toString() : null;
}
