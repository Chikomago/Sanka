import { invoke } from "@tauri-apps/api/core";

export interface AppConfig {
    registry_urls: string[];
    bun_registry: string;
    uv_mirror_url: string;
}

let cachedConfig: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }
    try {
        const config = await invoke<AppConfig>("get_config");
        cachedConfig = config;
        return config;
    } catch (e) {
        console.error("Failed to load config:", e);
        return {
            registry_urls: [],
            bun_registry: "",
            uv_mirror_url: "",
        };
    }
}

export async function saveConfig(config: AppConfig): Promise<void> {
    await invoke("save_config", { config });
    cachedConfig = config;
}

export function clearConfigCache() {
    cachedConfig = null;
}
