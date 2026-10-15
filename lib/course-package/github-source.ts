import { COURSE_PACKAGE_MAX_ARCHIVE_BYTES } from "./archive";

export function githubRawBundleUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid GitHub bundle URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) throw new Error("Only plain HTTPS GitHub file URLs are supported");
  const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\") || segment.includes("\0"))) throw new Error("Invalid GitHub URL path");
  if (url.hostname === "github.com") {
    if (segments.length < 5 || !/^[A-Za-z0-9_.-]+$/.test(segments[0]) || !/^[A-Za-z0-9_.-]+$/.test(segments[1]) || !["blob", "raw"].includes(segments[2])) throw new Error("Expected a GitHub file URL (blob or raw)");
    const ref = segments[3];
    const path = segments.slice(4);
    if (!ref || path.length === 0 || path.some((part) => !part)) throw new Error("Expected a GitHub file URL (blob or raw)");
    return `https://raw.githubusercontent.com/${segments[0]}/${segments[1]}/${[ref, ...path].map(encodeURIComponent).join("/")}`;
  }
  if (url.hostname === "raw.githubusercontent.com" && segments.length >= 4 && /^[A-Za-z0-9_.-]+$/.test(segments[0]) && /^[A-Za-z0-9_.-]+$/.test(segments[1])) {
    return `https://raw.githubusercontent.com/${segments.map(encodeURIComponent).join("/")}`;
  }
  throw new Error("Only github.com blob/raw and raw.githubusercontent.com file URLs are supported");
}

export async function readBoundedBody(response: { headers: Headers; body: ReadableStream<Uint8Array> | null }, limit = COURSE_PACKAGE_MAX_ARCHIVE_BYTES): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) throw new Error("Course package download exceeds the size limit");
  if (!response.body) throw new Error("Course package response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Course package download exceeds the size limit"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function fetchGithubCourseBundle(value: string): Promise<Uint8Array> {
  const url = githubRawBundleUrl(value);
  const response = await fetch(url, { redirect: "error", cache: "no-store", headers: { accept: "application/octet-stream" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return readBoundedBody(response);
}
