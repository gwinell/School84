#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI needs require.extensions to load the authoritative TypeScript parser. */

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load the authoritative TypeScript package parser directly. This only adds a
// small CommonJS TypeScript loader; archive/schema validation stays in lib/.
require.extensions[".ts"] = (loadedModule, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const javascript = ts.transpile(source, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  });
  loadedModule._compile(javascript, filename);
};

const { COURSE_PACKAGE_MAX_ARCHIVE_BYTES, parseCoursePackageZip } = require("../lib/course-package/archive.ts");

function main() {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    process.stderr.write("Usage: pnpm course-package:validate <course.s84course|course.zip>\n");
    process.exitCode = 2;
    return;
  }

  try {
    const filename = path.resolve(input);
    const stat = fs.statSync(filename);
    if (!stat.isFile()) throw new Error("Input path is not a file");
    if (stat.size > COURSE_PACKAGE_MAX_ARCHIVE_BYTES) throw new Error("Course package archive size is invalid");
    const parsed = parseCoursePackageZip(new Uint8Array(fs.readFileSync(filename)));
    const chapters = parsed.manifest.chapters;
    const lessonCount = chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
    const cellCount = chapters.reduce((total, chapter) => total + chapter.lessons.reduce((lessons, lesson) => lessons + lesson.cells.length, 0), 0);
    process.stdout.write(`Valid SchoolSphere course package\n`);
    process.stdout.write(`Course: ${parsed.manifest.course.title}\n`);
    process.stdout.write(`Format: ${parsed.manifest.format} v${parsed.manifest.formatVersion}\n`);
    process.stdout.write(`Chapters: ${chapters.length}; lessons: ${lessonCount}; cells: ${cellCount}; assets: ${parsed.assets.size}\n`);
    if (parsed.progress) process.stdout.write("Progress data: present (review privacy before sharing)\n");
  } catch (error) {
    process.stderr.write(`Invalid course package: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

main();
