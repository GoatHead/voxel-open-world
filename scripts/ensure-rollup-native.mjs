import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"

const require = createRequire(import.meta.url)

function isMusl() {
  if (process.platform !== "linux") {
    return false
  }

  try {
    const report = process.report?.getReport?.()
    const glibc = report?.header?.glibcVersionRuntime
    return !glibc
  } catch {
    return false
  }
}

function getRollupNativePackage() {
  const { platform, arch } = process

  if (platform === "linux" && arch === "x64") {
    return isMusl() ? "@rollup/rollup-linux-x64-musl" : "@rollup/rollup-linux-x64-gnu"
  }

  if (platform === "linux" && arch === "arm64") {
    return isMusl() ? "@rollup/rollup-linux-arm64-musl" : "@rollup/rollup-linux-arm64-gnu"
  }

  return null
}

function hasPackage(name) {
  try {
    require.resolve(name)
    return true
  } catch {
    return false
  }
}

const pkg = getRollupNativePackage()

if (!pkg) {
  process.exit(0)
}

if (hasPackage(pkg)) {
  process.exit(0)
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
const result = spawnSync(npmCmd, ["i", "--no-save", pkg], { stdio: "inherit" })

if (result.status !== 0 || !hasPackage(pkg)) {
  throw new Error(`Failed to install required Rollup native package: ${pkg}`)
}
