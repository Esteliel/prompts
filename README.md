# Esteliel Prompts

独立部署的提示词管理页，地址为 `https://esteliel.github.io/prompts/`。

## 公共视觉

`assets/css/brand.css` 与主站、博客仓库中的同名文件保持一致，在页面样式之后加载，
统一配色、字体、品牌和全站导航；各站使用本地副本独立部署。提示词类型切换位于
第二行，工具按钮保留在顶栏右侧。新访客默认深色，已有明暗主题偏好继续沿用，
布局在首屏绘制前读取原主题存储键以避免闪烁。

本站资源和链接继续使用 `/prompts` 对应的 `relative_url`，跨站导航使用 `_config.yml`
的 `url` 作为主站域名。调整公共样式时同步三个仓库的 `brand.css`。

页面将普通提示词与绘画提示词分开管理。绘画提示词可以记录完整提示词或画风、角色、动作、服装等单项提示词，并标注模型、自然语言 / Danbooru 标签格式和示例图片。

新建绘画提示词时可以粘贴公开的 `https://chatgpt.com/s/p_…` 分享链接。页面会通过 `r.jina.ai` 只读网页解析服务读取分享页，将公开的标题、绘画提示词和生成图片填入表单，用户检查后再保存；私密、已删除或不含公开提示词的链接不会导入。

## 维护网站内置提示词

普通内置提示词集中维护在 [`assets/js/prompts.js`](assets/js/prompts.js) 顶部的 `seedPrompts` 数组；绘画内置提示词按“一条一个文件”维护在 [`assets/data/painting-prompts/`](assets/data/painting-prompts/) 中，并在其中的 `index.json` 登记文件名。新增绘画对象时填写 `id`、`title`、`category`、`tags`、`description`、`content`、`kind: 'image'`、`promptPart`、`model` 与 `syntax`，示例图片可直接写站点内路径（例如 `images/megumi.png`），也可以使用公开 `https` URL。发布后，新增内置项会自动合并到已有用户的本地列表和云端列表，不会覆盖用户的自定义提示词。

内置项只能复制为自定义提示词后编辑或删除；它们不会写入用户的 Supabase 数据，也不会参与云端删除同步。

## 初始化 Supabase

1. 在 Supabase SQL Editor 执行 [`supabase/prompts.sql`](supabase/prompts.sql)。脚本会为已有的 `prompts` 表补充绘画字段，并创建私有的 `prompt-examples` Storage bucket 及对应的用户隔离策略。
2. 在 Authentication → URL Configuration 的 Redirect URLs 中加入：
   `https://esteliel.github.io/prompts/`
3. 确认 Email 登录已启用。

示例图片只在登录后上传，文件保存在 `prompt-examples/<用户 ID>/<提示词 ID>/` 下；页面使用短时签名 URL 展示，不会把图片内容塞进 localStorage 或提示词 JSON。

前端只使用 publishable key；不要把 `service_role` 或其他 secret key 放入仓库。

## 新版界面与共享大厅

顶栏切换提示词 / 绘画提示词，左侧切换共享大厅 / 个人提示词库。普通提示词按场景分类，绘画提示词按模型或平台分类。绘画卡片的说明与标签在悬停或键盘聚焦时显示；触屏保留标题和操作入口。明暗主题及界面语言偏好保存在当前浏览器，用户提示词原文不会翻译。

共享大厅包含站点内置内容和用户主动发布的公开副本。收藏会创建独立的、可以编辑的个人提示词，`source_id` 用于跨浏览器保留收藏状态。纯文本和站点图片可以在未登录时收藏；涉及共享上传图片时，需要登录，将图片复制到收藏者自己的私有存储。

### 启用共享功能（已有站点也需要执行）

在 Supabase SQL Editor 重新执行 `supabase/prompts.sql`，再部署前端。脚本可重复执行，会新增：

- 个人 `prompts.source_id` 字段，原个人数据的 RLS 保持不变。
- `shared_prompts` 公开快照表：所有访客只读，只有发布者可以新增、更新和撤回自己的记录。
- `shared-examples` 公开图片副本桶：只在用户确认公开分享后，将相应示例图片复制进去；原 `prompt-examples` 桶继续保持私有。

公开共享前会明确确认发布内容与示例图片。编辑个人版本不会自动修改公开版本，使用「更新共享」主动替换；「撤回共享」会删除公开记录和对应的上传图片副本。已经被其他人收藏的内容、浏览器缓存或第三方保存的副本无法一并撤回。个人已公开条目需先撤回才能删除，导入替换时也会清理被移除条目的公开图片。

共享服务未配置或请求失败时，页面会提示暂不可用，站点内置内容和本地个人库仍可使用。没有执行新 SQL 时，云端同步因字段未就绪也可能失败，因此请按“SQL → 前端”的顺序更新。

### 本次验证

已执行 JavaScript 语法及 diff 空白检查，并通过本地 Edge 浏览器验证搜索分类、收藏、编辑与刷新保留、JSON 导入导出、绘画悬停与预览、主题、语言切换、窄屏无横向溢出及触屏操作入口。使用模拟 Supabase 验证了发布、私有编辑不影响共享快照、主动更新、撤回及发布失败时保留个人内容。

本地预览使用 `/prompts/` 子路径并替换页面的 Jekyll 模板入口；本机未安装 Ruby/Jekyll，因此尚未执行真实 Jekyll 构建。上线前需在 GitHub Actions 确认构建成功，并在测试 Supabase 项目用匿名用户、账户 A、账户 B 验证数据库和 Storage 的真实 RLS：匿名只能读共享表，账户之间不能读写个人记录和私有图片，也不能修改对方的公开副本。浏览器模拟测试不替代真实 RLS 验证。
