import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Download, RefreshCw, Loader, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import "./Environment.css";

export interface InstalledVersion {
    version: string;
    path: string;
}

export interface EnvStatus {
    python: "checking" | "installed" | "missing" | "installing" | "uninstalling";
    node: "checking" | "installed" | "missing" | "installing" | "uninstalling";
    pythonVersions: InstalledVersion[];
    nodeVersions: InstalledVersion[];
    hasBrew: boolean;
}

let _globalEnvStatus: EnvStatus = { python: "checking", node: "checking", pythonVersions: [], nodeVersions: [], hasBrew: false };
let _listeners: Array<(s: EnvStatus) => void> = [];
const FALLBACK_PYTHON_INSTALL_VERSIONS = [
    "3.13.12",
    "3.12.13",
    "3.11.12",
    "3.10.17",
    "3.9.22",
    "3.8.20",
    "3.7.9",
];
const DEFAULT_PYTHON_VERSION = FALLBACK_PYTHON_INSTALL_VERSIONS[0];

export function getEnvStatus() { return _globalEnvStatus; }

export function subscribeEnvStatus(fn: (s: EnvStatus) => void) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter((l) => l !== fn); };
}

function setGlobalEnvStatus(s: EnvStatus | ((prev: EnvStatus) => EnvStatus)) {
    if (typeof s === "function") {
        _globalEnvStatus = s(_globalEnvStatus);
    } else {
        _globalEnvStatus = s;
    }
    _listeners.forEach((fn) => fn(_globalEnvStatus));
}

function log(source: string, message: string, stream: "STDOUT" | "STDERR" = "STDOUT") {
    window.dispatchEvent(new CustomEvent("tool-log-web", { detail: { id: source, message, stream } }));
}

// ==================== UV Path Helper ====================
async function getUvPath(): Promise<string> {
    try {
        return await invoke<string>("get_uv_path_cmd");
    } catch {
        throw new Error("UV_MISSING");
    }
}

// ==================== Detect Brew ====================
async function detectBrew(): Promise<boolean> {
    try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        if (isWindows) {
            return false;
        }
        const r = await Command.create("exec-sh", ["-c", "which brew"]).execute();
        return r.code === 0;
    } catch { return false; }
}

// ==================== Detect Python (via uv) ====================
async function detectAllPythonVersions(silent = false): Promise<{ activeVersion?: string; activePath?: string; versions: InstalledVersion[] }> {
    const versions: InstalledVersion[] = [];
    let activeVersion: string | undefined;
    let activePath: string | undefined;

    try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const uvPath = await getUvPath();

        // 使用 uv python list 检测已安装版本
        let listCmd;
        if (isWindows) {
            listCmd = Command.create("powershell", ["-Command", `& '${uvPath}' python list --only-installed`]);
        } else {
            listCmd = Command.create("exec-sh", ["-c", `'${uvPath}' python list --only-installed`]);
        }
        const listR = await listCmd.execute();

        if (listR.code === 0) {
            const lines = (listR.stdout || "").trim().split("\n").filter(Boolean);
            for (const line of lines) {
                // uv python list 输出格式: cpython-3.12.13-macos-aarch64-none    /path/to/python
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const verMatch = parts[0].match(/cpython-(\d+\.\d+\.\d+)/);
                    const path = parts[parts.length - 1];
                    if (verMatch && path) {
                        // 显式排除 Mac 内置/系统级 Python，即使 uv 侦测到了也忽略
                        if (
                            path.startsWith("/usr/bin") ||
                            path.startsWith("/System/Library") ||
                            path.startsWith("/Library/Developer") ||
                            path.includes("Xcode.app")
                        ) {
                            continue;
                        }

                        if (!versions.find(v => v.version === verMatch[1])) {
                            versions.push({ version: verMatch[1], path });
                        }
                    }
                }
            }
        }

        // 删除系统 python 检测，仅允许由 uv 管理的环境

        versions.sort((a, b) => {
            const partsA = a.version.split(".").map(Number);
            const partsB = b.version.split(".").map(Number);
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const aVal = partsA[i] || 0;
                const bVal = partsB[i] || 0;
                if (aVal !== bVal) return bVal - aVal;
            }
            return 0;
        });

        if (!silent) {
            if (versions.length === 0) {
                log("Python", "检测输出: 未找到可用的 Python", "STDERR");
            } else {
                log("Python", `已安装版本: ${versions.map(v => v.version).join(", ")}`);
                versions.forEach(v => {
                    log("Python", `  - Python ${v.version} (${v.path})`);
                });
            }
        }
    } catch (e) {
        if (!silent) log("Python", `检测异常: ${e}`, "STDERR");
    }

    return { activeVersion, activePath, versions };
}

async function detectInstallablePythonVersions(): Promise<string[]> {
    try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const uvPath = await getUvPath();
        const cmd = isWindows
            ? Command.create("powershell", ["-Command", `& '${uvPath}' python list`])
            : Command.create("exec-sh", ["-c", `'${uvPath}' python list`]);
        const result = await cmd.execute();

        if (result.code !== 0) return FALLBACK_PYTHON_INSTALL_VERSIONS;

        const versions = Array.from(
            new Set(
                (result.stdout || "")
                    .split("\n")
                    .map(line => line.match(/cpython-(\d+\.\d+\.\d+)/)?.[1])
                    .filter((version): version is string => Boolean(version))
                    .filter(version => version.startsWith("3."))
            )
        );

        versions.sort(compareVersionsDesc);
        return versions.length > 0 ? versions : FALLBACK_PYTHON_INSTALL_VERSIONS;
    } catch {
        return FALLBACK_PYTHON_INSTALL_VERSIONS;
    }
}

function compareVersionsDesc(a: string, b: string) {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const aVal = partsA[i] || 0;
        const bVal = partsB[i] || 0;
        if (aVal !== bVal) return bVal - aVal;
    }
    return 0;
}

// ==================== Detect Node.js ====================
async function detectAllNodeVersions(silent = false): Promise<{ activeVersion?: string; activePath?: string; versions: InstalledVersion[] }> {
    const versions: InstalledVersion[] = [];
    let activeVersion: string | undefined;
    let activePath: string | undefined;

    try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");

        if (isWindows) {
            const checkCmd = `
$portable = "$env:USERPROFILE\\.sanka\\node\\node.exe"
if (Test-Path $portable) {
    $ver = & $portable --version
    Write-Output $ver
    Write-Output $portable
} else {
    node --version; (Get-Command node -ErrorAction SilentlyContinue).Source
}
            `;
            const activeR = await Command.create("powershell", ["-Command", checkCmd]).execute();

            if (activeR.code === 0) {
                const lines = (activeR.stdout || "").trim().split("\n").filter(Boolean);
                if (lines.length >= 2) {
                    activeVersion = lines[0].trim().replace(/^v/, "");
                    activePath = lines[1].trim();
                } else if (lines.length === 1 && lines[0].startsWith("v")) {
                    activeVersion = lines[0].trim().replace(/^v/, "");
                }
            }
        } else {
            const activeR = await Command.create("exec-sh", ["-c", `
node_ver=$(/bin/zsh -i -c 'node --version 2>/dev/null' | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)
node_path=$(/bin/zsh -i -c 'which node 2>/dev/null' | grep -E '^/' | head -n 1)
if [ -n "$node_ver" ] && [ -n "$node_path" ]; then
    echo "$node_ver|$node_path"
fi
            `]).execute();

            if (activeR.code === 0) {
                const output = (activeR.stdout || "").trim();
                if (output && output.includes("|")) {
                    const [ver, path] = output.split("|");
                    activeVersion = ver.replace(/^v/, "").trim();
                    activePath = path.trim();
                }
            }
        }

        if (activeVersion && activePath && !versions.find(v => v.path === activePath)) {
            versions.unshift({ version: activeVersion, path: activePath });
        }

        if (!silent) {
            if (versions.length === 0) {
                log("Node.js", "检测输出: 未找到可用的 Node.js", "STDERR");
            } else {
                log("Node.js", `已安装版本: ${versions.map(v => v.version).join(", ")}`);
                versions.forEach(v => {
                    log("Node.js", `  - Node.js ${v.version} (${v.path})`);
                });
            }
        }
    } catch (e) {
        if (!silent) log("Node.js", `检测异常: ${e}`, "STDERR");
    }

    return { activeVersion, activePath, versions };
}

// ==================== Shell Runner ====================
async function runShell(source: string, script: string, silent = false): Promise<boolean> {
    try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");

        let cmd;
        if (isWindows) {
            if (script.trim().startsWith("powershell -c")) {
                const match = script.match(/powershell -c "(.+)"/);
                const actualScript = match ? match[1] : script;
                cmd = Command.create("powershell", ["-Command", actualScript]);
            } else {
                cmd = Command.create("powershell", ["-Command", script]);
            }
        } else {
            cmd = Command.create("exec-sh", ["-c", script]);
        }

        cmd.stdout.on("data", (l: string) => log(source, l));
        cmd.stderr.on("data", (l: string) => log(source, l, "STDERR"));
        const r = await cmd.execute();
        if (r.code === 0) {
            if (!silent) log(source, "操作完成！");
            return true;
        } else {
            if (!silent) log(source, `❌ 失败 (exit ${r.code})`, "STDERR");
            return false;
        }
    } catch (e) {
        if (!silent) log(source, `❌ 异常: ${e}`, "STDERR");
        return false;
    }
}

// ==================== Python EnvCard ====================
function PythonCard({
    status,
    installedVersions,
    installableVersions,
    selectedVersion,
    onVersionChange,
    onInstall,
    onUninstall,
    isExpanded,
    onToggleExpand,
}: {
    status: "checking" | "installed" | "missing" | "installing" | "uninstalling";
    installedVersions: InstalledVersion[];
    installableVersions: string[];
    selectedVersion: string;
    onVersionChange: (v: string) => void;
    onInstall: () => void;
    onUninstall: (v: InstalledVersion) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}) {
    const isOperating = status === "installing" || status === "uninstalling";
    const hasTarget = installedVersions.some(v => v.version === selectedVersion);

    return (
        <div className={`env-card glass ${isExpanded ? "expanded" : ""}`}>
            <div className="env-card-top">
                <div className="env-info">
                    <h3 className="env-name">Python</h3>
                    <p className="env-desc">运行 Python 类工具所需的基础解释器环境。</p>
                </div>
                <div className="env-status-row">
                    {status === "installed" && installedVersions.length > 0 ? (
                        <div className="env-installed-versions">
                            {installedVersions.map((v) => (
                                <span key={v.path} className="version-tag">
                                    v{v.version}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className={`env-status-badge ${status}`}>
                            {status === "checking" && <span className="spinner" />}
                            {status === "installed" && <CheckCircle size={18} />}
                            {status === "missing" && <XCircle size={18} />}
                            {isOperating && <Loader size={18} className="spin-icon" />}
                            <span>
                                {status === "checking" && "检测中…"}
                                {status === "installed" && "已安装"}
                                {status === "missing" && "未安装"}
                                {status === "installing" && "安装中…"}
                                {status === "uninstalling" && "卸载中…"}
                            </span>
                        </div>
                    )}
                    <button
                        className="env-expand-btn"
                        onClick={onToggleExpand}
                        disabled={status === "checking" || isOperating}
                        title={isExpanded ? "收起" : "展开"}
                    >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="env-actions-row">
                    <div className="env-action-item">
                        <span className="env-action-label">版本</span>
                        <select
                            className="version-select"
                            value={selectedVersion}
                            onChange={(e) => onVersionChange(e.target.value)}
                            disabled={isOperating}
                        >
                            {installableVersions.map(version => (
                                <option key={version} value={version}>{version}</option>
                            ))}
                        </select>
                    </div>

                    <div className="env-action-item">
                        <span className="env-action-label">安装方式</span>
                        <span className="method-text">uv</span>
                    </div>

                    <div className="env-action-item">
                        {hasTarget ? (
                            <button
                                className="env-uninstall-btn"
                                onClick={() => {
                                    const v = installedVersions.find(v => v.version === selectedVersion);
                                    if (v) onUninstall(v);
                                }}
                                disabled={isOperating}
                            >
                                <Trash2 size={14} />
                                <span>卸载</span>
                            </button>
                        ) : (
                            <button
                                className="env-install-btn"
                                onClick={onInstall}
                                disabled={isOperating}
                            >
                                <Download size={14} />
                                <span>安装</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== Node.js EnvCard ====================
function NodeCard({
    status,
    installedVersions,
    hasBrew,
    installMethod,
    onInstallMethodChange,
    targetNodeVersion,
    onTargetNodeVersionChange,
    onInstall,
    onUninstall,
    isExpanded,
    onToggleExpand,
}: {
    status: "checking" | "installed" | "missing" | "installing" | "uninstalling";
    installedVersions: InstalledVersion[];
    hasBrew: boolean;
    installMethod: "brew" | "nvm" | "official";
    onInstallMethodChange: (method: "brew" | "nvm" | "official") => void;
    targetNodeVersion: "v18" | "v20" | "v25";
    onTargetNodeVersionChange: (version: "v18" | "v20" | "v25") => void;
    onInstall: () => void;
    onUninstall: (v: InstalledVersion) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}) {
    const isOperating = status === "installing" || status === "uninstalling";
    const isWindows = navigator.userAgent.toLowerCase().includes("windows");
    const hasInstalled = installedVersions.length > 0;

    return (
        <div className={`env-card glass ${isExpanded ? "expanded" : ""}`}>
            <div className="env-card-top">
                <div className="env-info">
                    <h3 className="env-name">Node.js</h3>
                    <p className="env-desc">运行 JavaScript / TypeScript 类工具所需的运行时。</p>
                </div>
                <div className="env-status-row">
                    {status === "installed" && installedVersions.length > 0 ? (
                        <div className="env-installed-versions">
                            {installedVersions.map((v) => (
                                <span key={v.path} className="version-tag">
                                    v{v.version}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className={`env-status-badge ${status}`}>
                            {status === "checking" && <span className="spinner" />}
                            {status === "installed" && <CheckCircle size={18} />}
                            {status === "missing" && <XCircle size={18} />}
                            {isOperating && <Loader size={18} className="spin-icon" />}
                            <span>
                                {status === "checking" && "检测中…"}
                                {status === "installed" && "已安装"}
                                {status === "missing" && "未安装"}
                                {status === "installing" && "安装中…"}
                                {status === "uninstalling" && "卸载中…"}
                            </span>
                        </div>
                    )}
                    <button
                        className="env-expand-btn"
                        onClick={onToggleExpand}
                        disabled={status === "checking" || isOperating}
                        title={isExpanded ? "收起" : "展开"}
                    >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="env-expanded-content">
                    <div className="env-actions-row">
                        <div className="env-action-item">
                            <span className="env-action-label">版本</span>
                            <select
                                className="method-select"
                                style={{ marginLeft: "10px" }}
                                value={targetNodeVersion}
                                onChange={(e) => onTargetNodeVersionChange(e.target.value as "v18" | "v20" | "v25")}
                            >
                                <option value="v18">v18.x (LTS)</option>
                                <option value="v20">v20.x (LTS)</option>
                                <option value="v25">v25.x (最新)</option>
                            </select>
                        </div>

                        {!isWindows && (
                            <div className="env-action-item">
                                <span className="env-action-label">安装方式</span>
                                {hasBrew ? (
                                    <select
                                        className="method-select"
                                        value={installMethod}
                                        onChange={(e) => onInstallMethodChange(e.target.value as "brew" | "nvm" | "official")}
                                    >
                                        <option value="brew">Homebrew</option>
                                        <option value="nvm">nvm</option>
                                        <option value="official">官方安装包</option>
                                    </select>
                                ) : (
                                    <select
                                        className="method-select"
                                        value={installMethod}
                                        onChange={(e) => onInstallMethodChange(e.target.value as "brew" | "nvm" | "official")}
                                    >
                                        <option value="nvm">nvm</option>
                                        <option value="official">官方安装包</option>
                                    </select>
                                )}
                            </div>
                        )}

                        <div className="env-action-item" style={{ display: "flex", gap: "8px" }}>
                            <button
                                className="env-install-btn"
                                onClick={onInstall}
                                disabled={isOperating}
                            >
                                <Download size={14} />
                                <span>安装</span>
                            </button>
                            {hasInstalled && (
                                <button
                                    className="env-uninstall-btn"
                                    onClick={() => {
                                        if (installedVersions[0]) onUninstall(installedVersions[0]);
                                    }}
                                    disabled={isOperating}
                                >
                                    <Trash2 size={14} />
                                    <span>卸载</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== Main Page ====================
export function EnvironmentPage() {
    const [status, setStatus] = useState<EnvStatus>(_globalEnvStatus);
    const [pythonVersion, setPythonVersion] = useState<string>(DEFAULT_PYTHON_VERSION);
    const [installablePythonVersions, setInstallablePythonVersions] = useState<string[]>(FALLBACK_PYTHON_INSTALL_VERSIONS);
    const [installMethod, setInstallMethod] = useState<"brew" | "nvm" | "official">("brew");
    const [targetNodeVersion, setTargetNodeVersion] = useState<"v18" | "v20" | "v25">("v20");
    const [pyExpanded, setPyExpanded] = useState(false);
    const [nodeExpanded, setNodeExpanded] = useState(false);

    // UV specific states
    const [uvInstalled, setUvInstalled] = useState<boolean | null>(null);
    const [uvDownloading, setUvDownloading] = useState<boolean>(false);
    const [uvProgress, setUvProgress] = useState<{ percentage: number; message: string }>({ percentage: 0, message: "" });

    useEffect(() => {
        const unsub = subscribeEnvStatus(setStatus);

        // Always check UV on mount to ensure lock overlay is accurate
        checkUvStatus().then((hasUv) => {
            if (hasUv) {
                refreshInstallablePythonVersions();
            }
            if (hasUv && _globalEnvStatus.python === "checking" && _globalEnvStatus.node === "checking") {
                checkEnvironments();
            }
        });

        const unlistenPromise = listen<{ percentage: number; message: string }>("uv-download-progress", (event) => {
            setUvProgress(event.payload);
        });

        return () => {
            unsub();
            unlistenPromise.then(f => f());
        };
    }, []);

    async function checkUvStatus() {
        try {
            const hasUv = await invoke<boolean>("check_uv_installed");
            setUvInstalled(hasUv);
            return hasUv;
        } catch {
            setUvInstalled(false);
            return false;
        }
    }

    async function refreshInstallablePythonVersions() {
        const versions = await detectInstallablePythonVersions();
        setInstallablePythonVersions(versions);
        setPythonVersion(prev => versions.includes(prev) ? prev : versions[0] || DEFAULT_PYTHON_VERSION);
    }

    async function checkEnvironments() {
        const s: EnvStatus = { python: "checking", node: "checking", pythonVersions: [], nodeVersions: [], hasBrew: false };
        setGlobalEnvStatus({ ...s }); setStatus({ ...s });

        await checkUvStatus();

        s.hasBrew = await detectBrew();
        if (!s.hasBrew) setInstallMethod("nvm");

        const py = await detectAllPythonVersions(true);
        s.python = py.versions.length > 0 ? "installed" : "missing";
        s.pythonVersions = py.versions;
        setGlobalEnvStatus({ ...s }); setStatus({ ...s });

        const nd = await detectAllNodeVersions(true);
        s.node = nd.versions.length > 0 ? "installed" : "missing";
        s.nodeVersions = nd.versions;
        setGlobalEnvStatus({ ...s }); setStatus({ ...s });
    }

    async function checkPythonOnly() {
        setGlobalEnvStatus(prev => ({ ...prev, python: "checking" }));
        setStatus(prev => ({ ...prev, python: "checking" }));

        const py = await detectAllPythonVersions(true);
        setGlobalEnvStatus(prev => ({
            ...prev,
            python: py.versions.length > 0 ? "installed" : "missing",
            pythonVersions: py.versions,
        }));
        setStatus(prev => ({
            ...prev,
            python: py.versions.length > 0 ? "installed" : "missing",
            pythonVersions: py.versions,
        }));
    }

    async function checkNodeOnly() {
        setGlobalEnvStatus(prev => ({ ...prev, node: "checking" }));
        setStatus(prev => ({ ...prev, node: "checking" }));

        const nd = await detectAllNodeVersions(true);
        setGlobalEnvStatus(prev => ({
            ...prev,
            node: nd.versions.length > 0 ? "installed" : "missing",
            nodeVersions: nd.versions,
        }));
        setStatus(prev => ({
            ...prev,
            node: nd.versions.length > 0 ? "installed" : "missing",
            nodeVersions: nd.versions,
        }));
    }

    // ==================== Install Python via uv ====================
    async function installPython() {
        setStatus((p) => ({ ...p, python: "installing" }));
        setGlobalEnvStatus(prev => ({ ...prev, python: "installing" }));

        const currentVersions = await detectAllPythonVersions(true);
        const alreadyInstalled = currentVersions.versions.some(v => v.version === pythonVersion);

        if (alreadyInstalled) {
            log("Python", `⚠️ Python ${pythonVersion} 已安装，跳过安装`);
            await checkPythonOnly();
            return;
        }

        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const uvPath = await getUvPath();

        log("Python", `正在使用 uv 安装 Python ${pythonVersion}...`);
        log("Python", `uv 路径: ${uvPath}`);

        let success = false;

        if (isWindows) {
            success = await runShell("Python", `& '${uvPath}' python install ${pythonVersion}`, true);
        } else {
            await runShell("Python", `chmod +x '${uvPath}'`, true);
            success = await runShell("Python", `'${uvPath}' python install ${pythonVersion}`, true);
        }

        const newVersions = await detectAllPythonVersions(true);
        const nowInstalled = newVersions.versions.some(v => v.version === pythonVersion);

        if (nowInstalled) {
            const installed = newVersions.versions.find(v => v.version === pythonVersion);
            log("Python", `Python 安装成功！`);
            log("Python", `版本号: Python ${installed?.version || pythonVersion}`);
            log("Python", `路径: ${installed?.path || "由 uv 管理"}`);
        } else if (success) {
            log("Python", `安装命令执行完成，正在验证...`);
            if (isWindows) {
                await runShell("Python", `& '${uvPath}' python list --only-installed`, false);
            } else {
                await runShell("Python", `'${uvPath}' python list --only-installed`, false);
            }
        } else {
            log("Python", `⚠️ 安装过程可能未完全成功，请检查上方日志`, "STDERR");
        }

        setGlobalEnvStatus(prev => ({
            ...prev,
            python: newVersions.versions.length > 0 ? "installed" : "missing",
            pythonVersions: newVersions.versions,
        }));
        setStatus(prev => ({
            ...prev,
            python: newVersions.versions.length > 0 ? "installed" : "missing",
            pythonVersions: newVersions.versions,
        }));
    }

    // ==================== Install Node.js ====================
    async function installNode() {
        setStatus((p) => ({ ...p, node: "installing" }));
        setGlobalEnvStatus(prev => ({ ...prev, node: "installing" }));


        let success = false;
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const exactVerMap: Record<string, string> = { "v18": "v18.20.4", "v20": "v20.12.2", "v25": "v25.3.0" };
        const exactVer = exactVerMap[targetNodeVersion] || "v20.12.2";

        if (isWindows) {
            log("Node.js", `正在下载并安装 Node.js ${targetNodeVersion} 便携版 (Windows)...`);
            log("Node.js", `这可能需要一两分钟，请耐心等待...`);
            success = await runShell("Node.js", `
$nodeVer = "${exactVer}"
$url = "https://nodejs.org/dist/$nodeVer/node-$nodeVer-win-x64.zip"
$destZip = "$env:TEMP\\node.zip"
$extractDir = "$env:USERPROFILE\\.sanka\\node"

if (!(Test-Path $extractDir)) { New-Item -ItemType Directory -Force -Path $extractDir | Out-Null }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $destZip
Expand-Archive -Path $destZip -DestinationPath "$env:TEMP\\node_extracted" -Force
Copy-Item -Path "$env:TEMP\\node_extracted\\node-$nodeVer-win-x64\\*" -Destination $extractDir -Recurse -Force
Remove-Item -Path $destZip -Force
Remove-Item -Path "$env:TEMP\\node_extracted" -Recurse -Force
            `, true);
            if (!success) {
                log("Node.js", `安装失败，请重试或手动访问 https://nodejs.org 下载安装`, "STDERR");
            }
        } else if (installMethod === "brew") {
            log("Node.js", `通过 Homebrew 安装 Node.js ${targetNodeVersion}...`);
            const brewPkg = targetNodeVersion === "v25" ? "node" : `node@${targetNodeVersion.replace('v', '')}`;
            success = await runShell("Node.js", `HOMEBREW_NO_SANDBOX=1 brew install ${brewPkg} && brew link --overwrite --force ${brewPkg} 2>&1`, true);
        } else if (installMethod === "nvm") {
            log("Node.js", `通过 nvm 安装 Node.js ${targetNodeVersion}...`);
            const nvmVer = targetNodeVersion.replace('v', '');
            success = await runShell("Node.js", `
if ! command -v nvm &>/dev/null && [ ! -f "$HOME/.nvm/nvm.sh" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash 2>&1
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install ${nvmVer} 2>&1
nvm use ${nvmVer} 2>&1
            `, true);
        } else {
            log("Node.js", `正在下载 Node.js ${targetNodeVersion} 官方安装包...`);
            log("Node.js", `下载完成后会弹出系统验证框请求安装权限，请同意。`);
            success = await runShell("Node.js", `
NODE_VER="${exactVer}"
PKG_PATH="/tmp/node-$NODE_VER.pkg"
echo "Downloading $PKG_PATH..."
curl -# -fo "$PKG_PATH" "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER.pkg"
if [ -f "$PKG_PATH" ]; then
    echo "Installing package (requires administrator privileges)..."
    osascript -e "do shell script \\"installer -pkg $PKG_PATH -target /\\" with administrator privileges"
    rm -f "$PKG_PATH"
else
    echo "Download failed."
    exit 1
fi
            `, true);
        }

        const newVersions = await detectAllNodeVersions(true);
        const nowInstalled = newVersions.versions.length > 0;

        if (nowInstalled) {
            log("Node.js", `Node.js 安装成功！`);
            log("Node.js", `版本号: Node.js ${newVersions.versions[0]?.version}`);
            log("Node.js", `路径: ${newVersions.versions[0]?.path}`);
        } else if (success) {
            log("Node.js", `安装命令执行完成，请重新检测环境`);
        } else if (!isWindows && installMethod !== "official") {
            log("Node.js", `⚠️ 安装过程可能未完全成功，请检查上方日志`, "STDERR");
        }

        setGlobalEnvStatus(prev => ({
            ...prev,
            node: newVersions.versions.length > 0 ? "installed" : "missing",
            nodeVersions: newVersions.versions,
        }));
        setStatus(prev => ({
            ...prev,
            node: newVersions.versions.length > 0 ? "installed" : "missing",
            nodeVersions: newVersions.versions,
        }));
    }

    // ==================== Uninstall ====================
    async function uninstallPython(v: InstalledVersion) {
        setStatus((p) => ({ ...p, python: "uninstalling" }));
        log("Python", `正在卸载 Python ${v.version}...`);

        try {
            await invoke("uninstall_python_version", {
                version: v.version,
                pythonPath: v.path,
            });
            log("Python", `Python ${v.version} 卸载成功`);
        } catch (e: any) {
            log("Python", `❌ 卸载失败: ${e?.message || e}`, "STDERR");
        }

        await checkPythonOnly();
    }

    async function uninstallNode(v: InstalledVersion) {
        setStatus((p) => ({ ...p, node: "uninstalling" }));
        log("Node.js", `正在卸载 Node.js ${v.version}...`);

        const isWindows = navigator.userAgent.toLowerCase().includes("windows");

        if (isWindows) {
            if (v.path.includes(".sanka\\node")) {
                await runShell("Node.js", `Remove-Item -Recurse -Force "$env:USERPROFILE\\.sanka\\node" -ErrorAction SilentlyContinue`, true);
            } else {
                log("Node.js", `请通过控制面板手动卸载 Node.js`, "STDERR");
            }
        } else {
            if (v.path.includes("/opt/homebrew/") || v.path.includes("/usr/local/Cellar/")) {
                await runShell("Node.js", `HOMEBREW_NO_SANDBOX=1 brew uninstall --force --ignore-dependencies node 2>&1`, true);
            } else if (v.path.includes("/.nvm/")) {
                const verWithV = `v${v.version}`;
                await runShell("Node.js", `
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm deactivate 2>/dev/null || true
nvm uninstall ${verWithV} 2>&1
                `, true);
            } else if (v.path === "/usr/local/bin/node" || v.path.includes("/usr/local/bin/")) {
                log("Node.js", `正在卸载官方固件，这可能需要验证管理员密码...`);
                await runShell("Node.js", `
osascript -e 'do shell script "rm -rf /usr/local/bin/npm /usr/local/bin/node /usr/local/lib/node_modules/npm /usr/local/include/node /usr/local/share/man/man1/node.1 /usr/local/lib/dtrace/node.d" with administrator privileges'
                `, true);
            } else {
                log("Node.js", `无法自动卸载: ${v.path}（请手动卸载）`, "STDERR");
            }
        }
        await checkNodeOnly();
    }

    async function handleDownloadUv(): Promise<boolean> {
        setUvDownloading(true);
        setUvProgress({ percentage: 0, message: "准备下载..." });
        try {
            await invoke("download_uv");
            setUvInstalled(true);
            await refreshInstallablePythonVersions();
            // Re-check environments after downloading UV
            await checkEnvironments();
            return true;
        } catch (e: any) {
            console.error("Failed to download UV:", e);
            alert("下载失败: " + e);
            return false;
        } finally {
            setUvDownloading(false);
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="env-header-row">
                    <div>
                        <h2 className="page-title">运行环境</h2>
                        <p className="page-subtitle">
                            插件市场部分工具需要依赖运行环境，请确保环境已安装后使用。
                        </p>
                    </div>
                    <button className="header-action-btn" onClick={checkEnvironments} title="重新检测">
                        <RefreshCw size={16} />
                        重新检测
                    </button>
                </div>
            </div>

            <div className="env-cards">
                <div style={{ position: "relative" }}>
                    {uvInstalled === false && (
                        <div className="uv-lock-overlay" style={{ backdropFilter: "blur(4px)", background: "rgba(0,0,0,0)" }}>
                            {uvDownloading ? (
                                <div className="uv-progress-container" style={{ width: "80%", maxWidth: "300px", textAlign: "center" }}>
                                    <div className="uv-progress-bar">
                                        <div className="uv-progress-fill" style={{ width: `${uvProgress.percentage}%` }}></div>
                                    </div>
                                    <p className="uv-progress-text" style={{ marginTop: "8px", fontWeight: 500 }}>
                                        {uvProgress.message} ({uvProgress.percentage}%)
                                    </p>
                                </div>
                            ) : (
                                <button className="uv-download-btn" onClick={handleDownloadUv} style={{ width: "auto", padding: "10px 24px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                                    <Download size={16} style={{ marginRight: "8px" }} />
                                    初始化Python UV包管理器
                                </button>
                            )}
                        </div>
                    )}

                    <div style={{ opacity: uvInstalled !== true ? 0.3 : 1, pointerEvents: uvInstalled !== true ? "none" : "auto" }}>
                        <PythonCard
                            status={status.python}
                            installedVersions={status.pythonVersions}
                            installableVersions={installablePythonVersions}
                            selectedVersion={pythonVersion}
                            onVersionChange={setPythonVersion}
                            onInstall={installPython}
                            onUninstall={uninstallPython}
                            isExpanded={pyExpanded}
                            onToggleExpand={() => setPyExpanded(!pyExpanded)}
                        />
                    </div>
                </div>

                <NodeCard
                    status={status.node}
                    installedVersions={status.nodeVersions}
                    hasBrew={status.hasBrew}
                    installMethod={installMethod}
                    onInstallMethodChange={setInstallMethod}
                    targetNodeVersion={targetNodeVersion}
                    onTargetNodeVersionChange={setTargetNodeVersion}
                    onInstall={installNode}
                    onUninstall={uninstallNode}
                    isExpanded={nodeExpanded}
                    onToggleExpand={() => setNodeExpanded(!nodeExpanded)}
                />
            </div>
        </div>
    );
}
