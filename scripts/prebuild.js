#!/usr/bin/env node

/**
 * Pre-build script for CTS v3.1
 * Clears caches before build
 */

const fs = require("fs")
const path = require("path")

const rootDir = process.cwd()

const cacheDirs = [
  path.join(rootDir, ".next"),
  path.join(rootDir, ".turbopack"),
  path.join(rootDir, "node_modules", ".cache"),
  path.join(rootDir, ".turbo"),
  path.join(rootDir, ".tsbuildinfo"),
]

for (const dir of cacheDirs) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      // Continue even if delete fails
    }
  }
}

console.log("[v0] Pre-build cache clearing complete")
process.exit(0)
