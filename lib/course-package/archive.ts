import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync, type UnzipFileInfo } from "fflate";

import { coursePackageManifestSchema, courseProgressSchema, type CoursePackageManifest, type CourseProgressFile } from "./schema";

// Keep the bundle below the app container's memory budget while supporting one 100 MiB video.
export const COURSE_PACKAGE_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const COURSE_PACKAGE_MAX_UNCOMPRESSED_BYTES = 160 * 1024 * 1024;
export const COURSE_PACKAGE_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const COURSE_PACKAGE_MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
export const COURSE_PACKAGE_MAX_PROGRESS_BYTES = 16 * 1024 * 1024;
export const COURSE_PACKAGE_MAX_ENTRIES = 600;
const CONTENT_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime",
]);

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Read only brands inside a well-formed ISO-BMFF ftyp box at the file start. */
function readIsoBmffFtypBrands(bytes: Uint8Array): string[] | null {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let headerSize = 8;
  let boxSize = view.getUint32(0, false);
  if (boxSize === 1) {
    if (bytes.length < 24) return null;
    const extendedSize = view.getBigUint64(8, false);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    boxSize = Number(extendedSize);
    headerSize = 16;
  }
  const brandsStart = headerSize + 8;
  if (boxSize < brandsStart || boxSize > bytes.length || (boxSize - brandsStart) % 4 !== 0) return null;
  const brands = [ascii(bytes, headerSize, headerSize + 4)];
  for (let offset = brandsStart; offset < boxSize; offset += 4) brands.push(ascii(bytes, offset, offset + 4));
  return brands;
}

/** Validate the declared MIME against the media container signature before storage. */
export function assetSignatureMatches(bytes: Uint8Array, contentType: string): boolean {
  const mime = contentType.toLowerCase().split(";")[0]?.trim();
  if (mime === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/webp") return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  if (mime === "image/gif") return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
  if (mime === "image/avif") {
    const brands = readIsoBmffFtypBrands(bytes);
    return Boolean(brands?.some((brand) => ["avif", "avis"].includes(brand)));
  }
  if (mime === "video/mp4" || mime === "video/quicktime") {
    const brands = readIsoBmffFtypBrands(bytes);
    return Boolean(brands && (mime === "video/quicktime"
      ? brands.includes("qt  ")
      : brands.some((brand) => brand !== "qt  " && /^[A-Za-z0-9 ]{4}$/.test(brand))));
  }
  if (mime === "video/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export type CoursePackageFiles = {
  manifest: CoursePackageManifest;
  assets: Map<string, Uint8Array>;
  progress?: CourseProgressFile;
};

export function validatePackagePath(path: string): boolean {
  if (!path || path.length > 512 || path.includes("\\") || path.includes("\0") || path.startsWith("/")) return false;
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) return false;
  return path === "manifest.json" || path === "progress.json" || /^assets\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,10}$/.test(path);
}

function assetDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createCoursePackageZip(input: CoursePackageFiles): Uint8Array {
  const manifest = coursePackageManifestSchema.parse(input.manifest);
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  if (manifestBytes.byteLength > COURSE_PACKAGE_MAX_MANIFEST_BYTES) throw new Error("Course package manifest is too large");
  const files: Record<string, Uint8Array> = {
    "manifest.json": manifestBytes,
  };
  if (input.progress) {
    const progressBytes = strToU8(JSON.stringify(courseProgressSchema.parse(input.progress), null, 2));
    if (progressBytes.byteLength > COURSE_PACKAGE_MAX_PROGRESS_BYTES) throw new Error("Course package progress is too large");
    files["progress.json"] = progressBytes;
  }
  for (const asset of manifest.assets) {
    const bytes = input.assets.get(asset.path);
    if (!bytes || bytes.byteLength !== asset.size || assetDigest(bytes) !== asset.sha256) throw new Error(`Asset integrity check failed: ${asset.path}`);
    if (!CONTENT_TYPES.has(asset.contentType)) throw new Error(`Unsupported asset content type: ${asset.contentType}`);
    if (!assetSignatureMatches(bytes, asset.contentType)) throw new Error(`Asset content does not match declared type: ${asset.path}`);
    files[asset.path] = bytes;
  }
  if (input.assets.size !== manifest.assets.length) throw new Error("Package contains unexpected asset data");
  const output = zipSync(files, { level: 6 });
  if (output.byteLength > COURSE_PACKAGE_MAX_ARCHIVE_BYTES) throw new Error("Course package archive is too large");
  return output;
}

function decodeJson<T>(bytes: Uint8Array, parse: (value: unknown) => T, label: string): T {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new Error(`${label} is not valid UTF-8 JSON`); }
  return parse(value);
}

export function parseCoursePackageZip(input: Uint8Array): CoursePackageFiles {
  if (!(input instanceof Uint8Array) || input.byteLength < 22 || input.byteLength > COURSE_PACKAGE_MAX_ARCHIVE_BYTES) throw new Error("Course package archive size is invalid");
  let entryCount = 0;
  let uncompressedBytes = 0;
  const filter = (file: UnzipFileInfo) => {
    entryCount++;
    if (entryCount > COURSE_PACKAGE_MAX_ENTRIES) throw new Error("Course package contains too many files");
    if (!validatePackagePath(file.name) || file.name.endsWith("/")) throw new Error(`Unsafe or unsupported archive path: ${file.name}`);
    if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0 || file.originalSize > COURSE_PACKAGE_MAX_FILE_BYTES) throw new Error(`Archive entry is too large: ${file.name}`);
    if (file.name === "manifest.json" && file.originalSize > COURSE_PACKAGE_MAX_MANIFEST_BYTES) throw new Error("Course package manifest is too large");
    if (file.name === "progress.json" && file.originalSize > COURSE_PACKAGE_MAX_PROGRESS_BYTES) throw new Error("Course package progress is too large");
    uncompressedBytes += file.originalSize;
    if (uncompressedBytes > COURSE_PACKAGE_MAX_UNCOMPRESSED_BYTES) throw new Error("Course package expands beyond the allowed size");
    return true;
  };
  let extracted: ReturnType<typeof unzipSync>;
  try { extracted = unzipSync(input, { filter }); }
  catch (error) { throw new Error(error instanceof Error ? error.message : "Could not read course package archive"); }
  const names = Object.keys(extracted);
  if (names.length !== entryCount || !names.includes("manifest.json")) throw new Error("Course package must contain exactly one manifest.json");
  const manifestBytes = extracted["manifest.json"];
  if (!manifestBytes) throw new Error("Course package is missing manifest.json");
  const manifest = decodeJson(manifestBytes, (value) => coursePackageManifestSchema.parse(value), "manifest.json");
  const assets = new Map<string, Uint8Array>();
  for (const asset of manifest.assets) {
    const bytes = extracted[asset.path];
    if (!bytes || bytes.byteLength !== asset.size || assetDigest(bytes) !== asset.sha256) throw new Error(`Asset integrity check failed: ${asset.path}`);
    if (!CONTENT_TYPES.has(asset.contentType)) throw new Error(`Unsupported asset content type: ${asset.contentType}`);
    if (!assetSignatureMatches(bytes, asset.contentType)) throw new Error(`Asset content does not match declared type: ${asset.path}`);
    assets.set(asset.path, bytes);
  }
  const allowedNames = new Set(["manifest.json", ...(names.includes("progress.json") ? ["progress.json"] : []), ...manifest.assets.map((asset) => asset.path)]);
  if (names.some((name) => !allowedNames.has(name))) throw new Error("Course package contains undeclared files");
  const progressBytes = extracted["progress.json"];
  const progress = progressBytes ? decodeJson(progressBytes, (value) => courseProgressSchema.parse(value), "progress.json") : undefined;
  return { manifest, assets, ...(progress ? { progress } : {}) };
}

export function sha256(bytes: Uint8Array): string { return assetDigest(bytes); }
