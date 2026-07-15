import { useEffect, useState, useCallback } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Store } from "./pages/Store";
import { SettingsPage } from "./pages/Settings";
import { EnvironmentPage } from "./pages/Environment";
import { LogsPage } from "./pages/Logs";
import { AboutPage } from "./pages/About";
import { ConfirmDialog } from "./components/Dialog";
import { getVersion } from "@tauri-apps/api/app";
import { getConfig } from "./utils/config";
import "./App.css";

export interface UpdateInfo {
  available: boolean;
  checking: boolean;
  version: string;
  body: string;
  downloading: boolean;
  progress: number;
  message: string;
}

async function getUpdaterOptions() {
  const config = await getConfig();
  const proxy = config.proxy_url?.trim();
  return proxy ? { proxy } : undefined;
}

function App() {
  const [theme, setTheme] = useState("dark");
  const [currentVersion, setCurrentVersion] = useState("");
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    checking: false,
    version: "",
    body: "",
    downloading: false,
    progress: 0,
    message: "",
  });
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  // 核心更新检查函数 (原生 Tauri 更新检查)
  const checkForUpdates = useCallback(async (silent = false) => {
    if (!silent) {
      setUpdateInfo(prev => ({ ...prev, checking: true, message: "正在检查更新..." }));
    }
    try {
      const ver = await getVersion();
      setCurrentVersion(ver);

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check(await getUpdaterOptions());

      if (update && update.available) {
        setUpdateInfo({
          available: true,
          checking: false,
          version: update.version,
          body: update.body || "已有新版本发布，建议更新。",
          downloading: false,
          progress: 0,
          message: "发现新版本！",
        });
        return true; // has update
      } else {
        if (!silent) {
          setUpdateInfo(prev => ({ ...prev, checking: false, message: "当前已经是最新版本", available: false }));
        }
      }
    } catch (error: any) {
      console.error("Update check failed:", error);
      if (!silent) {
        setUpdateInfo(prev => ({ ...prev, checking: false, message: "检查更新失败。这通常是因为代码仓库还没有发布过正式的Release版本，请稍后再试。" }));
      }
    }
    return false;
  }, []);

  // 执行更新 (原生 Tauri 更新)
  const performUpdate = useCallback(async () => {
    setUpdateInfo(prev => ({ ...prev, downloading: true, progress: 0, message: "正在准备更新..." }));
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check(await getUpdaterOptions());

      if (update && update.available) {
        setUpdateInfo(prev => ({ ...prev, message: "正在下载更新..." }));

        let downloaded = 0;
        let contentLength = 0;

        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case "Started":
              contentLength = event.data.contentLength ?? 0;
              setUpdateInfo(prev => ({ ...prev, message: `正在下载... 0%` }));
              break;
            case "Progress":
              downloaded += event.data.chunkLength;
              const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
              setUpdateInfo(prev => ({ ...prev, progress: pct, message: `正在下载... ${pct}%` }));
              break;
            case "Finished":
              setUpdateInfo(prev => ({ ...prev, progress: 100, message: "下载完成，即将重启..." }));
              break;
          }
        });

        await relaunch();
        return;
      } else {
        setUpdateInfo(prev => ({ ...prev, downloading: false, message: "未检测到可用更新" }));
      }
    } catch (err: any) {
      console.error("Update failed:", err);
      setUpdateInfo(prev => ({
        ...prev,
        downloading: false,
        message: `更新失败: ${err?.message || "未知错误"}，请稍后重试`,
      }));
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);

    getVersion().then(v => setCurrentVersion(v)).catch(console.error);

    // 启动时静默检查更新，有更新则弹窗
    checkForUpdates(true).then(hasUpdate => {
      if (hasUpdate) {
        setShowUpdateDialog(true);
      }
    });
  }, [checkForUpdates]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  const location = useLocation();

  return (
    <div className="app-container">
      <div className="titlebar" data-tauri-drag-region>
        <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === "dark" ? "切换到亮色" : "切换到暗色"}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <Sidebar hasUpdate={hasPendingUpdate || updateInfo.available} />

      <main className="main-content">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store" element={<Store />} />
          <Route path="/environment" element={<EnvironmentPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={
            <AboutPage
              currentVersion={currentVersion}
              updateInfo={updateInfo}
              onCheckUpdate={() => checkForUpdates(false)}
              onPerformUpdate={performUpdate}
            />
          } />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </main>

      <ConfirmDialog
        open={showUpdateDialog}
        type="info"
        title="发现新版本"
        message={`发现新版本 ${updateInfo.version}！\n\n更新说明：\n${updateInfo.body}\n\n是否立即更新？`}
        confirmText="立即更新"
        cancelText="暂时忽略"
        onConfirm={async () => {
          setShowUpdateDialog(false);
          await performUpdate();
        }}
        onCancel={() => {
          setHasPendingUpdate(true);
          setShowUpdateDialog(false);
        }}
      />
    </div>
  );
}

export default App;
