# Ops Docs

一个基于 GitHub Pages 的运维文档站点。主页面在仓库根目录，文档内容位于 `docs/`。

## 访问地址

- GitHub Pages: `https://ardentlyer.github.io/docs/`
- GitHub 仓库: `https://github.com/Ardentlyer/docs`

## 目录结构

- `index.html` 主页
- `docs/` 文档与阅读器
- `scripts/build-manifest.ps1` 生成导航索引

## 新增文档

1. 在 `docs/` 下创建目录
2. 每个目录放一个 `README.md`
3. 推送后导航自动更新

## 本地预览

1. 运行 `scripts/build-manifest.ps1`
2. 使用任意静态服务器打开仓库根目录

## GitHub Pages

仓库推送到 GitHub 后，在 `Settings -> Pages` 中选择：

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/root`
