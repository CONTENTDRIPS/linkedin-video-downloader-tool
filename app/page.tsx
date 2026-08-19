"use client";

import { useState, FormEvent } from "react";

type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; videoUrl: string }
  | { status: "error"; message: string };

export default function Home() {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [result, setResult] = useState<Result>({ status: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setResult({ status: "loading" });

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ status: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      setResult({ status: "success", videoUrl: data.videoUrl });
    } catch {
      setResult({ status: "error", message: "Network error. Please try again." });
    }
  }

  const isLoading = result.status === "loading";

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white px-4">
      <main className="w-full max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-[#426bff]">
              Contentdrips LinkedIn Video Downloader
            </label>
            <input
              type="url"
              required
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#426bff]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-[#426bff] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3557d6] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Working..." : "Download"}
          </button>
        </form>

        <div className="mt-6">
          {result.status === "success" && (
            <div className="rounded-lg border border-[#426bff]/20 bg-[#426bff]/5 p-4 text-sm">
              <p className="mb-2 text-[#426bff]">Video found.</p>
              <a
                href={`/api/download?url=${encodeURIComponent(result.videoUrl)}`}
                download="linkedin-video.mp4"
                className="inline-block rounded-md bg-[#426bff] px-4 py-2 text-white hover:bg-[#3557d6]"
              >
                Download video
              </a>
            </div>
          )}

          {result.status === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {result.message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
