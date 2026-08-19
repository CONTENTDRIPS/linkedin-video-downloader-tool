import { NextRequest, NextResponse } from "next/server";
import { extractVideoUrl, VideoNotFoundError } from "@/lib/extractVideoUrl";

// Simple in-memory per-IP rate limiter. Resets on redeploy/cold start —
// fine for a v1, not a substitute for a real rate limiter (e.g. Upstash)
// if this ever needs to hold up under abuse.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

const LINKEDIN_POST_URL_PATTERN =
  /^https:\/\/(www\.)?linkedin\.com\/(posts|feed\/update)\//i;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const linkedinUrl = (body as { linkedinUrl?: unknown })?.linkedinUrl;

  if (typeof linkedinUrl !== "string" || !LINKEDIN_POST_URL_PATTERN.test(linkedinUrl)) {
    return NextResponse.json(
      {
        error:
          "Please enter a valid LinkedIn post URL (e.g. https://www.linkedin.com/posts/...)",
      },
      { status: 400 }
    );
  }

  let html: string;
  try {
    const response = await fetch(linkedinUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
      },
      redirect: "follow",
    });

    if (response.status === 999 || response.status === 403) {
      return NextResponse.json(
        { error: "LinkedIn blocked this request. Try again later." },
        { status: 502 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not load that post (LinkedIn returned ${response.status}).` },
        { status: 502 }
      );
    }

    html = await response.text();
  } catch {
    return NextResponse.json(
      { error: "Network error while fetching the LinkedIn post." },
      { status: 502 }
    );
  }

  if (html.includes("authwall") || html.includes("/login")) {
    return NextResponse.json(
      { error: "This post requires a LinkedIn login to view and can't be accessed." },
      { status: 403 }
    );
  }

  try {
    const { videoUrl, type } = extractVideoUrl(html);

    if (type === "hls") {
      return NextResponse.json(
        {
          error:
            "This post's video is only available as an HLS stream, which isn't supported yet.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ videoUrl, type });
  } catch (err) {
    if (err instanceof VideoNotFoundError) {
      return NextResponse.json(
        { error: "No video was found on that post. It may not contain a video, or it may be private." },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: "Unexpected error while parsing the post." }, { status: 500 });
  }
}
