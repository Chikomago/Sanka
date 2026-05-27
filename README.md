# SANKA

一个跨平台脚本插件解析和发布平台

## 核心特性


通过配置自定义的 `registry_url` （json）获取插件列表，来管理、下载对应的发行版 (Release) 插件。

## 插件标准 (Plugin Standards)

Sanka 支持两种插件分发与管理模式：

1. **云端源插件 (推荐)**：
   通过远程的 `registry.json` 统一配置和管理所有插件的元数据（名称、版本、运行环境等）。在下载和安装时，Sanka 会优先采纳 \`registry.json\` 的配置，云端拥有最高的配置裁定权。推荐插件开发者优先使用此方式发布插件，便于统一分发与更新。
2. **本地压缩包插件**：
   通过将开发好的插件打包为 `.zip` 格式，直接在客户端的“工作台”本地导入安装。由于缺少了云端的配置源，**必须**在 ZIP 压缩包的根目录内提供规范的 `plugin.json` 文件供 Sanka 解析。

> **最佳实践**：即使你是为云端源开发插件，也强烈建议在打包的 ZIP 内附带 `plugin.json`。这样不仅更加规范，还能保证用户在网络不佳时手动下载 ZIP 包进行本地离线安装时，依然能够完美兼容解析。

## 使用方法

克隆项目并安装依赖后，运行以下命令启动客户端开发模式：

```bash
# 安装依赖
npm install

# 启动开发服务器和 Tauri 客户端
npm run tauri dev
```

如需构建打包发行版：
```bash
npm run tauri build
```


##源地址收录

插件源 https://raw.githubusercontent.com/Chikomago/sanka-plugins/main/registry.json
UV推荐镜像源 https://mirror.ghproxy.com/
