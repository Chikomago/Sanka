import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import crypto from "crypto";

// Color utilities for beautiful output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

console.log(`${colors.bright}${colors.cyan}=====================================================${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}🚀 SANKA Safe Build & Auto-Updater Signer Script 🚀${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}=====================================================${colors.reset}\n`);

const rootDir = process.cwd();
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const keyTxtPath = path.join(rootDir, "key.txt");
const envPath = path.join(rootDir, ".env");

let privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
let password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || "alan1993"; // Default password from key.txt

// 1. Try to load keys from existing files
if (!privateKey && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const lines = envContent.split("\n");
  for (const line of lines) {
    const matchKey = line.match(/^\s*TAURI_SIGNING_PRIVATE_KEY\s*=\s*["']?(.*?)["']?\s*$/);
    const matchPass = line.match(/^\s*TAURI_SIGNING_PRIVATE_KEY_PASSWORD\s*=\s*["']?(.*?)["']?\s*$/);
    if (matchKey) privateKey = matchKey[1];
    if (matchPass) password = matchPass[1];
  }
}

if (!privateKey && fs.existsSync(keyTxtPath)) {
  const keyTxtContent = fs.readFileSync(keyTxtPath, "utf-8");
  const matchKey = keyTxtContent.match(/TAURI_SIGNING_PRIVATE_KEY\s*=\s*["']([^"]+)["']/);
  if (matchKey) {
    privateKey = matchKey[1];
  }
  
  // Parse last line for password if it doesn't match shell syntax
  const lines = keyTxtContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine.startsWith("#") && !lastLine.includes("export ") && !lastLine.includes("$env:") && !lastLine.includes("bun ") && !lastLine.includes("npm ") && !lastLine.includes("npx ")) {
      password = lastLine;
    }
  }
}

// 2. If no key exists, generate a new key pair
if (!privateKey) {
  console.log(`${colors.yellow}🔑 No signing private key detected. Generating a new key pair...${colors.reset}`);
  
  try {
    // Run tauri signer generate
    const output = execSync(`npx tauri signer generate -p "${password}" --ci`, { encoding: "utf-8" });
    
    const privateMatch = output.match(/Private:[^\n]*\n([A-Za-z0-9+/=\s\n]+?)\n\nPublic:/);
    const publicMatch = output.match(/Public:\n([A-Za-z0-9+/=\s\n]+?)\n\nEnvironment/);
    
    if (privateMatch && publicMatch) {
      privateKey = privateMatch[1].replace(/\s/g, "");
      const publicKey = publicMatch[1].replace(/\s/g, "");
      
      console.log(`\n${colors.green}✅ New signing key pair successfully generated!${colors.reset}`);
      console.log(`${colors.cyan}🔑 Public Key: ${colors.bright}${publicKey}${colors.reset}`);
      console.log(`${colors.cyan}🔒 Private Key Password: ${colors.bright}${password}${colors.reset}\n`);
      
      // Update or create key.txt
      const newKeyTxtContent = `#mac
export TAURI_SIGNING_PRIVATE_KEY="${privateKey}"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${password}"
npm run build:mac

#windows
$env:TAURI_SIGNING_PRIVATE_KEY="${privateKey}"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${password}"
npx tauri build

${password}
`;
      fs.writeFileSync(keyTxtPath, newKeyTxtContent, "utf-8");
      console.log(`📝 Updated key.txt with new key pair and password.`);
      
      // Update .env
      let newEnvContent = "";
      if (fs.existsSync(envPath)) {
        newEnvContent = fs.readFileSync(envPath, "utf-8");
        newEnvContent = newEnvContent
          .replace(/TAURI_SIGNING_PRIVATE_KEY=.*\n?/g, "")
          .replace(/TAURI_SIGNING_PRIVATE_KEY_PASSWORD=.*\n?/g, "");
      }
      newEnvContent += `\nTAURI_SIGNING_PRIVATE_KEY="${privateKey}"\nTAURI_SIGNING_PRIVATE_KEY_PASSWORD="${password}"\n`;
      fs.writeFileSync(envPath, newEnvContent.trim() + "\n", "utf-8");
      console.log(`📝 Updated .env file.`);
      
      // Update tauri.conf.json
      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
        if (tauriConf.plugins && tauriConf.plugins.updater) {
          tauriConf.plugins.updater.pubkey = publicKey;
          fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2), "utf-8");
          console.log(`📝 Updated tauri.conf.json with new pubkey.`);
        }
      }
    } else {
      throw new Error("Could not parse generated keys from output.");
    }
  } catch (err) {
    console.error(`${colors.red}❌ Failed to generate signing keys: ${err.message}${colors.reset}`);
    process.exit(1);
  }
} else {
  console.log(`${colors.green}🔑 Existing signing key loaded successfully!${colors.reset}`);
}

// 3. Inject keys into environment variables
process.env.TAURI_SIGNING_PRIVATE_KEY = privateKey;
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password;

// 4. Start build based on Platform
const isMac = process.platform === "darwin";
const buildCmd = isMac 
  ? "npm run build:mac" 
  : "npx tauri build";

console.log(`\n${colors.bright}${colors.blue}🔨 Running build command: ${colors.yellow}${buildCmd}${colors.reset}\n`);

try {
  execSync(buildCmd, { stdio: "inherit", env: process.env });
  console.log(`\n${colors.bright}${colors.green}🎉 Application build completed successfully!${colors.reset}\n`);
  
  // 5. Extract and print signatures
  console.log(`${colors.bright}${colors.cyan}📦 Searching for update artifacts and signatures...${colors.reset}`);
  
  const targetDir = path.join(rootDir, "src-tauri", "target");
  const sigFiles = [];
  
  function findSigFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findSigFiles(fullPath);
      } else if (file.endsWith(".sig")) {
        sigFiles.push(fullPath);
      }
    }
  }
  
  findSigFiles(targetDir);
  
  if (sigFiles.length === 0) {
    console.log(`${colors.yellow}⚠️ No update signatures found in target directory. Ensure "createUpdaterArtifacts" is enabled in tauri.conf.json.${colors.reset}`);
  } else {
    console.log(`\n${colors.bright}${colors.green}=================== 🚀 UPDATE SIGNATURES & ARTIFACTS 🚀 ===================${colors.reset}`);
    for (const sigFile of sigFiles) {
      const bundlePath = sigFile.slice(0, -4); // remove .sig
      const bundleName = path.basename(bundlePath);
      const signature = fs.readFileSync(sigFile, "utf-8").trim();
      
      console.log(`\n${colors.bright}${colors.yellow}📦 File:${colors.reset} ${bundlePath}`);
      console.log(`${colors.bright}${colors.yellow}🔑 Signature (Base64):${colors.reset}`);
      console.log(`${colors.bright}${colors.green}${signature}${colors.reset}`);
      console.log(`${colors.cyan}--------------------------------------------------------------------------${colors.reset}`);
    }
  }
  
} catch (err) {
  console.error(`\n${colors.red}❌ Build process failed: ${err.message}${colors.reset}`);
  process.exit(1);
}
