import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import { Upload, Play, Trash2, X, FileText, RefreshCw, BookOpen, FolderOpen, FileArchive, Puzzle, ArrowDown, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, readFile } from "@tauri-apps/plugin-fs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getEnvStatus, subscribeEnvStatus, type EnvStatus } from "./Environment";
import { AlertDialog, ConfirmDialog, type DialogType } from "../components/Dialog";
import "./Dashboard.css";

interface LocalPlugin {
    id: string;
    name: string;
    version: string;
    author: string;
    category?: string;
    description?: string;
    local_path?: string;
    status: "ready" | "running";
    runtime?: string[];
    entry?: string;
}


const PLUGIN_STANDARD_MD = `# Sanka 本地插件规范

欢迎为 Sanka 开发本地插件。只需遵循以下结构，即可在工作台一键打包与安装。

## 目录结构

建议你在开发插件时，保持以下目录结构：

\`\`\`text
my-tool/
├── plugin.json          # 必须 — 核心配置与元数据
├── main.py / index.js   # 必须 — 业务逻辑入口文件
├── requirements.txt     # Python 插件 — 声明 pip 依赖
├── package.json         # Node 插件 — 声明 npm 依赖
├── README.md            # 推荐 — 详细的使用说明
└── ...                  # 其他资源文件 (如图片、配置等)
\`\`\`

## plugin.json 配置指南

\`plugin.json\` 是 Sanka 识别插件的唯一凭证，它定义了你的插件在 Sanka 中的展示信息和运行要求。

| 字段名 | 数据类型 | 必填 | 详细说明 |
|:---|:---|:---:|:---|
| \`id\` | string | Yes | 全局唯一标识符（建议全英文/数字/连字符，如 \`my-awesome-tool\`） |
| \`name\` | string | Yes | 插件在 Sanka 界面中显示的名称 |
| \`description\` | string | Yes | 简短精炼的功能描述 (建议 ≤ 100 字) |
| \`version\` | string | Yes | 语义化版本号（如 \`1.0.0\`） |
| \`author\` | string | Yes | 插件作者或团队名称 |
| \`category\` | string | Yes | 插件所属分类名（Sanka 会根据分类自动归档） |
| \`runtime\` | string \| string[] | Yes | 运行环境声明，支持 \`python\` 或 \`node\` |
| \`entry\` | string | Yes | 相对入口文件路径（如 \`src/main.py\` 或 \`index.js\`） |
| \`platforms\` | string[] | Yes | 支持的操作系统：\`["windows"]\`, \`["macos"]\`, 或两者 |
| \`python_version\`| string | No | （仅 Python）版本约束条件，如 \`">=3.10"\` |

### 运行环境约束规则

通过 \`python_version\`，你可以精确声明插件正常运行所依赖的 Python 环境版本。Sanka 会自动为用户匹配或提示不兼容的环境。

**支持的语法规范：**
- \`>=3.8\` - 大于或等于 3.8 版本
- \`>=3.10,<3.12\` - 区间限制（大于等于 3.10 且严格小于 3.12）
- \`~3.10\` - 自动兼容该次要版本下的所有补丁版本（如 3.10.x）

## 安装与分发流程

由于 Sanka 已切换为高度隐私的纯本地运行架构，你可以轻松地将开发的插件分发给他人或在多台设备间漫游：

1. **准备**：确保插件目录包含规范的 \`plugin.json\` 与入口代码文件。
2. **打包**：将该插件目录下的所有文件压缩为一个标准的 \`.zip\` 格式包。
3. **安装**：在 Sanka 的 **工作台** 页面，点击右上角的 **本地安装插件** 按钮，选择你的 ZIP 包。Sanka会解析、分配沙盒并一键安装依赖和启动！
`;

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
        <path fill="currentColor" d="M11.174 22.555c.256.139.531.218.826.218s.59-.08.826-.178l7.848-4.572c.511-.297.826-.851.826-1.445V7.454c0-.593-.315-1.148-.826-1.444l-7.848-4.572a1.75 1.75 0 0 0-1.652 0L3.326 6.01A1.67 1.67 0 0 0 2.5 7.454v9.124c0 .594.315 1.148.826 1.445l2.065 1.188c1.003.494 1.358.494 1.81.494c1.475 0 2.32-.91 2.32-2.474V8.226a.24.24 0 0 0-.235-.237H8.283a.24.24 0 0 0-.236.237v9.005c0 .693-.728 1.386-1.889.792l-2.143-1.247c-.08-.04-.118-.138-.118-.218V7.435c0-.08.039-.179.118-.218l7.848-4.552c.058-.04.157-.04.235 0l7.849 4.552c.078.04.118.119.118.218v9.123c0 .1-.04.178-.118.218l-7.849 4.572c-.059.04-.157.04-.236 0L9.857 20.14c-.059-.04-.138-.06-.197-.02c-.55.317-.649.356-1.18.534c-.118.04-.314.119.079.337zm-.885-8.985c0 1.346.708 2.929 4.15 2.929c2.478 0 3.914-.99 3.914-2.731c0-1.702-1.141-2.158-3.56-2.474c-2.44-.317-2.695-.495-2.695-1.069c0-.475.217-1.108 2.026-1.108c1.613 0 2.222.356 2.459 1.444a.23.23 0 0 0 .216.179h1.042c.06 0 .118-.04.158-.08a.3.3 0 0 0 .059-.178c-.157-1.9-1.396-2.77-3.914-2.77c-2.242 0-3.58.95-3.58 2.553c0 1.721 1.338 2.196 3.481 2.414c2.577.258 2.774.634 2.774 1.148c0 .89-.708 1.267-2.36 1.267c-2.085 0-2.538-.515-2.695-1.564c0-.118-.098-.198-.216-.198h-1.023a.24.24 0 0 0-.236.238" />
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

export function Dashboard() {
    const [installed, setInstalled] = useState<LocalPlugin[]>([]);
    const [showUpload, setShowUpload] = useState(false);
    const [showPluginDoc, setShowPluginDoc] = useState(false);
    const [readmeTool, setReadmeTool] = useState<LocalPlugin | null>(null);
    const [envStatus, setEnvStatus] = useState<EnvStatus>(getEnvStatus());
    const [rebuilding, setRebuilding] = useState<string | null>(null);
    const [showVersionSelect, setShowVersionSelect] = useState<{ plugin: LocalPlugin, action: 'rebuild' } | null>(null);
    const [showChromeGuide, setShowChromeGuide] = useState<LocalPlugin | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>("全部");

    const [dialog, setDialog] = useState<{ open: boolean; type: DialogType; title: string; message: string }>({
        open: false,
        type: "info",
        title: "",
        message: "",
    });
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: DialogType;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        open: false,
        type: "warning",
        title: "",
        message: "",
        onConfirm: () => { },
    });



    const showAlert = (type: DialogType, title: string, message: string) => {
        setDialog({ open: true, type, title, message });
    };

    const showConfirm = (type: DialogType, title: string, message: string, onConfirm: () => void) => {
        setConfirmDialog({ open: true, type, title, message, onConfirm });
    };

    const log = (source: string, message: string, stream: "STDOUT" | "STDERR" = "STDOUT") => {
        window.dispatchEvent(new CustomEvent("tool-log-web", { detail: { id: source, message, stream } }));
    };

    useEffect(() => {
        loadInstalled();
    }, []);

    useEffect(() => {
        const unsub = subscribeEnvStatus(setEnvStatus);
        return unsub;
    }, []);

    async function loadInstalled() {
        try {
            const manifest: any = await invoke("get_manifest");
            if (manifest && manifest.installed_tools) {
                const toolsArray: LocalPlugin[] = Object.entries(manifest.installed_tools).map(
                    ([id, tool]: [string, any]) => ({ ...tool, id })
                ).sort((a, b) => (a.name || "").localeCompare(b.name || "", 'zh-CN'));
                setInstalled(toolsArray);
            }
        } catch (e) {
            console.error("Failed to load local manifest:", e);
        }
    }

    const categories = useMemo(() => {
        const cats = new Set(["全部"]);
        installed.forEach((plugin) => {
            if (plugin.category) {
                cats.add(plugin.category);
            }
        });
        return Array.from(cats);
    }, [installed]);

    const filtered = useMemo(() => {
        if (activeCategory === "全部") {
            return installed;
        }
        return installed.filter((plugin) => plugin.category === activeCategory);
    }, [installed, activeCategory]);

    async function handleRun(plugin: LocalPlugin) {
        try {
            log("Dashboard", `正在启动插件 ${plugin.id}...`);
            await invoke("run_tool", { id: plugin.id });
            log("Dashboard", `插件 ${plugin.id} 启动请求已发送`);
        } catch (e: any) {
            console.error("Failed to run tool:", e);
            log("Dashboard", `❌ 启动插件 ${plugin.id} 失败：${e.message || e}`, "STDERR");
            showAlert("error", "启动失败", e.message || e);
        }
    }

    async function handleRemove(id: string) {
        showConfirm("warning", "删除插件", "删除后将同时移除插件目录和虚拟环境，此操作不可恢复。", async () => {
            try {
                log("Dashboard", `正在卸载/删除插件 ${id}...`);
                await invoke("remove_plugin", { id });
                const manifest: any = await invoke("get_manifest");
                if (manifest.installed_tools && manifest.installed_tools[id]) {
                    delete manifest.installed_tools[id];
                    await invoke("save_manifest", { manifest });
                    setInstalled((prev) => prev.filter((p) => p.id !== id));
                    log("Dashboard", `插件 ${id} 卸载成功，已删除插件目录及虚拟环境`);
                }
            } catch (e: any) {
                console.error("Failed to remove tool:", e);
                log("Dashboard", `❌ 卸载插件 ${id} 失败：${e.message || e}`, "STDERR");
                showAlert("error", "删除失败", e.message || e);
            }
        });
    }

    async function handleOpenDirectory(id: string) {
        try {
            await invoke("open_plugin_directory", { id });
        } catch (e: any) {
            console.error("Failed to open plugin directory:", e);
            log("Dashboard", `❌ 打开插件目录失败：${e.message || e}`, "STDERR");
            showAlert("error", "打开目录失败", e.message || e);
        }
    }

    async function handleRebuild(plugin: LocalPlugin, pythonPath?: string) {
        try {
            setRebuilding(plugin.id);
            log("Dashboard", `正在为插件 ${plugin.name} 重新构建依赖...`);

            const runtimes = plugin.runtime || [];
            const needsPython = runtimes.includes("python");
            const needsNode = runtimes.includes("bun") || runtimes.includes("node");

            let effectivePythonPath = pythonPath;

            if (!effectivePythonPath && needsPython && envStatus.pythonVersions.length > 0) {
                effectivePythonPath = envStatus.pythonVersions[0].path;
            }

            if (needsPython && !effectivePythonPath) {
                throw new Error("该插件需要 Python 环境，但未检测到可用的 Python");
            }
            if (needsNode && envStatus.nodeVersions.length === 0) {
                throw new Error("该插件需要 Node.js 环境，但未检测到可用的 Node.js");
            }

            await invoke("rebuild_dependencies", {
                id: plugin.id,
                pythonPath: needsPython ? effectivePythonPath : null,
            });

            log("Dashboard", `${plugin.name} 依赖重建成功`);
            showAlert("success", "重建成功", `${plugin.name} 依赖重建成功！`);
        } catch (e: any) {
            console.error(e);
            log("Dashboard", `❌ 依赖重建失败：${e.message || e}`, "STDERR");
            showAlert("error", "重建失败", e.message || e);
        } finally {
            setRebuilding(null);
        }
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <div className="dash-header-row">
                    <div>
                        <h2 className="page-title">我的工作台</h2>
                        <p className="page-subtitle">管理和上传本地插件</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="header-action-btn" onClick={() => setShowUpload(true)}>
                            <Upload size={15} />
                            <span>本地安装插件</span>
                        </button>
                    </div>
                </div>
                {installed.length > 0 && (
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
                )}
            </div>

            {installed.length === 0 ? (
                <div className="dash-empty-state">
                    <p>空空如也</p>
                    <p className="empty-hint">前往 <strong>插件市场</strong> 获取，或点击上方 <strong>本地安装插件</strong> 进行添加</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="dash-empty-state">
                    <p>该分类下暂无插件</p>
                </div>
            ) : (
                <div className="installed-list">
                    {filtered.map((plugin) => (
                        <div className="installed-item glass" key={plugin.id}>
                            <div className="installed-info">
                                <div className="installed-title-row">
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <h4 className="installed-name" style={{ margin: 0 }}>{plugin.name || plugin.id}</h4>
                                        {plugin.runtime && <RuntimeBadge runtime={plugin.runtime} />}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <button
                                            className="action-btn doc-btn"
                                            title="查看文档"
                                            onClick={() => setReadmeTool(plugin)}
                                        >
                                            <BookOpen size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="installed-meta">
                                    <span className="installed-version">v{plugin.version}</span>
                                    {plugin.author && <span className="installed-author">{plugin.author}</span>}
                                </div>
                                {plugin.description && (
                                    <p className="installed-description">{plugin.description}</p>
                                )}
                            </div>
                            <div className="installed-actions">
                                {plugin.runtime?.includes("chrome") ? (
                                    <button className="action-btn run-btn" title="加载指引" onClick={() => setShowChromeGuide(plugin)} style={{ background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa", borderColor: "rgba(59, 130, 246, 0.3)" }}>
                                        <Puzzle size={14} />
                                        <span>加载指引</span>
                                    </button>
                                ) : (
                                    <button className="action-btn run-btn" title="启动运行" onClick={() => handleRun(plugin)}>
                                        <Play size={14} />
                                        <span>运行</span>
                                    </button>
                                )}
                                <div className="action-group" style={{ marginLeft: "auto" }}>
                                    <button
                                        className="action-btn folder-btn"
                                        title="打开目录"
                                        onClick={() => handleOpenDirectory(plugin.id)}
                                    >
                                        <FolderOpen size={14} />
                                    </button>
                                    {!plugin.runtime?.includes("chrome") && (
                                        <button
                                            className="action-btn rebuild-btn"
                                            title="重建依赖"
                                            onClick={() => {
                                                if (plugin.runtime?.includes("python")) {
                                                    setShowVersionSelect({ plugin, action: 'rebuild' });
                                                } else {
                                                    handleRebuild(plugin);
                                                }
                                            }}
                                            disabled={rebuilding === plugin.id}
                                        >
                                            {rebuilding === plugin.id ? (
                                                <RefreshCw size={14} className="spin-icon" />
                                            ) : (
                                                <RefreshCw size={14} />
                                            )}
                                        </button>
                                    )}
                                    <button className="action-btn remove-btn" title="删除" onClick={() => handleRemove(plugin.id)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showUpload && (
                <UploadModal
                    onClose={() => setShowUpload(false)}
                    onShowDoc={() => { setShowPluginDoc(true); }}
                    onInstall={loadInstalled}
                />
            )}

            {showPluginDoc && <PluginDocModal onClose={() => setShowPluginDoc(false)} />}

            {readmeTool && (
                <PluginReadmeModal
                    plugin={readmeTool}
                    onClose={() => setReadmeTool(null)}
                />
            )}

            {showVersionSelect && (
                <VersionSelectModal
                    plugin={showVersionSelect.plugin}
                    envStatus={envStatus}
                    onClose={() => setShowVersionSelect(null)}
                    onConfirm={(pyPath) => {
                        if (showVersionSelect.action === 'rebuild') {
                            handleRebuild(showVersionSelect.plugin, pyPath);
                        }
                        setShowVersionSelect(null);
                    }}
                />
            )}



            {showChromeGuide && (
                <ChromeGuideModal
                    onClose={() => setShowChromeGuide(null)}
                    onOpenDir={() => handleOpenDirectory(showChromeGuide.id)}
                />
            )}

            <AlertDialog
                open={dialog.open}
                type={dialog.type}
                title={dialog.title}
                message={dialog.message}
                onClose={() => setDialog({ ...dialog, open: false })}
            />

            <ConfirmDialog
                open={confirmDialog.open}
                type={confirmDialog.type}
                title={confirmDialog.title}
                message={confirmDialog.message}
                onConfirm={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog({ ...confirmDialog, open: false });
                }}
                onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
            />
        </div>
    );
}

/* ---- Upload Modal ---- */
interface PluginMeta {
    id: string;
    name: string;
    version: string;
    author: string;
    category: string;
    description: string;
    runtime: string;   // comma-separated, e.g. "python, node"
    entry: string;
    platforms: string; // comma-separated, e.g. "windows, macos"
}

function UploadModal({ onClose, onShowDoc, onInstall }: { onClose: () => void; onShowDoc: () => void; onInstall: () => Promise<void> }) {
    const [filePath, setFilePath] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    const [zipInstance, setZipInstance] = useState<JSZip | null>(null);
    const [hadPluginJson, setHadPluginJson] = useState<boolean | null>(null);
    const [showMetaEditor, setShowMetaEditor] = useState(false);

    const [meta, setMeta] = useState<PluginMeta>({
        id: "", name: "", version: "1.0.0", author: "",
        category: "效率工具", description: "", runtime: "python", entry: "main.py", platforms: "windows, macos"
    });

    const [dialog, setDialog] = useState<{ open: boolean; type: DialogType; title: string; message: string; onCloseCallback?: () => void }>({
        open: false, type: "info", title: "", message: "",
    });
    const showAlert = (type: DialogType, title: string, message: string, onCloseCallback?: () => void) =>
        setDialog({ open: true, type, title, message, onCloseCallback });

    const [envStatus, setEnvStatus] = useState<EnvStatus>(getEnvStatus());
    const [uploadVersionSelectPlugin, setUploadVersionSelectPlugin] = useState<LocalPlugin | null>(null);
    const [validationErrors, setValidationErrors] = useState<{ file?: boolean; meta?: boolean }>({});
    const log = (source: string, message: string, stream: "STDOUT" | "STDERR" = "STDOUT") =>
        window.dispatchEvent(new CustomEvent("tool-log-web", { detail: { id: source, message, stream } }));

    useEffect(() => subscribeEnvStatus(setEnvStatus), []);

    async function handleSelectFile() {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: "Plugin Package", extensions: ["zip"] }],
            });
            if (!selected) return;
            setValidationErrors(prev => ({ file: false, meta: prev.meta }));
            const path = selected as string;
            setFilePath(path);
            const name = path.split(/[/\\]/).pop() || "plugin.zip";

            // Read and parse the ZIP in memory
            const bytes = await readFile(path);
            const zip = await JSZip.loadAsync(bytes);
            setZipInstance(zip);

            const defaultMeta: PluginMeta = {
                id: "", name: "", version: "", author: "",
                category: "", description: "", runtime: "", entry: "", platforms: ""
            };

            // Try to extract plugin.json
            const pluginJsonFile = zip.file("plugin.json");
            if (pluginJsonFile) {
                try {
                    const jsonText = await pluginJsonFile.async("string");
                    const parsed = JSON.parse(jsonText);
                    setHadPluginJson(true);
                    setMeta({
                        ...defaultMeta,
                        id: parsed.id || "",
                        name: parsed.name || "",
                        version: parsed.version || "1.0.0",
                        author: parsed.author || "",
                        category: parsed.category || "效率工具",
                        description: parsed.description || "",
                        runtime: Array.isArray(parsed.runtime)
                            ? parsed.runtime.join(", ")
                            : (parsed.runtime || "python"),
                        entry: parsed.entry || "main.py",
                        platforms: Array.isArray(parsed.platforms)
                            ? parsed.platforms.join(", ")
                            : (parsed.platforms || "windows, macos"),
                    });
                } catch {
                    setHadPluginJson(false);
                    const suggestedId = name.replace(/\.zip$/i, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
                    setMeta({ ...defaultMeta, id: suggestedId });
                }
            } else {
                setHadPluginJson(false);
                // derive a suggested ID from the filename
                const suggestedId = name.replace(/\.zip$/i, "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
                setMeta({ ...defaultMeta, id: suggestedId });
            }
        } catch (err) {
            console.error("Failed to select / parse file:", err);
        }
    }

    async function handleUpload(pythonPath?: string, versionSelected = false) {
        // Reset errors at start of each upload attempt
        setValidationErrors({});
        const errors: { file?: boolean; meta?: boolean } = {};

        if (!filePath || !zipInstance) {
            errors.file = true;
        }

        // Validate mandatory metadata fields
        const isMetaIncomplete = !meta.id.trim() || !meta.version.trim() || !meta.name.trim() ||
            !meta.category.trim() || !meta.entry.trim() ||
            !meta.runtime?.trim() || !meta.platforms?.trim();

        if (isMetaIncomplete) {
            errors.meta = true;
        }

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            // Auto-clear after 2 seconds so it can re-trigger on next click
            setTimeout(() => setValidationErrors({}), 2000);
            return;
        }

        const runtimeArr = meta.runtime.split(",").map(s => s.trim()).filter(Boolean);
        if (!versionSelected && runtimeArr.includes("python")) {
            setUploadVersionSelectPlugin({
                id: meta.id.trim(),
                name: meta.name.trim() || meta.id.trim(),
                version: meta.version.trim(),
                author: meta.author.trim(),
                category: meta.category.trim(),
                description: meta.description.trim(),
                runtime: runtimeArr,
                entry: meta.entry.trim(),
                status: "ready",
            });
            return;
        }

        setUploading(true);
        let tempZipPath: string | null = null;

        try {
            // 1. Build updated plugin.json and inject it back into the ZIP
            if (!zipInstance) return;
            const platformsArr = meta.platforms.split(",").map(s => s.trim()).filter(Boolean);
            const pluginJsonContent = JSON.stringify({
                id: meta.id.trim(),
                name: meta.name.trim(),
                version: meta.version.trim(),
                author: meta.author.trim(),
                category: meta.category.trim(),
                description: meta.description.trim(),
                runtime: runtimeArr.length === 1 ? runtimeArr[0] : runtimeArr,
                entry: meta.entry.trim(),
                platforms: platformsArr,
            }, null, 2);

            zipInstance.file("plugin.json", pluginJsonContent);
            const newZipBytes = await zipInstance.generateAsync({ type: "uint8array" });

            // 2. Write to a temp file so Rust's install_local_plugin can read it
            const dataDir = await appDataDir();
            tempZipPath = await join(dataDir, "temp_upload", `${meta.id || "plugin"}.zip`);
            await invoke("write_bytes_to_file", { path: tempZipPath, bytes: Array.from(newZipBytes) });

            // 3. Local install from the temp path
            log("Dashboard", "正在执行本地安装...");

            const result = await invoke<{
                id: string; name: string; version: string; description: string;
                author: string; category: string; runtime: string[]; entry: string; platforms: string[];
            }>("install_local_plugin", { zipPath: tempZipPath, pythonPath });

            const manifest: any = await invoke("get_manifest");
            if (!manifest.installed_tools) manifest.installed_tools = {};
            manifest.installed_tools[result.id] = {
                version: result.version,
                installed_at: new Date().toISOString(),
                dependency_hash: "",
                local_path: await join(dataDir, "tools", result.id),
                name: result.name,
                author: result.author,
                category: result.category,
                runtime: runtimeArr,
                entry: result.entry,
            };
            await invoke("save_manifest", { manifest });
            log("Dashboard", `本地安装成功，插件：${result.name} v${result.version}`);

            showAlert("success", "安装成功", `插件：${result.name} v${result.version}\n作者：${result.author}`, () => { onClose(); onInstall(); });



        } catch (err: any) {
            console.error(err);
            log("Dashboard", `❌ 本地安装失败：${err.message || err}`, "STDERR");
            showAlert("error", "安装失败", err.message || err);
        } finally {
            setUploading(false);
            // Clean up temp file
            if (tempZipPath) {
                try { await invoke("remove_file", { path: tempZipPath }); } catch { /* ignore */ }
            }
        }
    }

    // Whether the metadata section should be highlighted (no plugin.json found and info incomplete)
    const metaMissing = hadPluginJson === false && (
        !meta.id.trim() || !meta.version.trim() || !meta.name.trim() ||
        !meta.category.trim() || !meta.entry.trim() ||
        !meta.runtime?.trim() || !meta.platforms?.trim()
    );

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="upload-modal solid-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <h3>本地安装插件</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <p className="upload-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>请按照</span>
                        <a href="#" onClick={(e) => { e.preventDefault(); onShowDoc(); }} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--accent-color)',
                            textDecoration: 'none',
                            fontWeight: 600
                        }}>
                            <FileText size={14} />
                            插件标准规范
                        </a>
                        <span>准备好工具目录，打包为 <code>.zip</code> 上传。</span>
                    </p>

                    {/* File picker */}
                    <div className={`upload-dropzone ${validationErrors.file ? "error-breathing" : ""}`} onClick={handleSelectFile} style={{
                        cursor: "pointer",
                        padding: "20px",
                        background: filePath ? "rgba(255, 255, 255, 0.03)" : "transparent"
                    }}>
                        {filePath ? (
                            <FileArchive size={32} style={{ color: "var(--text-secondary)" }} />
                        ) : (
                            <Upload size={32} />
                        )}
                        <p style={{ margin: "8px 0 0" }}>{filePath ? `已添加：${filePath.split(/[/\\]/).pop()}` : "点击选择 .zip 插件包"}</p>
                    </div>

                    {/* Metadata summary & entry button – shown after file is selected */}
                    {hadPluginJson !== null && (
                        <div className={validationErrors.meta ? "error-breathing" : ""} style={{
                            border: `1px solid ${metaMissing ? "rgba(239,68,68,0.5)" : "var(--border-color)"}`,
                            borderRadius: 10,
                            padding: "12px 14px",
                            background: metaMissing ? "rgba(239,68,68,0.06)" : "var(--bg-secondary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: metaMissing ? "var(--error)" : "var(--text-secondary)" }}>
                                            {metaMissing ? "缺少plugin.json" : (meta.name || meta.id)}
                                        </span>
                                    </div>
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                        {metaMissing ? "请补充缺失元数据" : `版本 v${meta.version} · ${meta.runtime || "none"}`}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="action-btn"
                                onClick={() => setShowMetaEditor(true)}
                                style={{
                                    padding: "6px 14px",
                                    fontSize: "0.80rem",
                                    fontWeight: 500,
                                    borderRadius: 6,
                                    background: metaMissing ? "var(--error)" : "var(--accent-color)",
                                    color: "white",
                                    border: "none",
                                    cursor: "pointer",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                    transition: "all 0.2s",
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
                                    marginLeft: 10
                                }}
                            >
                                编辑
                            </button>
                        </div>
                    )}


                    <button
                        className="upload-submit-btn"
                        style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "none", background: "var(--accent-color)", color: "white", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer" }}
                        onClick={() => handleUpload()}
                        disabled={uploading}
                    >
                        {uploading ? "处理中..." : "确认安装"}
                    </button>

                </div>
            </div>

            {showMetaEditor && (
                <MetadataEditorModal
                    meta={meta}
                    onSave={(newMeta) => {
                        setMeta(newMeta);
                        setShowMetaEditor(false);
                        if (validationErrors.meta) setValidationErrors(prev => ({ ...prev, meta: false }));
                    }}
                    onClose={() => setShowMetaEditor(false)}
                />
            )}

            {uploadVersionSelectPlugin && (
                <VersionSelectModal
                    plugin={uploadVersionSelectPlugin}
                    envStatus={envStatus}
                    mode="install"
                    onClose={() => setUploadVersionSelectPlugin(null)}
                    onConfirm={(pyPath) => {
                        setUploadVersionSelectPlugin(null);
                        handleUpload(pyPath, true);
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
        </div>,
        document.body
    );
}

/* ---- Metadata Editor Sub-Modal ---- */
const SUPPORTED_RUNTIMES = ["python", "node", "bun", "chrome", "none"];

function MetadataEditorModal({ meta, onSave, onClose }: {
    meta: PluginMeta;
    onSave: (m: PluginMeta) => void;
    onClose: () => void;
}) {
    const [tempMeta, setTempMeta] = useState<PluginMeta>({ ...meta });
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const setField = (f: keyof PluginMeta, v: string) => {
        setTempMeta(p => ({ ...p, [f]: v }));
        if (errorMsg) setErrorMsg(null);
    };

    const handleConfirm = () => {
        if (!tempMeta.id?.trim()) return setErrorMsg("插件 ID 不能为空");
        if (!/^[a-zA-Z0-9_-]{3,50}$/.test(tempMeta.id.trim())) return setErrorMsg("插件 ID 必须是 3-50 位的字母、数字、短划线或下划线 (不支持中文和空格)");
        if (!tempMeta.version?.trim()) return setErrorMsg("版本不能为空");
        if (!tempMeta.name?.trim()) return setErrorMsg("名称不能为空");
        if (!tempMeta.category?.trim()) return setErrorMsg("分类不能为空");
        if (!tempMeta.entry?.trim()) return setErrorMsg("入口文件不能为空");
        if (!tempMeta.runtime?.trim()) return setErrorMsg("运行环境不能为空");

        // Normalize to lowercase and validate
        const runtimeValues = tempMeta.runtime.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        const invalidRuntimes = runtimeValues.filter(r => !SUPPORTED_RUNTIMES.includes(r));
        if (invalidRuntimes.length > 0) {
            return setErrorMsg(`不支持的运行环境：「${invalidRuntimes.join("、")}」。可选：${SUPPORTED_RUNTIMES.join("、")}`);
        }

        if (!tempMeta.platforms?.trim()) return setErrorMsg("支持平台不能为空");

        // Save with normalized (lowercase) runtime
        onSave({ ...tempMeta, runtime: runtimeValues.join(", ") });
    };

    return createPortal(
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-content solid-modal" style={{ maxWidth: 500, padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                <div className="modal-header" style={{ padding: "16px 20px" }}>
                    <h3>编辑元数据</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body" style={{ padding: "20px" }}>


                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ flex: 2 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>插件 ID <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.id} onChange={e => setField("id", e.target.value)} placeholder="my-plugin-id" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>版本 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.version} onChange={e => setField("version", e.target.value)} placeholder="1.0.0" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ flex: 2 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>名称 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.name} onChange={e => setField("name", e.target.value)} placeholder="插件显示名称" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>作者</label>
                                <input className="metadata-input" value={tempMeta.author} onChange={e => setField("author", e.target.value)} placeholder="作者名" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>分类 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.category} onChange={e => setField("category", e.target.value)} placeholder="效率工具" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: 2 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>入口文件 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.entry} onChange={e => setField("entry", e.target.value)} placeholder="main.py 或 index.js" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>运行环境 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.runtime || ""} onChange={e => setField("runtime", e.target.value)} placeholder="chrome / python / bun / none" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>支持平台 <span style={{ color: 'red' }}>*</span></label>
                                <input className="metadata-input" value={tempMeta.platforms} onChange={e => setField("platforms", e.target.value)} placeholder="windows, macos" style={{ width: "100%", boxSizing: "border-box" }} />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500, display: "block", marginBottom: 4 }}>简短描述</label>
                            <input className="metadata-input" value={tempMeta.description} onChange={e => setField("description", e.target.value)} placeholder="简短描述工具用途" style={{ width: "100%", boxSizing: "border-box" }} />
                        </div>

                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                            {errorMsg && <div style={{ color: "var(--error)", fontSize: "0.8rem", textAlign: "center" }}>{errorMsg}</div>}
                            <div style={{ display: "flex", gap: 10 }}>
                                <button className="action-btn" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8 }}>取消</button>
                                <button className="run-btn" onClick={handleConfirm} style={{ flex: 2, padding: "10px", borderRadius: 8, background: "var(--accent-color)", color: "white", border: "none" }}>确认修改</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}


/* ---- Plugin Readme Modal ---- */
function PluginReadmeModal({ plugin, onClose }: { plugin: LocalPlugin; onClose: () => void }) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            if (!plugin.local_path) {
                setContent(null);
                setLoading(false);
                return;
            }
            try {
                const text = await readTextFile(`${plugin.local_path}/README.md`);
                setContent(text);
            } catch {
                setContent(null);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [plugin]);

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content solid-modal plugin-doc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{plugin.name || plugin.id} — 文档</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body plugin-doc-body">
                    {loading ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>加载中...</p>
                    ) : content ? (
                        <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>未找到 README.md 文档</p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ---- Plugin Standard Doc Modal ---- */
function PluginDocModal({ onClose }: { onClose: () => void }) {
    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content solid-modal plugin-doc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>插件标准规范</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body plugin-doc-body">
                    <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{PLUGIN_STANDARD_MD}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ---- Version Select Modal ---- */
function VersionSelectModal({
    plugin,
    envStatus,
    mode = "rebuild",
    onClose,
    onConfirm,
}: {
    plugin: LocalPlugin;
    envStatus: EnvStatus;
    mode?: "rebuild" | "install";
    onClose: () => void;
    onConfirm: (pythonPath?: string) => void;
}) {
    const runtime = plugin.runtime || ["python"];
    const isPythonPlugin = runtime.includes("python");

    const getBestVersion = (rt: string[]) => {
        let candidates = rt.includes("python") ? envStatus.pythonVersions : [];
        return candidates[0]?.path || "";
    };

    const [selectedPath, setSelectedPath] = useState(getBestVersion(runtime));

    const versions = isPythonPlugin ? envStatus.pythonVersions : [];
    const isInstallMode = mode === "install";

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content solid-modal version-select-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>
                        <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
                        {isInstallMode ? "选择运行版本" : "重建依赖"}
                    </h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body">
                    <p className="version-select-hint">
                        「{plugin.name}」插件需要{isInstallMode ? "安装" : "重建"}依赖。请选择 Python 运行环境版本：
                    </p>

                    {versions.length > 0 ? (
                        <div className="version-section">
                            <h4>Python 版本</h4>
                            <div className="version-options">
                                {versions.map((v: any) => (
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
                                        </span>
                                        <span className="version-path">{v.path}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                            未检测到已安装的 Python 环境，请先在「运行环境」页面安装。
                        </p>
                    )}

                    <button
                        className="version-confirm-btn"
                        disabled={versions.length === 0}
                        onClick={() => {
                            onConfirm(selectedPath);
                        }}
                    >
                        {isInstallMode ? "确认并安装" : "确认重建"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}


function ChromeGuideModal({ onClose, onOpenDir }: { onClose: () => void; onOpenDir: () => void }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText("chrome://extensions/");
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    useEffect(() => {
        const containers = document.querySelectorAll('.page-container, .main-content');
        const originalStyles = Array.from(containers).map(el => (el as HTMLElement).style.overflow);

        containers.forEach(el => {
            (el as HTMLElement).style.overflow = "hidden";
        });
        document.body.style.overflow = "hidden";

        return () => {
            containers.forEach((el, index) => {
                (el as HTMLElement).style.overflow = originalStyles[index];
            });
            document.body.style.overflow = "auto";
        };
    }, []);

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="upload-modal glass" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10, paddingBottom: 16 }}>
                    <h3>Chrome 扩展挂载指引</h3>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 6 }}>

                    {/* Step 1 */}
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 10, border: "1px solid var(--border-glass)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: "var(--accent-color)", color: "#fff", width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 600 }}>1</span>
                            开启开发者模式
                        </h4>
                        <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            打开扩展管理页面，或复制下方地址（以Chrome为例），并在浏览器打开，并确保右上角的 <strong>「开发者模式」</strong> 已开启。
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 8 }}>
                            <code style={{ flex: 1, color: "var(--accent-color)", fontSize: "0.9rem" }}>chrome://extensions/</code>
                            <button onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-secondary)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "4px 10px", borderRadius: 6, fontSize: "0.8rem", cursor: "pointer", transition: "all 0.2s" }} className="hover-brightness">
                                {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                                {copied ? "已复制" : "复制"}
                            </button>
                        </div>
                        <img src="/chrome-guide-1.gif" alt="Step 1" style={{ width: "100%", borderRadius: 8, marginTop: 16, border: "1px solid var(--border-glass)", background: "rgba(0,0,0,0.1)", minHeight: 30, objectFit: "cover" }} />
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", color: "var(--text-muted)", margin: "-10px 0" }}>
                        <ArrowDown size={20} />
                    </div>

                    {/* Step 2 */}
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 10, border: "1px solid var(--border-glass)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: "var(--accent-color)", color: "#fff", width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 600 }}>2</span>
                            打开挂载
                        </h4>
                        <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            点击下方按钮找到需要安装的 <strong>「插件名称.zip」</strong>，长按拖入 <strong>Chrome 扩展管理页面</strong> 即可。
                        </p>
                        <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            * 如受安全策略影响导致拖入失败，需要先<strong> 解压zip文件 </strong>，然后在<strong>Chrome扩展管理页面</strong>， 点击 <strong>「加载已解压扩展程序」</strong> 按钮，选择解压后的文件夹。
                        </p>
                        <button className="hover-brightness" onClick={onOpenDir} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 8, fontSize: "0.95rem", background: "var(--accent-color)", border: "1px solid rgba(255, 255, 255, 0.2)", color: "white", cursor: "pointer", transition: "all 0.2s" }}>
                            <FolderOpen size={18} />
                            打开扩展目录
                        </button>
                        <img src="/chrome-guide-2.gif" alt="Step 2" style={{ width: "100%", borderRadius: 8, marginTop: 16, border: "1px solid var(--border-glass)", background: "rgba(0,0,0,0.1)", minHeight: 120, objectFit: "cover" }} />
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", color: "var(--text-muted)", margin: "-10px 0" }}>
                        <ArrowDown size={20} />
                    </div>

                    {/* Step 3 */}
                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 10, border: "1px solid var(--border-glass)" }}>
                        <h4 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: "var(--accent-color)", color: "#fff", width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 600 }}>3</span>
                            找到并锁定扩展
                        </h4>
                        <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            加载成功后，点击浏览器右上方的 <strong>扩展图标</strong>，找到已加载的扩展并点击 <strong>图钉</strong> 将其固定在你的工具栏上，方便使用。
                        </p>
                        <img src="/chrome-guide-3.gif" alt="Step 3" style={{ width: "100%", borderRadius: 8, marginTop: 4, border: "1px solid var(--border-glass)", background: "rgba(0,0,0,0.1)", minHeight: 120, objectFit: "cover" }} />
                    </div>

                </div>
            </div>
        </div >,
        document.body
    );
}
