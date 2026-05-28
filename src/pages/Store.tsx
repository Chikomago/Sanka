import { useState, useEffect } from "react";
import { Lock, Download, Apple, Monitor, AlertTriangle, BookOpen, X, KeyRound, Loader, ChevronDown, CheckCircle, Info, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getEnvStatus, subscribeEnvStatus, type EnvStatus } from "./Environment";
import { getConfig } from "../utils/config";
import { AlertDialog, type DialogType } from "../components/Dialog";
import "./Store.css";

export interface ToolVersion {
    version: string;
    uploadedAt: string;
    changelog?: string;
}

export interface ToolItem {
    id: string;
    name: string;
    description: string;
    category: string;
    version: string;
    versions: ToolVersion[];
    platforms: string[];
    is_encrypted: boolean;
    download_url: string;
    runtime: string[];
    author: string;
    readme?: string;
    python_version?: string;
    node_version?: string;
    entry?: string;
}

let _globalTools: ToolItem[] | null = null;
let _globalCategories: string[] = ["全部"];
let _lastFetchTime = 0;
let _hasAttemptedFetch = false;
let _globalError = "";

const PythonIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <g fill="none">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 7.5H7.5m4.5 9h4.5m0 0h1.521c.807 0 1.634-.188 2.13-.824c.531-.679 1.099-1.835 1.099-3.676c0-1.84-.568-2.997-1.098-3.676c-.497-.636-1.324-.824-2.13-.824H16.5m0 9v1.521c0 .807-.188 1.634-.824 2.13c-.679.531-1.835 1.099-3.676 1.099c-1.84 0-2.997-.568-3.676-1.098c-.636-.497-.824-1.324-.824-2.13V16.5m0-9H5.978c-.807 0-1.633.188-2.13.824c-.53.679-1.098 1.835-1.098 3.676c0 1.84.568 2.997 1.098 3.676c.497.636 1.323.824 2.13.824H7.5m0-9V5.978c0-.807.188-1.633.824-2.13c.679-.53 1.835-1.098 3.676-1.098c1.84 0 2.997.568 3.676 1.098c.636.497.824 1.323.824 2.13V7.5m-9 9V14a2 2 0 0 1 2-2h5a2 2 0 0 0 2-2V7.5" />
            <path fill="currentColor" d="M15 18.5a.75.75 0 1 1-1.5 0a.75.75 0 0 1 1.5 0m-6-13a.75.75 0 1 1 1.5 0a.75.75 0 0 1-1.5 0" />
        </g>
    </svg>
);

const NodeIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <g fill="none">
            <g fill="currentColor" clipPath="url(#SVGXv8lpc2Y)">
                <path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969s3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.42 3.35-3.42h5.766s3.24.052 3.24-3.148V3.202S18.28 0 11.913 0M8.708 1.85c.578 0 1.046.47 1.046 1.052c0 .581-.468 1.051-1.046 1.051s-1.046-.47-1.046-1.051c0-.582.467-1.052 1.046-1.052" />
                <path d="M12.087 24c6.092 0 5.712-2.656 5.712-2.656l-.007-2.752h-5.814v-.826h8.123s3.9.445 3.9-5.735s-3.404-5.96-3.404-5.96h-2.03v2.867s.109 3.42-3.35 3.42H9.452s-3.24-.052-3.24 3.148v5.292S5.72 24 12.087 24m3.206-1.85c-.579 0-1.046-.47-1.046-1.052c0-.581.467-1.051 1.046-1.051c.578 0 1.046.47 1.046 1.051c0 .582-.468 1.052-1.046 1.052" />
            </g>
            <defs>
                <clipPath id="SVGXv8lpc2Y"><path fill="#fff" d="M0 0h24v24H0z" /></clipPath>
            </defs>
        </g>
    </svg>
);

const ChromeIcon = ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
            <path d="m10.992 20.946l4.122-7.146M4.755 6.654L8.886 13.8m11.367-5.4H12m0 7.2a3.6 3.6 0 1 0 0-7.2a3.6 3.6 0 0 0 0 7.2" />
            <path d="M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18" />
        </g>
    </svg>
);

const RuntimeBadge = ({ runtime }: { runtime: string[] }) => {
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 12 }}>
            {runtime.map(rt => {
                const rtLower = rt.toLowerCase().trim();
                let icon = null;

                if (rtLower.includes("python")) {
                    icon = <PythonIcon size={14} />;
                } else if (rtLower.includes("bun") || rtLower.includes("node")) {
                    icon = <NodeIcon size={14} />;
                } else if (rtLower.includes("chrome")) {
                    icon = <ChromeIcon size={14} />;
                }

                if (!icon) return null;

                return (
                    <span key={rt} title={`运行环境: ${rtLower}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-glass)", width: 22, height: 22, borderRadius: 6 }}>
                        {icon}
                    </span>
                );
            })}
        </div>
    );
};

export function Store() {
    const [tools, setTools] = useState<ToolItem[]>(_globalTools || []);
    const [loading, setLoading] = useState(!_hasAttemptedFetch);
    const [error, setError] = useState(_globalError);
    const [categories, setCategories] = useState<string[]>(_globalCategories);
    const [activeCategory, setActiveCategory] = useState("全部");
    const [envStatus, setEnvStatus] = useState<EnvStatus>(getEnvStatus());
    const [readmeTool, setReadmeTool] = useState<ToolItem | null>(null);
    const [passwordTool, setPasswordTool] = useState<{ tool: ToolItem, targetVersion?: string } | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [installed, setInstalled] = useState<Record<string, any>>({});
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [versionSelectTool, setVersionSelectTool] = useState<{ tool: ToolItem, targetVersion?: string } | null>(null);
    // Per-tool selected version (defaults to newest/current)
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});
    const navigate = useNavigate();

    const [dialog, setDialog] = useState<{ open: boolean; type: DialogType; title: string; message: string }>({
        open: false,
        type: "info",
        title: "",
        message: "",
    });

    const showAlert = (type: DialogType, title: string, message: string) => {
        setDialog({ open: true, type, title, message });
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdown(null);
        document.addEventListener("click", handleClickOutside);
        return () => document.removeEventListener("click", handleClickOutside);
    }, []);

    const log = (source: string, message: string, stream: "STDOUT" | "STDERR" = "STDOUT") => {
        console.log("[Store] Dispatching log event:", source, message, stream);
        window.dispatchEvent(new CustomEvent("tool-log-web", { detail: { id: source, message, stream } }));
    };

    useEffect(() => {
        const unsub = subscribeEnvStatus(setEnvStatus);
        const now = Date.now();
        // 如果已经尝试过拉取（成功或失败），且距离上次拉取不到 5 分钟，就只刷新本地状态
        if (_hasAttemptedFetch && (now - _lastFetchTime < 5 * 60 * 1000)) {
            fetchLocalManifestOnly();
        } else {
            fetchTools();
        }

        return () => {
            unsub();
        };
    }, []);

    async function fetchLocalManifestOnly() {
        try {
            const manifest: any = await invoke("get_manifest");
            if (manifest && manifest.installed_tools) {
                setInstalled(manifest.installed_tools);
            }
        } catch (e) {
            console.error("Failed to load local manifest:", e);
        } finally {
            setLoading(false);
            if (_globalError) {
                setError(_globalError);
            }
        }
    }

    async function fetchTools() {
        setLoading(true);
        setError("");
        _globalError = "";
        _hasAttemptedFetch = true;
        _lastFetchTime = Date.now();
        try {
            log("Store", "正在拉取本地已安装插件...");
            // Load local manifest to check for updates
            const manifest: any = await invoke("get_manifest");
            if (manifest && manifest.installed_tools) {
                setInstalled(manifest.installed_tools);
            }

            const config = await getConfig();
            const registryUrls = config.registry_urls || [];
            const proxyUrl = config.proxy_url || "";

            if (registryUrls.length === 0) {
                log("Store", "未配置任何插件源地址，跳过拉取");
                setTools([]);
                return;
            }

            log("Store", `正在并发拉取 ${registryUrls.length} 个插件源...`);

            const fetchPromises = registryUrls.map(async (url) => {
                let fetchUrl = url;
                if (proxyUrl) {
                    let cleanProxy = proxyUrl.endsWith('/') ? proxyUrl : proxyUrl + '/';
                    let cleanUrl = url.replace(/^https?:\/\//, '');
                    fetchUrl = cleanProxy + cleanUrl;
                }
                try {
                    const res = await fetch(fetchUrl);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data: ToolItem[] = await res.json();
                    return data;
                } catch (err) {
                    log("Store", `⚠️ 从源 [${url}] 拉取失败: ${err}`, "STDERR");
                    return [] as ToolItem[];
                }
            });

            const results = await Promise.all(fetchPromises);

            // Deduplicate and merge by tool id
            const mergedMap = new Map<string, ToolItem>();
            for (const toolList of results) {
                for (const tool of toolList) {
                    mergedMap.set(tool.id, tool);
                }
            }

            const data = Array.from(mergedMap.values());

            _globalTools = data;
            _lastFetchTime = Date.now();
            setTools(data);

            log("Store", `拉取成功，共 ${data.length} 个有效插件记录`);
            // Derive categories
            const cats = new Set(data.map((t) => t.category));
            const newCats = ["全部", ...Array.from(cats)];
            _globalCategories = newCats;
            setCategories(newCats);
        } catch (e: any) {
            console.error("Failed to fetch tools:", e);
            log("Store", `❌ 拉取失败: ${e.message || e}`, "STDERR");
            const errorMsg = "无法获取插件列表，请检查网络或插件源配置是否正确。";
            _globalError = errorMsg;
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    }

    function PlatformBadge({ platform }: { platform: string }) {
        return (
            <span className="platform-badge" title={platform}>
                {platform === "macos" ? <Apple size={12} /> : <Monitor size={12} />}
            </span>
        );
    }

    function AuthorBadge({ author }: { author: string }) {
        return <span className="author-badge">{author}</span>;
    }

    /* ---- README Modal ---- */
    function ReadmeModal({ tool, onClose }: { tool: ToolItem; onClose: () => void }) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content glass readme-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>{tool.name}</h3>
                        <button className="modal-close" onClick={onClose}><X size={18} /></button>
                    </div>
                    <div className="modal-body readme-body">
                        {tool.readme ? (
                            <div className="markdown-content">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{tool.readme}</ReactMarkdown>
                            </div>
                        ) : (
                            <p className="readme-empty">该插件暂无 README 文档。</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* ---- Password Unlock Modal ---- */
    function PasswordModal({ tool, onClose, onUnlock }: { tool: ToolItem; onClose: () => void; onUnlock: (pw: string) => void }) {
        const [password, setPassword] = useState("");

        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content glass password-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>
                            <KeyRound size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
                            解锁插件
                        </h3>
                        <button className="modal-close" onClick={onClose}><X size={18} /></button>
                    </div>
                    <div className="modal-body">
                        <p className="password-hint">
                            「{tool.name}」插件已启用加密保护，请输入密码以获取。
                        </p>
                        <input
                            className="password-input"
                            type="password"
                            placeholder="请输入插件密码"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && password && onUnlock(password)}
                            autoFocus
                        />
                        <button
                            className="password-submit-btn"
                            disabled={!password}
                            onClick={() => onUnlock(password)}
                        >
                            解锁并获取
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    /* ---- Version Select Modal ---- */
    function VersionSelectModal({
        tool,
        onClose,
        onConfirm,
    }: {
        tool: ToolItem;
        onClose: () => void;
        onConfirm: (pythonPath?: string, nodePath?: string) => void;
    }) {
        const runtime = tool.runtime || ["none"];
        const versionReq = runtime.includes("python") ? tool.python_version : tool.node_version;
        const installedVersions = runtime.includes("python") ? envStatus.pythonVersions : envStatus.nodeVersions;

        const parseVersionReq = (req?: string) => {
            if (!req) return null;
            const match = req.match(/>=?(\d+\.?\d*)/);
            return match ? parseFloat(match[1]) : null;
        };

        const minVersion = parseVersionReq(versionReq);

        const getBestVersion = () => {
            let candidates = installedVersions;
            if (minVersion !== null) {
                candidates = installedVersions.filter((v: { version: string; path: string }) => {
                    const ver = parseFloat(v.version.split(".").slice(0, 2).join("."));
                    return ver >= minVersion;
                });
            }
            return candidates[0]?.path || installedVersions[0]?.path;
        };

        const [selectedPath, setSelectedPath] = useState(getBestVersion());

        const isRecommended = (version: string) => {
            if (minVersion === null) return false;
            const ver = parseFloat(version.split(".").slice(0, 2).join("."));
            return ver >= minVersion;
        };

        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content glass version-select-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3>
                            <Monitor size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
                            选择运行版本
                        </h3>
                        <button className="modal-close" onClick={onClose}><X size={18} /></button>
                    </div>
                    <div className="modal-body">
                        <p className="version-select-hint">
                            「{tool.name}」需要 {runtime.includes("python") ? "Python" : "Node.js"} 运行环境
                            {versionReq && <span className="version-req">（要求 {versionReq}）</span>}。
                            请选择用于创建虚拟环境的版本：
                        </p>
                        <div className="version-options">
                            {installedVersions.map((v: { version: string; path: string }) => (
                                <label
                                    key={v.path}
                                    className={`version-option ${selectedPath === v.path ? "selected" : ""}`}
                                >
                                    <input
                                        type="radio"
                                        name="version"
                                        value={v.path}
                                        checked={selectedPath === v.path}
                                        onChange={() => setSelectedPath(v.path)}
                                    />
                                    <span className="version-info">
                                        <span className="version-number">v{v.version}</span>
                                        {isRecommended(v.version) && (
                                            <span className="recommended-badge">符合要求</span>
                                        )}
                                    </span>
                                    <span className="version-path">{v.path}</span>
                                </label>
                            ))}
                        </div>
                        <button
                            className="version-confirm-btn"
                            disabled={!selectedPath}
                            onClick={() => {
                                if (runtime.includes("python")) {
                                    onConfirm(selectedPath, undefined);
                                } else {
                                    onConfirm(undefined, selectedPath);
                                }
                            }}
                        >
                            确认并安装
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const filtered = tools.filter(
        (t) => activeCategory === "全部" || t.category === activeCategory
    );

    async function handleInstall(tool: ToolItem) {
        const targetVersion = selectedVersions[tool.id]; // undefined = latest

        // Handle OS compatibility check
        const getOsType = () => {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.includes("mac")) return "macos";
            if (ua.includes("win")) return "windows";
            if (ua.includes("linux")) return "linux";
            return "unknown";
        };
        const currentOs = getOsType();
        if (tool.platforms && tool.platforms.length > 0 && !tool.platforms.includes(currentOs)) {
            const osDisplay: Record<string, string> = { "macos": "macOS", "windows": "Windows", "linux": "Linux" };
            showAlert("warning", "平台暂不支持", `此插件仅支持 ${tool.platforms.map(p => osDisplay[p] || p).join("、")} 系统，你目前的操作系统为 ${osDisplay[currentOs] || currentOs}。很抱歉，当前环境可能无法运行此插件。`);
            return;
        }

        if (!isEnvReady(tool)) {
            navigate("/environment");
            return;
        }
        if (tool.runtime?.includes("python") || tool.runtime?.includes("bun") || tool.runtime?.includes("node")) {
            setVersionSelectTool({ tool, targetVersion });
            return;
        }
        if (tool.is_encrypted) {
            setPasswordTool({ tool, targetVersion });
            return;
        }
        performDownload(tool, null, targetVersion);
    }

    function handleUnlock(password: string) {
        if (passwordTool) {
            performDownload(passwordTool.tool, password, passwordTool.targetVersion);
            setPasswordTool(null);
        }
    }

    async function performDownload(
        tool: ToolItem,
        password: string | null,
        targetVersion?: string,
        selectedPythonPath?: string,
        selectedBunPath?: string
    ) {
        log("Store", `开始下载/安装插件: ${tool.name} (ID: ${tool.id})`);
        try {
            setDownloading(tool.id);
            const downloadUrl = tool.download_url;

            const effectiveVersion = targetVersion || tool.version;
            log("Store", `正在从 ${downloadUrl} 获取插件文件...`);

            const destDir: string = await invoke("download_tool", {
                id: tool.id,
                url: downloadUrl,
                isEncrypted: tool.is_encrypted,
                password: password,
                runtime: tool.runtime,
                pythonPath: selectedPythonPath,
                bunPath: selectedBunPath
            });

            log("Store", `文件已写入并准备完毕，解压路径: ${destDir}`);

            const manifest: any = await invoke("get_manifest");
            if (!manifest.installed_tools) manifest.installed_tools = {};
            manifest.installed_tools[tool.id] = {
                version: effectiveVersion,
                installed_at: new Date().toISOString(),
                dependency_hash: "",
                local_path: destDir,
                name: tool.name,
                author: tool.author,
                category: tool.category,
                is_encrypted: tool.is_encrypted,
                runtime: tool.runtime,
                entry: tool.entry
            };
            await invoke("save_manifest", { manifest });

            setInstalled(manifest.installed_tools);

            log("Store", `安装完成。当前版本 v${effectiveVersion}`);
            showAlert("success", "安装成功", `${tool.name} (v${effectiveVersion}) 安装成功！请前往工作台查看。`);
        } catch (e: any) {
            console.error(e);
            log("Store", `❌ 下载或安装失败: ${e.message || e}`, "STDERR");
            showAlert("error", "下载失败", e.message || e);
        } finally {
            setDownloading(null);
        }
    }

    function isEnvReady(tool: ToolItem): boolean {
        if (!tool.runtime || tool.runtime.includes("none")) return true;
        if (tool.runtime.includes("python")) return envStatus.python === "installed";
        if (tool.runtime.includes("bun") || tool.runtime.includes("node")) return envStatus.node === "installed";
        return true;
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="dash-header-row" style={{ alignItems: "center" }}>
                    <div>
                        <h2 className="page-title">插件市场</h2>
                        <p className="page-subtitle">在线获取安装插件</p>
                    </div>
                    <button
                        className="header-action-btn"
                        onClick={() => fetchTools()}
                        disabled={loading}
                        title="刷新插件列表"
                    >
                        <RefreshCw size={16} className={loading ? "spin-icon" : ""} />
                        <span>刷新列表</span>
                    </button>
                </div>
                <div className="category-tabs">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            className={`category-tab ${activeCategory === cat ? "active" : ""}`}
                            onClick={() => setActiveCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="store-empty-state">
                    <div className="spinner"></div>
                    <p>正在拉取插件列表...</p>
                </div>
            ) : error ? (
                <div className="store-empty-state">
                    <AlertTriangle size={32} style={{ color: "var(--danger)" }} />
                    <p>{error}</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="store-empty-state">
                    <p>未找到匹配的插件。</p>
                </div>
            ) : (
                <div className="tools-grid">
                    {filtered.map((tool) => (
                        <div className={`tool-card glass ${openDropdown === tool.id ? 'dropdown-open' : ''}`} key={tool.id}>
                            <div className="tool-card-header">
                                <div className="tool-meta">
                                    <div className="tool-name-row" style={{ display: 'flex', alignItems: 'center' }}>
                                        <h3 className="tool-name" style={{ margin: 0 }}>{tool.name}</h3>
                                        {tool.runtime && <RuntimeBadge runtime={tool.runtime} />}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                                        <span className="tool-version">
                                            v{tool.version}
                                        </span>
                                        <AuthorBadge author={tool.author} />
                                    </div>
                                </div>
                                {(() => {
                                    const localVer = installed[tool.id]?.version;
                                    let hasUpdate = false;
                                    if (localVer && tool.version) {
                                        const parseVer = (v: string) => v.split('-')[0].split('.').map(Number);
                                        const sv = parseVer(tool.version);
                                        const lv = parseVer(localVer);
                                        for (let i = 0; i < Math.max(sv.length, lv.length); i++) {
                                            const s = sv[i] || 0;
                                            const l = lv[i] || 0;
                                            if (s > l) { hasUpdate = true; break; }
                                            if (s < l) break;
                                        }
                                    }
                                    return localVer && hasUpdate && (
                                        <span className="update-badge" title={`已安装 v${localVer}`}>可更新</span>
                                    );
                                })()}
                                <button className="readme-btn" onClick={() => setReadmeTool(tool)} title="查看文档">
                                    <BookOpen size={16} />
                                </button>
                                {tool.is_encrypted && <Lock size={16} className="lock-icon" />}
                            </div>
                            <p className="tool-description">{tool.description}</p>
                            <div className="tool-card-footer">
                                <div className="tool-badges">
                                    <div className="platform-badges">
                                        {tool.platforms.map((p) => (
                                            <PlatformBadge key={p} platform={p} />
                                        ))}
                                    </div>
                                </div>
                                <div className="split-install-group" onClick={(e) => e.stopPropagation()}>
                                    {/* Main install / get button */}
                                    {(() => {
                                        const selVer = selectedVersions[tool.id];
                                        const effectiveVer = selVer || tool.version; // default = latest
                                        const localVer = installed[tool.id]?.version;
                                        const isInstalledVer = localVer === effectiveVer;
                                        const envReady = isEnvReady(tool);
                                        return (
                                            <button
                                                className={`install-btn ${!(tool.versions && tool.versions.length > 1 && envReady) ? "round-all" : ""} ${!envReady ? "env-missing" : ""} ${downloading === tool.id ? "downloading" : ""} ${isInstalledVer ? "already-got" : ""}`}
                                                onClick={() => !isInstalledVer && handleInstall(tool)}
                                                title={isInstalledVer ? `v${effectiveVer} 已安装` : !envReady ? "运行环境未安装，点击前往配置" : `获取 v${effectiveVer}`}
                                                disabled={downloading === tool.id || isInstalledVer}
                                            >
                                                {downloading === tool.id ? (
                                                    <>
                                                        <Loader size={12} className="spin-icon" />
                                                        <span>获取中...</span>
                                                    </>
                                                ) : isInstalledVer ? (
                                                    <>
                                                        <CheckCircle size={14} />
                                                        <span>已获取</span>
                                                    </>
                                                ) : !envReady ? (
                                                    <>
                                                        <AlertTriangle size={12} />
                                                        <span>环境</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download size={14} />
                                                        <span>获取</span>
                                                    </>
                                                )}
                                            </button>
                                        );
                                    })()}

                                    {/* Sub-versions dropdown trigger */}
                                    {tool.versions && tool.versions.length > 1 && isEnvReady(tool) && (() => {
                                        const selVer = selectedVersions[tool.id];
                                        const effectiveVer = selVer || tool.version;
                                        const isInstalledVer = installed[tool.id] && installed[tool.id].version === effectiveVer;
                                        return (
                                            <div className="dropdown-container">
                                                <button
                                                    className={`install-dropdown-btn ${downloading === tool.id ? "disabled" : ""} ${isInstalledVer ? "already-got" : ""}`}
                                                    disabled={downloading === tool.id}
                                                    onClick={() => setOpenDropdown(openDropdown === tool.id ? null : tool.id)}
                                                >
                                                    <ChevronDown size={14} />
                                                </button>

                                                {openDropdown === tool.id && (
                                                    <div className="versions-dropdown glass">
                                                        <div className="versions-header">选择版本</div>
                                                        <ul>
                                                            {tool.versions.map(v => {
                                                                const isLatest = v.version === tool.version;
                                                                const isSelected = isLatest
                                                                    ? !selectedVersions[tool.id]   // latest = no override
                                                                    : selectedVersions[tool.id] === v.version;
                                                                return (
                                                                    <li
                                                                        key={v.version}
                                                                        className={isSelected ? "version-item-active" : ""}
                                                                        onClick={() => {
                                                                            if (isLatest) {
                                                                                // Selecting latest clears the override
                                                                                setSelectedVersions(prev => { const n = { ...prev }; delete n[tool.id]; return n; });
                                                                            } else {
                                                                                setSelectedVersions(prev => ({ ...prev, [tool.id]: v.version }));
                                                                            }
                                                                            setOpenDropdown(null);
                                                                        }}
                                                                    >
                                                                        <div className="v-row">
                                                                            <span className="v-num">v{v.version}</span>
                                                                            {isLatest && <span className="v-current-tag">活动版本</span>}
                                                                            {v.changelog && (
                                                                                <span className="v-changelog-icon" title={v.changelog}>
                                                                                    <Info size={12} />
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {readmeTool && <ReadmeModal tool={readmeTool} onClose={() => setReadmeTool(null)} />}
            {passwordTool && <PasswordModal tool={passwordTool.tool} onClose={() => setPasswordTool(null)} onUnlock={handleUnlock} />}
            {versionSelectTool && (
                <VersionSelectModal
                    tool={versionSelectTool.tool}
                    onClose={() => setVersionSelectTool(null)}
                    onConfirm={(pyPath, ndPath) => {
                        if (versionSelectTool.tool.is_encrypted) {
                            setPasswordTool(versionSelectTool);
                            setVersionSelectTool(null);
                        } else {
                            performDownload(
                                versionSelectTool.tool,
                                null,
                                versionSelectTool.targetVersion,
                                pyPath,
                                ndPath
                            );
                            setVersionSelectTool(null);
                        }
                    }}
                />
            )}

            <AlertDialog
                open={dialog.open}
                type={dialog.type}
                title={dialog.title}
                message={dialog.message}
                onClose={() => setDialog({ ...dialog, open: false })}
            />
        </div>
    );
}
