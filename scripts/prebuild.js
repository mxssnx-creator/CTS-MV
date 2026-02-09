#!/usr/bin/env node

/**
 * Pre-build script for CTS v3.1
 * Aggressively clears all caches before build to prevent stale TypeScript errors
 * Also fixes Turbopack missing file issue
 */

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const rootDir = process.cwd()

console.log("CTS v3.1 Pre-build Cache Clearing...\n")

// Fix Turbopack missing file issue first
console.log("  Fixing Turbopack configuration...")
try {
  execSync("node scripts/fix-turbopack.js", { cwd: rootDir, stdio: "inherit" })
} catch (err) {
  console.log("  ⚠ Could not run Turbopack fix, continuing...")
}

const cacheDirs = [
  path.join(rootDir, ".next"),
  path.join(rootDir, ".turbopack"),
  path.join(rootDir, "node_modules", ".cache"),
  path.join(rootDir, ".turbo"),
  path.join(rootDir, "node_modules", ".vite"),
  path.join(rootDir, ".tsbuildinfo"),
  path.join(rootDir, "node_modules", ".cache", "typescript"),
  path.join(rootDir, ".vercel"),
  path.join(rootDir, ".next", "cache"),
  path.join(rootDir, ".next", "server"),
  path.join(rootDir, ".next", "static"),
]

console.log("  Clearing all build caches...")
for (const dir of cacheDirs) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`    ✓ Cleared ${path.relative(rootDir, dir)}`)
    } catch (err) {
      console.log(`    ⚠ Could not clear ${path.relative(rootDir, dir)}`)
    }
  }
}

const tsBuildInfoFiles = [
  path.join(rootDir, "tsconfig.tsbuildinfo"),
  path.join(rootDir, ".tsbuildinfo"),
  path.join(rootDir, "tsconfig.build.tsbuildinfo"),
  path.join(rootDir, "app", "tsconfig.tsbuildinfo"),
  path.join(rootDir, "lib", "tsconfig.tsbuildinfo"),
  path.join(rootDir, "components", "tsconfig.tsbuildinfo"),
  path.join(rootDir, "hooks", "tsconfig.tsbuildinfo"),
]

console.log("\n  Clearing TypeScript build info files...")
for (const file of tsBuildInfoFiles) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file)
      console.log(`    ✓ Cleared ${path.basename(file)}`)
    } catch (err) {
      // Non-fatal
    }
  }
}

const problematicFiles = [
  path.join(rootDir, ".turbopack-cache-bust.ts"),
  path.join(rootDir, "lib", "configuration-set-manager.ts"),
  path.join(rootDir, "lib", "configuration-set-manager.tsx"),
  path.join(rootDir, "hooks", "use-toast.ts"), // Deprecated, using Sonner now
  path.join(rootDir, "components", "ui", "use-toast.ts"), // Deprecated duplicate
  path.join(rootDir, "components", "ui", "toast.tsx"), // Deprecated
  path.join(rootDir, "components", "ui", "toaster.tsx"), // Deprecated
]

console.log("\n  Removing deprecated/problematic files...")
for (const file of problematicFiles) {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file)
      console.log(`    ✓ Removed ${path.basename(file)}`)
    } catch (err) {
      console.log(`    ⚠ Could not remove ${path.basename(file)}`)
    }
  }
}

console.log("\n  Validating critical modules...")
const criticalFiles = [
  { path: "lib/trade-engine.ts", exports: ["getTradeEngine", "GlobalTradeEngineCoordinator"] },
  { path: "lib/trade-engine/index.ts", exports: ["getTradeEngine"] },
  { path: "components/ui/sonner.tsx", exports: ["Toaster"] },
]

let allValid = true
for (const { path: filePath, exports } of criticalFiles) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    console.log(`    ✗ Missing: ${filePath}`)
    allValid = false
  } else {
    const content = fs.readFileSync(fullPath, "utf-8")
    const missingExports = exports.filter((exp) => !content.includes(exp))
    if (missingExports.length > 0) {
      console.log(`    ⚠ ${filePath} missing exports: ${missingExports.join(", ")}`)
    } else {
      console.log(`    ✓ ${filePath}`)
    }
  }
}

if (!allValid) {
  console.error("\n❌ Critical files missing! Build may fail.\n")
  process.exit(1)
}

console.log("\n✅ Cache cleared successfully! Building...\n")
