# Butteruni Blog

文档源码在 [`hexo-blog/source`](hexo-blog/source)；`main` 是唯一的内容来源。发布由 GitHub Actions 构建 Hexo 站点并部署到 GitHub Pages，不再手动维护生成文件分支。

## 写作与预览

- 已发布的文章放在 `hexo-blog/source/_posts/`，未完成的文章放在 `hexo-blog/source/_drafts/`。草稿不会出现在正式站点。
- 文章在开头的 YAML 信息中写明 `date`；修改文章时可另外写明 `updated`。这样重新构建不会因文件时间变化而改动文章日期或链接。
- 其他页面在 `hexo-blog/source/` 下对应的目录中。
- 本地需要 Node.js 22 和 Pandoc 3.8.3。进入 `hexo-blog/` 后运行 `npm ci`，再运行 `npm run server` 预览；运行 `npm run build` 检查静态站点生成。
- NexT 主题通过 npm 锁定为 7.8.0，依赖由 `hexo-blog/package-lock.json` 固定。

## 发布

1. 修改文章或配置，提交到 `main`。建议先通过 Pull Request，让工作流完成构建检查。
2. 合并或推送到 `main` 后，仓库根目录的 [发布工作流](.github/workflows/pages.yml) 会构建并部署站点。也可以在 GitHub 的 Actions 页面手动运行该工作流。
3. 第一次启用时，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。这一步需要仓库管理员操作。之后无需运行 `hexo deploy`，也无需更新 `master` 分支。

如果需要撤回一次发布，把相应改动在 `main` 中回退并推送，工作流会重新发布。生成目录 `hexo-blog/public/` 保持在 Git 忽略列表中。
