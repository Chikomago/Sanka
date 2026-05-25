import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

// This script runs before vite build (beforeBuildCommand)
// It strictly copies ONLY the target architecture's uv binary into bin/active
// saving approximately ~40MB in the final installer by omitting foreign OS binaries.
//
// When building a universal macOS binary (--target universal-apple-darwin),
// it uses `lipo` to merge uv-arm and uv-intel into a single universal binary.

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE || "";
const archStr = process.env.TAURI_ENV_ARCH || os.arch();
const platformStr = process.env.TAURI_ENV_PLATFORM || os.platform();

const rootDir = process.cwd();
const activeDir = path.join(rootDir, "bin", "active");

if (fs.existsSync(activeDir)) {
    fs.rmSync(activeDir, { recursive: true, force: true });
}
fs.mkdirSync(activeDir, { recursive: true });

let uvDestName = "uv";

if (platformStr === "windows" || platformStr === "win32" || targetTriple.includes("windows")) {
    // Windows
    const uvSource = path.join(rootDir, "bin", "win", "uv.exe");
    uvDestName = "uv.exe";
    const uvDestFile = path.join(activeDir, uvDestName);

    if (fs.existsSync(uvSource)) {
        fs.copyFileSync(uvSource, uvDestFile);
        console.log(`\n📦 [Pre-Build] Bundled ${path.basename(uvSource)} into active resources pipeline.\n`);
    } else {
        console.warn(`\n⚠️  [Pre-Build] Warning: Expected source binary ${uvSource} does not exist!\n`);
    }
} else if (targetTriple.includes("universal")) {
    // macOS Universal Binary — merge arm + intel via lipo
    const uvArm = path.join(rootDir, "bin", "mac", "uv-arm");
    const uvIntel = path.join(rootDir, "bin", "mac", "uv-intel");
    const uvDestFile = path.join(activeDir, uvDestName);

    if (!fs.existsSync(uvArm)) {
        console.error(`\n❌ [Pre-Build] Missing ARM binary: ${uvArm}\n`);
        process.exit(1);
    }
    if (!fs.existsSync(uvIntel)) {
        console.error(`\n❌ [Pre-Build] Missing Intel binary: ${uvIntel}\n`);
        process.exit(1);
    }

    try {
        execSync(`lipo -create -output "${uvDestFile}" "${uvArm}" "${uvIntel}"`, { stdio: "inherit" });
        fs.chmodSync(uvDestFile, "755");
        console.log(`\n📦 [Pre-Build] Created universal uv binary (arm64 + x86_64) via lipo.\n`);
    } catch (err) {
        console.error(`\n❌ [Pre-Build] lipo failed: ${err.message}\n`);
        process.exit(1);
    }
} else {
    // macOS / Linux — single architecture
    let uvSource = "";
    if (archStr === "aarch64" || archStr === "arm64" || targetTriple.includes("aarch64")) {
        uvSource = path.join(rootDir, "bin", "mac", "uv-arm");
    } else {
        uvSource = path.join(rootDir, "bin", "mac", "uv-intel");
    }

    const uvDestFile = path.join(activeDir, uvDestName);

    if (fs.existsSync(uvSource)) {
        fs.copyFileSync(uvSource, uvDestFile);
        fs.chmodSync(uvDestFile, "755");
        console.log(`\n📦 [Pre-Build] Selectively bundled ${path.basename(uvSource)} into active resources pipeline.\n`);
    } else {
        console.warn(`\n⚠️  [Pre-Build] Warning: Expected source binary ${uvSource} does not exist!\n`);
    }
}
