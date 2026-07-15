import { useState, useEffect, useRef } from "react";
import { getConfig, saveConfig, type AppConfig } from "../utils/config";
import "./Settings.css";

export function SettingsPage() {
    const [registryUrls, setRegistryUrls] = useState("");
    const [proxyUrl, setProxyUrl] = useState("");
    const [loading, setLoading] = useState(true);

    const saveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        getConfig().then((config) => {
            setRegistryUrls((config.registry_urls || []).join("\n"));
            setProxyUrl(config.proxy_url || "");
            setLoading(false);
        });
    }, []);

    const saveSettings = async () => {
        const cleanedUrls = registryUrls.split("\n").map(u => u.trim()).filter(Boolean);

        const currentConfig = await getConfig();
        const config: AppConfig = {
            ...currentConfig,
            registry_urls: cleanedUrls,
            proxy_url: proxyUrl.trim(),
        };

        try {
            await saveConfig(config);
        } catch (e: any) {
            console.error("Failed to save settings:", e);
        }
    };

    const debouncedSave = () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = window.setTimeout(() => {
            saveSettings();
        }, 500);
    };

    useEffect(() => {
        if (!loading) {
            debouncedSave();
        }
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [registryUrls, proxyUrl]);

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header">
                    <h2 className="page-title">设置</h2>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h2 className="page-title">设置</h2>
                <p className="page-subtitle">一些必要配置</p>
            </div>

            <div className="settings-body">

                {/* Registry Config */}
                <div className="settings-section glass">
                    <h3 className="settings-section-title">源配置</h3>

                    <div className="mirror-form">
                        <label className="mirror-label">
                            自定义插件源地址
                            <textarea
                                className="mirror-input"
                                placeholder="输入插件市场的数据源 URL，一行一个..."
                                value={registryUrls}
                                onChange={(e) => setRegistryUrls(e.target.value)}
                                rows={3}
                                style={{ resize: 'vertical' }}
                            />
                        </label>
                        <p style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                            客户端将从该地址获取插件市场的列表数据。配置多个源时请每行填写一个。
                        </p>
                    </div>

                    <div className="mirror-form" style={{ marginTop: '20px' }}>
                        <label className="mirror-label">
                            代理节点
                            <input
                                className="mirror-input"
                                type="text"
                                placeholder="输入加速代理 URL，如 https://gh.inkchills.cn/"
                                value={proxyUrl}
                                onChange={(e) => setProxyUrl(e.target.value)}
                            />
                        </label>
                        <p style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                            调用源地址、应用更新和下载依赖时使用的代理节点地址。清空则直连。
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
