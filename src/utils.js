import { FORMAT_THRESHOLDS, REDGIFS_BASE } from "./constants.js";

export function formatNumber(num) {
  for (const { limit, suffix, divisor } of FORMAT_THRESHOLDS) {
    if (num >= limit) return (num / divisor).toFixed(1) + suffix;
  }
  return num;
}

export function extractRedgifsId(url) {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/");
    const last = parts.pop() || parts.pop();
    return last
      .replace("-mobile", "")
      .replace(".jpg", "")
      .replace(".mp4", "")
      .split("-")[0];
  } catch {
    return null;
  }
}

export function safeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function decodeHtmlEntities(text) {
  if (!text) return "";
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function buildRedgifsResult(url) {
  const id = extractRedgifsId(url);
  if (!id) return null;
  const source = safeUrl(REDGIFS_BASE + id + "-mobile.mp4");
  const poster = safeUrl(REDGIFS_BASE + id + "-mobile.jpg");
  if (!source || !poster) return null;
  return {
    type: "video",
    source,
    poster,
    sources: [
      {
        src: source,
        type: "video/mp4",
      },
    ],
    hlsSource: null,
  };
}

export function sanitizeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeEmbedHtml(html) {
  if (!html) return "";
  const container = document.createElement("div");
  container.innerHTML = decodeHtmlEntities(String(html));
  const iframe = container.querySelector("iframe");
  if (!iframe) return "";

  const src = safeUrl(iframe.getAttribute("src"));
  if (!src) return "";

  const title = sanitizeText(iframe.getAttribute("title") || "Embedded content");
  return `<iframe src="${sanitizeText(src)}" title="${title}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-presentation" allowfullscreen></iframe>`;
}

export function parseMarkdown(text) {
  if (!text) return "";
  const decoded = decodeHtmlEntities(String(text));
  // Strip markdown image / giphy placeholders: ![alt](url)
  const stripped = decoded.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Escape HTML-unsafe chars but keep bare `&` (HTML5 tolerates it and tests rely on decoded entities passing through).
  const escaped = stripped
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return escaped.replace(/\n/g, "<br>");
}

export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const now = Date.now() / 1000;
  const seconds = now - timestamp;

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(days / 365);
  return `${years}y`;
}
