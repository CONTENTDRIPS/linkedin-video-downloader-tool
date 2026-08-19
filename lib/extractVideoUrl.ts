export type ExtractedVideo = {
  videoUrl: string;
  type: "mp4" | "hls";
};

export class VideoNotFoundError extends Error {
  constructor(message = "No video found on this LinkedIn post") {
    super(message);
    this.name = "VideoNotFoundError";
  }
}

/**
 * LinkedIn does not expose a stable, documented way to get a post's video
 * source. This function tries a few strategies, roughly in order of
 * reliability. Each strategy is independent so a change to one part of
 * LinkedIn's markup doesn't take the others down with it.
 *
 * Known to break when LinkedIn changes markup/JSON shape — if extraction
 * starts failing broadly, re-inspect a real post's page source (view-source)
 * and update the strategies below.
 */
export function extractVideoUrl(html: string): ExtractedVideo {
  const strategies = [
    extractFromVideoDataSources,
    extractFromOgTags,
    extractFromEmbeddedJson,
    extractFromRawHlsOrMp4Scan,
  ];

  for (const strategy of strategies) {
    const result = strategy(html);
    if (result) return result;
  }

  throw new VideoNotFoundError();
}

function classify(url: string): "mp4" | "hls" {
  return url.includes(".m3u8") ? "hls" : "mp4";
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type VideoSource = {
  src?: string;
  type?: string;
  "data-bitrate"?: number;
};

/**
 * Strategy 1: LinkedIn's native video player renders a `data-sources`
 * attribute on the `<video>` element — an HTML-entity-encoded JSON array of
 * `{ src, type, "data-bitrate" }` renditions, e.g.:
 *   data-sources="[{&quot;src&quot;:&quot;https://dms.licdn.com/.../mp4-720p-.../...&quot;,&quot;type&quot;:&quot;video/mp4&quot;,&quot;data-bitrate&quot;:762513}]"
 * This is the primary, most reliable source — confirmed against a real
 * post. Note the URLs don't necessarily end in a literal ".mp4" extension
 * (they're path segments like "mp4-720p-30fp-crf28"), so don't rely on a
 * ".mp4" suffix check alone; use the "type" field.
 */
function extractFromVideoDataSources(html: string): ExtractedVideo | null {
  const videoTagPattern = /<video\b[^>]*\bdata-sources=(["'])([\s\S]*?)\1/gi;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = videoTagPattern.exec(html)) !== null) {
    let sources: VideoSource[];
    try {
      sources = JSON.parse(decodeHtmlEntities(tagMatch[2]));
    } catch {
      continue;
    }

    if (!Array.isArray(sources)) continue;

    const withUrls = sources.filter(
      (s): s is VideoSource & { src: string } => typeof s?.src === "string"
    );
    if (withUrls.length === 0) continue;

    const mp4Sources = withUrls.filter(
      (s) => (s.type ?? "").includes("mp4") || classify(s.src) === "mp4"
    );
    const pool = mp4Sources.length > 0 ? mp4Sources : withUrls;

    // Prefer the highest-bitrate rendition.
    const best = pool.reduce((a, b) =>
      (b["data-bitrate"] ?? 0) > (a["data-bitrate"] ?? 0) ? b : a
    );

    const url = decodeHtmlEntities(best.src);
    return { videoUrl: url, type: classify(url) };
  }

  return null;
}

/**
 * Strategy 2: standard OpenGraph video meta tags. LinkedIn sometimes
 * renders these for public video posts, similar to most sites that support
 * link unfurling.
 */
function extractFromOgTags(html: string): ExtractedVideo | null {
  const metaPatterns = [
    /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
  ];

  for (const pattern of metaPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const url = decodeHtmlEntities(match[1]);
      return { videoUrl: url, type: classify(url) };
    }
  }

  return null;
}

/**
 * Strategy 3: LinkedIn server-renders page state as JSON inside
 * <code style="display: none" id="...datastore-state..."> blocks that get
 * picked up client-side. Video posts carry a media object with fields like
 * "progressiveStreams" (MP4 renditions) or "streamingLocations" (HLS).
 * We don't rely on the exact schema — just scan every embedded JSON blob
 * for plausible video URL fields.
 */
function extractFromEmbeddedJson(html: string): ExtractedVideo | null {
  const codeBlockPattern = /<code[^>]*>([\s\S]*?)<\/code>/gi;
  let match: RegExpExecArray | null;

  const candidates: string[] = [];

  while ((match = codeBlockPattern.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw.startsWith("{") && !raw.startsWith("[")) continue;

    let data: unknown;
    try {
      data = JSON.parse(decodeHtmlEntities(raw));
    } catch {
      continue;
    }

    collectVideoUrls(data, candidates);
  }

  if (candidates.length === 0) return null;

  // Prefer a direct mp4 if we found one; otherwise fall back to whatever
  // we found (likely an HLS manifest).
  const mp4 = candidates.find((url) => classify(url) === "mp4");
  const chosen = mp4 ?? candidates[0];
  return { videoUrl: chosen, type: classify(chosen) };
}

const VIDEO_URL_FIELD_NAMES = new Set([
  "url",
  "progressiveUrl",
  "streamingUrl",
  "masterPlaylist",
]);

function collectVideoUrls(node: unknown, out: string[], depth = 0): void {
  if (depth > 12 || node == null) return;

  if (Array.isArray(node)) {
    for (const item of node) collectVideoUrls(item, out, depth + 1);
    return;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof value === "string" &&
        VIDEO_URL_FIELD_NAMES.has(key) &&
        looksLikeVideoUrl(value)
      ) {
        out.push(value);
      } else {
        collectVideoUrls(value, out, depth + 1);
      }
    }
  }
}

function looksLikeVideoUrl(value: string): boolean {
  return /^https?:\/\//.test(value) && (value.includes(".mp4") || value.includes(".m3u8"));
}

/**
 * Strategy 4: last resort — regex-scan the raw HTML for any URL that looks
 * like a direct mp4 or m3u8 link, in case the video source is embedded
 * somewhere we don't otherwise parse (inline script, data attribute, etc.).
 */
function extractFromRawHlsOrMp4Scan(html: string): ExtractedVideo | null {
  const urlPattern = /https?:\/\/[^\s"'\\<>]+\.(?:mp4|m3u8)(?:\?[^\s"'\\<>]*)?/gi;
  const match = html.match(urlPattern);
  if (!match || match.length === 0) return null;

  const url = decodeHtmlEntities(match[0]);
  return { videoUrl: url, type: classify(url) };
}
