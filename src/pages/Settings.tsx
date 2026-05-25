import { useState, useEffect, useRef } from "react";
import { getConfig, saveConfig, type AppConfig } from "../utils/config";
import "./Settings.css";

export function SettingsPage() {
    const [registryUrl, setRegistryUrl] = useState("");
    const [loading, setLoading] = useState(true);

    const saveTimerRef = useRef<number | null>(null);

    useEffect(() => {
        getConfig().then((config) => {
            setRegistryUrl(config.registry_url || "https://raw.githubusercontent.com/Chikomago/sanka-plugins/main/registry.json");
            setLoading(false);
        });
    }, []);

    const saveSettings = async () => {
        const cleanedUrl = registryUrl.trim();

        const config: AppConfig = {
            registry_url: cleanedUrl,
            bun_registry: "",
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
    }, [registryUrl]);

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
                    <h3 className="settings-section-title">插件源</h3>

                    <div className="mirror-form">
                        <label className="mirror-label">
                            自定义插件源地址 (Registry URL)
                            <input
                                className="mirror-input"
                                type="text"
                                placeholder="https://raw.githubusercontent.com/Chikomago/sanka-plugins/main/registry.json"
                                value={registryUrl}
                                onChange={(e) => setRegistryUrl(e.target.value)}
                            />
                        </label>
                        <p style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                            客户端将从该地址获取插件市场的列表数据。默认为官方 GitHub 插件源。
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
