# LinkedIn Video Downloader

Paste a public LinkedIn post URL and get back a direct download link for its video.

## Getting started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

1. `app/page.tsx` — client UI: URL input, download button, result/error display.
2. `app/api/extract/route.ts` — server route that validates the URL, fetches
   the LinkedIn post's HTML with a browser-like User-Agent, and calls into
   the parser.
3. `lib/extractVideoUrl.ts` — isolated parsing logic. Tries OpenGraph
   `og:video` tags, then scans LinkedIn's embedded JSON blobs, then falls
   back to a raw regex scan for `.mp4`/`.m3u8` URLs.

v1 only supports direct MP4 sources. If a post's video is only available as
an HLS (`.m3u8`) stream, the API returns a clear "not supported" error
instead of a broken download — stitching HLS segments into a single file
would require a server-side `ffmpeg` step, which is out of scope for now.

## Important caveats

- **This depends on LinkedIn's current page structure.** LinkedIn does not
  publish a stable API for this, and their markup/JSON shape changes over
  time without notice. When extraction starts failing broadly, the fix is to
  inspect a real post's page source (`view-source:`) and update
  `lib/extractVideoUrl.ts` accordingly — it's kept isolated for exactly this
  reason.
- **This may violate LinkedIn's Terms of Service.** Scraping post content,
  even public posts, is very likely against LinkedIn's ToS. LinkedIn also
  actively detects and blocks scraper traffic (rate limiting, IP blocks,
  login walls). Understand your risk tolerance before relying on this for
  anything beyond personal/experimental use.
- **No login, cookies, or auth are used or stored.** This only works against
  posts that are publicly viewable without signing in. Private or
  auth-walled posts will return an error.
- **No video files or user data are stored server-side.** The API is
  stateless aside from an in-memory per-IP rate limit (10 requests/minute),
  which resets on redeploy or cold start — it's a basic v1 safeguard, not a
  hardened rate limiter.

## Deploy

Deploys to [Vercel](https://vercel.com/new) with no additional configuration.
