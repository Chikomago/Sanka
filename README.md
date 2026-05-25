# SANKA

一个跨平台脚本插件发布平台

## 核心特性


通过配置自定义的 `registry_url` （json）获取插件列表，来管理、下载对应的发行版 (Release) 插件。


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

