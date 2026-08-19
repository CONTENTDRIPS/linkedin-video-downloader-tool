import { NextRequest, NextResponse } from "next/server";
import { extractVideoUrl, VideoNotFoundError } from "@/lib/extractVideoUrl";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";

const LINKEDIN_POST_URL_PATTERN =
  /^https:\/\/((www\.)?linkedin\.com\/(posts|feed\/update)\/|lnkd\.in\/)/i;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

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

    // LinkedIn redirects (not just links) to /authwall when a post actually
    // requires login. Note: public post pages routinely contain "/login"
    // links in their nav/comment-report menus even when fully accessible —
    // don't treat that substring as a signal, it's a false positive.
    if (new URL(response.url).pathname.startsWith("/authwall")) {
      return NextResponse.json(
        { error: "This post requires a LinkedIn login to view and can't be accessed." },
        { status: 403 }
      );
    }

    html = await response.text();
  } catch {
    return NextResponse.json(
      { error: "Network error while fetching the LinkedIn post." },
      { status: 502 }
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
