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
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <main className="w-full max-w-lg">
        <h1 className="mb-2 text-center text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          LinkedIn Video Downloader
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Paste a public LinkedIn post URL to get a direct video download link.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            required
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://www.linkedin.com/posts/..."
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isLoading ? "Working..." : "Download"}
          </button>
        </form>

        <div className="mt-6">
          {result.status === "success" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
              <p className="mb-2 text-green-800 dark:text-green-300">Video found.</p>
              <a
                href={result.videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md bg-green-700 px-4 py-2 text-white hover:bg-green-800"
              >
                Download video
              </a>
            </div>
          )}

          {result.status === "error" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {result.message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
