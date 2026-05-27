import { Github, ExternalLink, RefreshCw, Download, Info } from "lucide-react";
import type { UpdateInfo } from "../App";
import "./About.css";

interface AboutPageProps {
    currentVersion: string;
    updateInfo: UpdateInfo;
    onCheckUpdate: () => void;
    onPerformUpdate: () => void;
}

export function AboutPage({ currentVersion, updateInfo, onCheckUpdate, onPerformUpdate }: AboutPageProps) {
    const handleOpenLink = (url: string) => {
        import("@tauri-apps/plugin-opener").then(({ openUrl }) => {
            openUrl(url);
        }).catch(console.error);
    };

    return (
        <div className="page-container about-page">
            <div className="page-header">
                <h2 className="page-title">关于</h2>
                <p className="page-subtitle">轻量级、插件化的脚本解析和发布平台</p>
            </div>

            <div className="about-content">

                <div className="about-grid">
                    <div className="about-card glass">
                        <div className="card-header">
                            <div className="header-left">
                                <Info className="card-icon" size={24} />
                                <h3>版本信息</h3>
                            </div>
                            <button
                                className="header-action-btn"
                                onClick={onCheckUpdate}
                                disabled={updateInfo.checking || updateInfo.downloading}
                            >
                                <RefreshCw size={14} className={updateInfo.checking ? "spin-icon" : ""} />
                                <span>{updateInfo.checking ? "正在检查..." : "检查更新"}</span>
                            </button>
                        </div>
                        <div className="version-info-main">
                            <p className="version-label">当前版本 v{currentVersion || "..."}</p>
                        </div>

                        {updateInfo.message && !updateInfo.available && (
                            <p className="update-status-msg">{updateInfo.message}</p>
                        )}

                        {updateInfo.available && (
                            <div className="update-available-panel">
                                <div className="update-header">
                                    <div className="update-title">
                                        <Download size={16} />
                                        <span>发现新版本: {updateInfo.version}</span>
                                    </div>
                                    <button
                                        className="update-now-btn"
                                        onClick={onPerformUpdate}
                                        disabled={updateInfo.downloading}
                                    >
                                        {updateInfo.downloading ? "更新中..." : "立即更新"}
                                    </button>
                                </div>

                                {/* 下载进度条 */}
                                {updateInfo.downloading && updateInfo.progress > 0 && (
                                    <div className="update-progress-bar">
                                        <div
                                            className="update-progress-fill"
                                            style={{ width: `${updateInfo.progress}%` }}
                                        />
                                    </div>
                                )}

                                {/* 状态消息 */}
                                {updateInfo.downloading && updateInfo.message && (
                                    <p className="update-download-msg">{updateInfo.message}</p>
                                )}

                                <div className="changelog-container">
                                    <h4>更新日志：</h4>
                                    <pre className="changelog-text">{updateInfo.body}</pre>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="about-card glass">
                        <div className="card-header">
                            <div className="header-left">
                                <Github className="card-icon" size={24} />
                                <h3>项目介绍</h3>
                            </div>
                            <button
                                className="header-action-btn"
                                onClick={() => handleOpenLink("https://github.com/Chikomago/Sanka")}
                            >
                                <span>GitHub</span>
                                <ExternalLink size={14} />
                            </button>
                        </div>
                        <p>前往Github查看详情</p>
                    </div>
                </div>

                <div className="about-footer">
                    <p>© 2026 SANKA . Built with Tauri & React.</p>
                </div>
            </div>
        </div>
    );
}
