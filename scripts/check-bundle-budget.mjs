#!/usr/bin/env node
// Bundle budget guard for the production build.
//
// Asserts two things about the JS emitted into build/assets:
//   1. More than one JS chunk exists (i.e. code-splitting actually happened).
//   2. The entry chunk (index-*.js) stays under MAX_ENTRY_BYTES.
//
// The entry chunk used to be a single ~566 kB bundle. After splitting out the
// vendor / boardgame.io / fx chunks and lazy-loading heavy components it drops
// to ~210 kB, so the threshold below leaves headroom while still catching a
// regression back toward the old monolith.

import {readdirSync, statSync} from "node:fs";
import {join} from "node:path";

const ASSETS_DIR = join("build", "assets");
const MAX_ENTRY_BYTES = 350 * 1024; // 358400

function fail(msg) {
    console.error(`bundle-budget: FAIL — ${msg}`);
    process.exit(1);
}

let files;
try {
    files = readdirSync(ASSETS_DIR);
} catch {
    fail(`cannot read ${ASSETS_DIR}; run "npm run build" first`);
}

const jsChunks = files.filter((f) => f.endsWith(".js"));
if (jsChunks.length <= 1) {
    fail(`expected more than one JS chunk, found ${jsChunks.length}: ${jsChunks.join(", ")}`);
}

const entry = jsChunks.find((f) => f.startsWith("index-"));
if (!entry) {
    fail(`could not find entry chunk (index-*.js) among: ${jsChunks.join(", ")}`);
}

const entryBytes = statSync(join(ASSETS_DIR, entry)).size;
const kib = (n) => (n / 1024).toFixed(1) + " kB";

if (entryBytes >= MAX_ENTRY_BYTES) {
    fail(`entry chunk ${entry} is ${kib(entryBytes)}, over budget ${kib(MAX_ENTRY_BYTES)}`);
}

console.log(`bundle-budget: PASS — ${jsChunks.length} JS chunks; entry ${entry} ${kib(entryBytes)} < ${kib(MAX_ENTRY_BYTES)}`);
