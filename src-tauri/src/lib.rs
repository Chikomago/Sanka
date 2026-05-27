use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use std::fs;
use std::io::{self, Cursor};
use std::path::PathBuf;
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
use tauri::{AppHandle, Emitter, Manager};
use zip;

fn deserialize_runtime<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::de::Deserializer<'de>,
{
    use serde::de::Visitor;
    struct RuntimeVisitor;
    impl<'de> Visitor<'de> for RuntimeVisitor {
        type Value = Vec<String>;
        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or sequence of strings")
        }
        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> where E: serde::de::Error {
            if v.is_empty() || v == "none" { Ok(vec![]) }
            else { Ok(v.split(',').map(|s| s.trim().to_string()).collect()) }
        }
        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error> where A: serde::de::SeqAccess<'de> {
            let mut v = Vec::new();
            while let Some(elem) = seq.next_element()? { v.push(elem); }
            Ok(v)
        }
    }
    deserializer.deserialize_any(RuntimeVisitor)
}

// --- Models ---
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledTool {
    pub version: String,
    pub installed_at: String,
    pub dependency_hash: String,
    pub local_path: String,
    pub name: Option<String>,
    pub author: Option<String>,
    pub category: Option<String>,
    pub is_encrypted: Option<bool>,
    #[serde(deserialize_with = "deserialize_runtime")]
    pub runtime: Vec<String>,
    pub entry: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Manifest {
    pub installed_tools: HashMap<String, InstalledTool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub registry_urls: Vec<String>,
    #[serde(default)]
    pub npm_registry: String,
    #[serde(default)]
    pub bun_registry: String,
    #[serde(default)]
    pub uv_mirror_url: String,
    #[serde(default)]
    pub python_mirror_url: String,
    #[serde(default)]
    pub node_mirror_url: String,
}

// --- Helpers ---
fn get_platform_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        if let Err(e) = fs::create_dir_all(&app_dir) {
            if !app_dir.exists() {
                return Err(e.to_string());
            }
        }
    }
    Ok(app_dir)
}

fn get_manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = get_platform_app_dir(app)?;
    path.push("manifest.json");
    Ok(path)
}

fn get_tools_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = get_platform_app_dir(app)?;
    path.push("tools");
    if !path.exists() {
        if let Err(e) = fs::create_dir_all(&path) {
            if !path.exists() {
                return Err(e.to_string());
            }
        }
    }
    Ok(path)
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = get_platform_app_dir(app)?;
    path.push("config.json");
    Ok(path)
}

// --- Commands ---

#[tauri::command]
async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    let config_path = get_config_path(&app)?;
    if !config_path.exists() {
        return Ok(AppConfig {
            registry_urls: vec![],
            npm_registry: "".to_string(),
            bun_registry: "".to_string(),
            uv_mirror_url: "".to_string(),
            python_mirror_url: "https://registry.npmmirror.com/-/binary/python/".to_string(),
            node_mirror_url: "https://registry.npmmirror.com/-/binary/node/".to_string(),
        });
    }
    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
async fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let config_path = get_config_path(&app)?;
    let tmp_path = config_path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, content).map_err(|e| e.to_string())?;
    fs::rename(tmp_path, config_path).map_err(|e| format!("Failed to save config: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_manifest(app: AppHandle) -> Result<Manifest, String> {
    let manifest_path = get_manifest_path(&app)?;
    if !manifest_path.exists() {
        return Ok(Manifest::default());
    }
    let content = fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let manifest: Manifest = match serde_json::from_str(&content) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("Failed to parse manifest.json: {}", e);
            return Err(format!("Failed to parse manifest: {}", e));
        }
    };
    Ok(manifest)
}

#[tauri::command]
async fn get_plugin_info(app: AppHandle, id: String) -> Result<InstalledTool, String> {
    let manifest = get_manifest(app).await?;
    manifest.installed_tools.get(&id)
        .cloned()
        .ok_or_else(|| format!("Plugin {} not found", id))
}

#[tauri::command]
async fn save_manifest(app: AppHandle, manifest: Manifest) -> Result<(), String> {
    let manifest_path = get_manifest_path(&app)?;
    let content = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(&manifest_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn download_tool(
    app: AppHandle,
    id: String,
    url: String,
    is_encrypted: bool,
    password: Option<String>,
    runtime: Vec<String>,
    _python_path: Option<String>,
    _bun_path: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(&url);

    if is_encrypted {
        if let Some(pwd) = password {
            request = request.header("X-Tool-Password", pwd);
        } else {
            return Err("Password required for encrypted tool".into());
        }
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let is_chrome = runtime.contains(&"chrome".to_string());
    
    let dest_dir = if is_chrome {
        let exts_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("chrome_extensions");
        if !exts_dir.exists() {
            fs::create_dir_all(&exts_dir).map_err(|e| e.to_string())?;
        }
        let dest_zip = exts_dir.join(format!("{}.zip", id));
        fs::write(&dest_zip, &bytes).map_err(|e| e.to_string())?;
        dest_zip
    } else {
        let tools_dir = get_tools_dir(&app)?;
        let dest = tools_dir.join(&id);

        if dest.exists() {
            fs::remove_dir_all(&dest)
                .map_err(|e| format!("Failed to remove old tool dir: {}", e))?;
        }

        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => dest.join(path),
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
        dest
    };

    if runtime.contains(&"python".to_string()) {
        setup_python_venv(&app, &dest_dir)?;
    }
    if runtime.contains(&"bun".to_string()) || runtime.contains(&"node".to_string()) {
        let config_path = get_config_path(&app)?;
        let npm_registry = if config_path.exists() {
            fs::read_to_string(config_path)
                .map(|content| {
                    let cfg = serde_json::from_str::<AppConfig>(&content).unwrap_or_default();
                    if !cfg.npm_registry.is_empty() { cfg.npm_registry } else { cfg.bun_registry }
                })
                .unwrap_or_default()
        } else {
            String::new()
        };

        setup_node_deps(&dest_dir, &npm_registry)?;
    }

    Ok(dest_dir.to_string_lossy().into_owned())
}

fn get_uv_path(app: &AppHandle) -> Result<String, String> {
    let app_dir = get_platform_app_dir(app)?;
    let uv_name = if cfg!(target_os = "windows") { "uv.exe" } else { "uv" };
    let uv_bin = app_dir.join("bin").join(uv_name);
    
    if uv_bin.exists() {
        Ok(uv_bin.to_string_lossy().to_string())
    } else {
        Err("UV_MISSING".to_string())
    }
}

#[tauri::command]
async fn get_uv_path_cmd(app: AppHandle) -> Result<String, String> {
    get_uv_path(&app)
}

#[tauri::command]
async fn check_uv_installed(app: AppHandle) -> Result<bool, String> {
    Ok(get_uv_path(&app).is_ok())
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    percentage: f64,
    message: String,
}

#[tauri::command]
async fn download_uv(app: AppHandle) -> Result<(), String> {
    let config = get_config(app.clone()).await?;
    let mirror = config.uv_mirror_url.clone();
    
    let (target_file, is_zip) = if cfg!(target_os = "windows") {
        ("uv-x86_64-pc-windows-msvc.zip", true)
    } else if cfg!(target_arch = "aarch64") {
        ("uv-aarch64-apple-darwin.tar.gz", false)
    } else {
        ("uv-x86_64-apple-darwin.tar.gz", false)
    };

    let download_url = format!(
        "{}https://github.com/astral-sh/uv/releases/latest/download/{}",
        mirror, target_file
    );

    let _ = app.emit("uv-download-progress", DownloadProgress {
        percentage: 10.0,
        message: "正在连接服务器...".to_string(),
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&download_url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let _ = app.emit("uv-download-progress", DownloadProgress {
        percentage: 50.0,
        message: "正在下载...".to_string(),
    });

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let _ = app.emit("uv-download-progress", DownloadProgress {
        percentage: 80.0,
        message: "正在解压配置环境...".to_string(),
    });

    let app_dir = get_platform_app_dir(&app)?;
    let bin_dir = app_dir.join("bin");
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    }

    if is_zip {
        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
        
        // Extract uv.exe
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            if let Some(name) = file.enclosed_name() {
                if name.file_name().unwrap_or_default() == "uv.exe" {
                    let mut outfile = fs::File::create(bin_dir.join("uv.exe")).map_err(|e| e.to_string())?;
                    io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                    break;
                }
            }
        }
    } else {
        use flate2::read::GzDecoder;
        use tar::Archive;
        
        let cursor = Cursor::new(bytes);
        let tar = GzDecoder::new(cursor);
        let mut archive = Archive::new(tar);
        
        for file in archive.entries().map_err(|e| e.to_string())? {
            let mut file = file.map_err(|e| e.to_string())?;
            let path = file.path().map_err(|e| e.to_string())?;
            
            if path.file_name().unwrap_or_default() == "uv" {
                let out_path = bin_dir.join("uv");
                let mut outfile = fs::File::create(&out_path).map_err(|e| e.to_string())?;
                io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                
                #[cfg(not(target_os = "windows"))]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(0o755));
                }
                break;
            }
        }
    }

    let _ = app.emit("uv-download-progress", DownloadProgress {
        percentage: 100.0,
        message: "配置成功！".to_string(),
    });

    Ok(())
}

fn setup_python_venv(app: &AppHandle, tool_dir: &PathBuf) -> Result<(), String> {
    let uv_path = get_uv_path(app)?;
    
    let mut cmd = Command::new(&uv_path);
    cmd.args(["venv", "--python", "3.12.13", "--clear", ".venv"])
        .current_dir(tool_dir);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let status = cmd.status()
        .map_err(|e| format!("Failed to create venv: {}", e))?;
    
    if !status.success() {
        return Err("Failed to create virtual environment via uv".to_string());
    }

    let requirements = tool_dir.join("requirements.txt");
    if requirements.exists() {
        let mut pip_cmd = Command::new(&uv_path);
        pip_cmd.args(["pip", "install", "-r", requirements.to_str().unwrap()])
            .current_dir(tool_dir);
        #[cfg(target_os = "windows")]
        pip_cmd.creation_flags(CREATE_NO_WINDOW);
        let status = pip_cmd.status()
            .map_err(|e| format!("Failed to install dependencies: {}", e))?;
        
        if !status.success() {
            return Err("Failed to install Python dependencies via uv".to_string());
        }
    }

    Ok(())
}

fn resolve_portable_bin(bin_name: &str) -> Option<String> {
    if let Some(home) = dirs::home_dir() {
        let portable = home.join(".sanka").join("node").join(bin_name);
        if portable.exists() {
            return Some(portable.to_string_lossy().to_string());
        }
    }
    None
}

fn resolve_node_cmd() -> String {
    resolve_portable_bin(if cfg!(target_os = "windows") { "node.exe" } else { "node" })
        .unwrap_or_else(|| "node".to_string())
}

fn resolve_npm_cmd() -> String {
    resolve_portable_bin(if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" })
        .unwrap_or_else(|| "npm".to_string())
}

fn setup_node_deps(tool_dir: &PathBuf, registry_url: &str) -> Result<(), String> {
    let package_json = tool_dir.join("package.json");
    if package_json.exists() {
        let mut cmd = Command::new(resolve_npm_cmd());
        cmd.arg("install");

        if !registry_url.is_empty() {
            cmd.arg("--registry");
            cmd.arg(registry_url);
        }

        cmd.current_dir(tool_dir);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let status = cmd.status()
            .map_err(|e| format!("Failed to run npm install: {}", e))?;

        if !status.success() {
            return Err("npm install failed".to_string());
        }
    }

    Ok(())
}

#[derive(Clone, Serialize)]
struct LogPayload {
    id: String,
    message: String,
    stream: String, // STDOUT or STDERR
}

#[tauri::command]
async fn run_tool(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let tools_dir = get_tools_dir(&app)?;
    let tool_cwd = tools_dir.join(&id);

    if !tool_cwd.exists() {
        return Err(format!("Tool directory not found: {:?}", tool_cwd));
    }

    // Read manifest to get runtime and entry
    let manifest_path = get_manifest_path(&app)?;
    let manifest: Manifest = if manifest_path.exists() {
        let content = fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        return Err("Manifest not found".to_string());
    };

    let tool_info = manifest.installed_tools.get(&id)
        .ok_or_else(|| format!("Tool {} not found in manifest", id))?;

    let runtimes = &tool_info.runtime;
    let is_node = runtimes.contains(&"bun".to_string()) || runtimes.contains(&"node".to_string());
    let entry = tool_info.entry.as_deref().unwrap_or_else(|| {
        if is_node { "index.js" } else { "main.py" }
    });

    let (command, args) = if is_node {
        (resolve_node_cmd(), vec![entry.to_string()])
    } else {
        ("python".to_string(), vec![entry.to_string()])
    };

    let resolved_command = if command == "python" {
        let venv_python = if cfg!(target_os = "windows") {
            tool_cwd.join(".venv").join("Scripts").join("python.exe")
        } else {
            tool_cwd.join(".venv").join("bin").join("python")
        };
        
        if venv_python.exists() {
            venv_python.to_string_lossy().to_string()
        } else {
            #[cfg(target_os = "windows")]
            {
                let mut py_cmd = Command::new("python");
                py_cmd.arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                py_cmd.creation_flags(CREATE_NO_WINDOW);
                let python_available = py_cmd.status()
                    .map(|s| s.success())
                    .unwrap_or(false);
                if python_available { "python".to_string() } else { command.clone() }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let python3_available = Command::new("python3")
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false);
                if python3_available { "python3".to_string() } else { command.clone() }
            }
        }
    } else {
        // node or other commands — use as-is
        command.clone()
    };

    let mut run_cmd = Command::new(&resolved_command);
    run_cmd.args(args)
        .current_dir(&tool_cwd)
        .env("SANKA_ENV", "true")
        .env("SANKA_PLATFORM", std::env::consts::OS)
        .env("SANKA_PLUGIN_ID", &id)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    run_cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = run_cmd.spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", resolved_command, e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let id_clone = id.clone();
    let app_clone = app.clone();

    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_clone.emit(
                    "tool-log",
                    LogPayload {
                        id: id_clone.clone(),
                        message: l,
                        stream: "STDOUT".to_string(),
                    },
                );
            }
        }
    });

    let id_clone2 = id.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app.emit(
                    "tool-log",
                    LogPayload {
                        id: id_clone2.clone(),
                        message: l,
                        stream: "STDERR".to_string(),
                    },
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn rebuild_dependencies(
    app: AppHandle,
    id: String,
    _python_path: Option<String>,
    _bun_path: Option<String>,
) -> Result<(), String> {
    let tools_dir = get_tools_dir(&app)?;
    let tool_dir = tools_dir.join(&id);

    if !tool_dir.exists() {
        return Err(format!("Tool directory not found: {:?}", tool_dir));
    }

    // Check if it's a Python plugin
    let requirements_txt = tool_dir.join("requirements.txt");
    if requirements_txt.exists() {
        setup_python_venv(&app, &tool_dir)?;
    }

    // Check if it's a Node.js plugin
    let package_json = tool_dir.join("package.json");
    if package_json.exists() {
        let config_path = get_config_path(&app)?;
        let npm_registry = if config_path.exists() {
            fs::read_to_string(config_path)
                .map(|content| {
                    let cfg = serde_json::from_str::<AppConfig>(&content).unwrap_or_default();
                    if !cfg.npm_registry.is_empty() { cfg.npm_registry } else { cfg.bun_registry }
                })
                .unwrap_or_default()
        } else {
            String::new()
        };

        setup_node_deps(&tool_dir, &npm_registry)?;
    }

    Ok(())
}

#[tauri::command]
fn check_file_exists(path: String) -> Result<bool, String> {
    let path_buf = std::path::PathBuf::from(path);
    Ok(path_buf.exists())
}

#[tauri::command]
async fn remove_plugin(app: AppHandle, id: String) -> Result<(), String> {
    let tools_dir = get_tools_dir(&app)?;
    let tool_dir = tools_dir.join(&id);

    if !tool_dir.exists() {
        if let Ok(data_dir) = app.path().app_data_dir() {
            let ext_zip = data_dir.join("chrome_extensions").join(format!("{}.zip", id));
            if ext_zip.exists() {
                fs::remove_file(&ext_zip).map_err(|e| format!("Failed to remove zip: {}", e))?;
                return Ok(());
            }
        }
        // If directory doesn't exist, we still want to return Ok to let the frontend clear the UI ghost record.
        return Ok(());
    }

    fs::remove_dir_all(&tool_dir)
        .map_err(|e| format!("Failed to remove plugin directory: {}", e))?;

    Ok(())
}

#[tauri::command]
fn open_plugin_directory(app: AppHandle, id: String) -> Result<(), String> {
    let tools_dir = get_tools_dir(&app)?;
    let tool_dir = tools_dir.join(&id);

    if tool_dir.exists() {
        tauri_plugin_opener::open_path(&tool_dir, None::<String>)
            .map_err(|e| format!("Failed to open directory: {}", e))?;
        return Ok(());
    }

    if let Ok(data_dir) = app.path().app_data_dir() {
        let ext_dir = data_dir.join("chrome_extensions");
        let ext_zip = ext_dir.join(format!("{}.zip", id));
        if ext_zip.exists() {
            tauri_plugin_opener::open_path(&ext_dir, None::<String>)
                .map_err(|e| format!("Failed to open directory: {}", e))?;
            return Ok(());
        }
    }

    Err(format!("Plugin directory not found: {:?}", tool_dir))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub category: String,
    #[serde(deserialize_with = "deserialize_runtime")]
    pub runtime: Vec<String>,
    pub entry: String,
    pub platforms: Vec<String>,
    pub python_version: Option<String>,
    pub node_version: Option<String>,
}

#[tauri::command]
async fn install_local_plugin(
    app: AppHandle,
    zip_path: String,
    _python_path: Option<String>,
    _bun_path: Option<String>,
) -> Result<PluginMetadata, String> {
    let tools_dir = get_tools_dir(&app)?;
    
    // Read zip file
    let zip_data = fs::read(&zip_path).map_err(|e| format!("Failed to read zip file: {}", e))?;
    let cursor = Cursor::new(zip_data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip: {}", e))?;
    
    // First, extract plugin.json to get the plugin ID
    let plugin_json_content = {
        let mut plugin_json_file = archive.by_name("plugin.json")
            .map_err(|e| format!("plugin.json not found in zip: {}", e))?;
        let mut content = String::new();
        std::io::Read::read_to_string(&mut plugin_json_file, &mut content)
            .map_err(|e| format!("Failed to read plugin.json: {}", e))?;
        content
    };
    
    let metadata: PluginMetadata = serde_json::from_str(&plugin_json_content)
        .map_err(|e| format!("Invalid plugin.json format: {}", e))?;
    
    let is_chrome = metadata.runtime.iter().any(|r| r == "chrome");

    let dest_dir = if is_chrome {
        let exts_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("chrome_extensions");
        if !exts_dir.exists() {
            fs::create_dir_all(&exts_dir).map_err(|e| e.to_string())?;
        }
        let dest_zip = exts_dir.join(format!("{}.zip", metadata.id));
        fs::copy(&zip_path, &dest_zip).map_err(|e| e.to_string())?;
        dest_zip
    } else {
        let dest = tools_dir.join(&metadata.id);
        
        // Remove old installation if exists
        if dest.exists() {
            fs::remove_dir_all(&dest)
                .map_err(|e| format!("Failed to remove old plugin dir: {}", e))?;
        }
        
        // Extract all files
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = match file.enclosed_name() {
                Some(path) => dest.join(path),
                None => continue,
            };
            
            if (*file.name()).ends_with('/') {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
        
        if metadata.runtime.contains(&"python".to_string()) {
            setup_python_venv(&app, &dest)?;
        }
        
        dest
    };
    
    if metadata.runtime.contains(&"bun".to_string()) || metadata.runtime.contains(&"node".to_string()) {
        let config_path = get_config_path(&app)?;
        let npm_registry = if config_path.exists() {
            fs::read_to_string(config_path)
                .map(|content| {
                    let cfg = serde_json::from_str::<AppConfig>(&content).unwrap_or_default();
                    if !cfg.npm_registry.is_empty() { cfg.npm_registry } else { cfg.bun_registry }
                })
                .unwrap_or_default()
        } else {
            String::new()
        };

        setup_node_deps(&dest_dir, &npm_registry)?;
    }
    
    Ok(metadata)
}


#[tauri::command]
fn write_bytes_to_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = std::path::Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_manifest,
            save_manifest,
            download_tool,
            run_tool,
            rebuild_dependencies,
            check_file_exists,
            install_local_plugin,
            remove_plugin,
            open_plugin_directory,
            get_plugin_info,
            write_bytes_to_file,
            remove_file,
            check_uv_installed,
            download_uv,
            get_uv_path_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
