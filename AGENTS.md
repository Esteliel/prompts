# 项目协作约束

本文档适用于仓库根目录及其子目录。更深层目录如果新增 `AGENTS.md`，可以补充或覆盖本文件中与该目录相关的规则。

## 项目概览

- 本项目是部署在 `https://esteliel.github.io/prompts/` 的提示词管理与分享页面。
- 站点使用 Jekyll 生成静态文件，GitHub Actions 通过 `.github/workflows/jekyll-gh-pages.yml` 构建并部署到 GitHub Pages。
- 前端不使用 npm、Bundler 或 JavaScript 框架；页面逻辑是原生 JavaScript，样式是普通 CSS。
- 提示词默认保存在浏览器 `localStorage`；登录后可通过 Supabase 在浏览器之间同步用户自己的数据。

## 目录职责

- `index.html`：主页内容、提示词管理表单、筛选器和对话框结构。
- `_layouts/default.html`、`_config.yml`：Jekyll 布局、站点元数据、资源路径和页面默认配置。
- `assets/js/prompts.js`：提示词状态、标准化、导入导出、本地持久化、Supabase 同步及 UI 交互。
- `assets/js/prompts-config.js`：Supabase URL 和 publishable key 配置。这里只允许公开客户端配置。
- `assets/css/`：页面及组件样式；保持现有类名体系和响应式布局。
- `assets/data/painting-prompts/`：绘画提示词内置数据；`index.json` 是文件清单，每个提示词单独使用一个 JSON 文件。
- `images/`：站点内置示例图片。
- `supabase/prompts.sql`：Supabase 表、Storage bucket 和 Row Level Security 策略的可重复执行脚本。
- `.github/workflows/`：GitHub Pages 构建与部署流程。

## 修改规则

### 页面与前端

- 除非任务明确要求，保持静态 Jekyll + 原生 JavaScript 架构，不引入框架、打包器或新的运行时依赖。
- 页面资源必须兼容站点 `baseurl: /prompts`；优先使用 Jekyll 的 `relative_url` 或现有的资源路径写法，不能假设站点部署在域名根目录。
- 遵循现有的原生 JavaScript 风格和数据流：外部数据进入状态前应经过 `normalizePrompt` 等标准化逻辑，避免直接信任导入 JSON 或云端字段。
- 新增交互时保持语义化 HTML、可访问的 `label`/`aria` 属性、键盘可操作的对话框和移动端可用性；用户可见文案保持简体中文风格。
- 不要把用户提示词、示例图片内容或令牌写入提交后的源码、日志或 URL 查询参数。

### 内置提示词数据

- 普通内置提示词维护在 `assets/js/prompts.js` 顶部的 `seedPrompts`；绘画提示词按“一条一个文件”维护，并且必须同步登记到 `assets/data/painting-prompts/index.json`。
- 绘画提示词至少保持 `id`、`title`、`category`、`tags`、`description`、`content`、`kind: "image"`、`promptPart`、`model` 和 `syntax` 字段；字段取值应与前端的标签映射一致。
- 示例图片优先使用仓库内 `images/` 的站点路径，也可使用可信的公开 `https` URL；不要提交大体积、含敏感信息或未经授权的图片。
- 内置项通过复制变为用户自定义项后才能编辑或删除；不要改变 `isBuiltin` 语义，也不要让发布内置项覆盖用户自定义提示词。
- 修改数据格式时必须考虑旧版 `localStorage`、JSON 导入导出和云端记录的兼容性，并同步更新标准化和迁移逻辑。

### Supabase 与安全

- 前端只能使用 Supabase publishable/anon key；严禁提交 `service_role` key、数据库密码、管理令牌或其他 secret。
- 用户数据必须继续受 `user_id` 主键范围和 Row Level Security 保护；涉及字段、权限或 Storage 路径的修改，要同时更新 `supabase/prompts.sql` 和前端读写逻辑。
- 示例图片使用私有 `prompt-examples` bucket 和短时签名 URL；保持 `<user id>/<prompt id>/...` 路径约定，不得改成公开桶或绕过用户隔离策略。
- 不要在客户端新增绕过 RLS 的管理操作。任何需要管理员权限的迁移或清理都应在 Supabase 控制台或独立的受保护流程中执行，而不是放进静态站点。

### GitHub Actions 与部署

- 默认只由 `main` 分支推送触发生产部署；保留 `workflow_dispatch` 手动触发能力。
- 修改工作流时保留 Pages 所需的最小权限（`contents: read`、`pages: write`、`id-token: write`）、构建与部署 job 的依赖关系，以及单次部署并发控制。
- 不在 workflow、静态资源或提交信息中写入 secrets。新增 Action 应使用维护中的固定 major 版本，并说明其用途。
- `_site/`、`.jekyll-cache/` 和 `.sass-cache/` 是构建产物或缓存，不应提交；不要手工编辑生成目录。

## 验证要求

修改后至少执行与改动直接相关的检查：

1. `git diff --check`，确认没有空白错误。
2. 修改 JavaScript 时运行 `node --check assets/js/prompts.js`（环境有 Node.js 时），并检查浏览器控制台无初始化错误。
3. 修改 JSON 时解析 `assets/data/painting-prompts/index.json` 及涉及的提示词文件，并确认清单中的每个文件都存在。
4. 修改 Jekyll、HTML、CSS 或工作流时，至少在本地预览或 GitHub Actions 中确认页面能够构建；重点检查 `/prompts/` 子路径下的资源、登录状态、筛选、导入导出和内置绘画提示词加载。
5. 涉及 Supabase 时，验证未登录用户不能读写云端数据，登录用户只能访问自己的提示词和示例图片。

仓库当前没有独立测试套件或 `package.json`；不要为了满足检查而擅自引入依赖。交付时应说明实际执行了哪些验证，以及未能执行的检查和原因。

## Git 与协作

- 修改前先查看 `git status` 和相关 diff，保留用户已有的无关改动。
- 提交应保持范围清晰；除非用户明确要求，不自动提交、推送或修改远端配置。
- 不使用会覆盖或删除工作区大量内容的命令；构建、测试和数据迁移应优先采用可重复、可回滚的方式。
