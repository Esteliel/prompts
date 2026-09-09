# Esteliel Prompts

独立部署的提示词管理页，地址为 `https://esteliel.github.io/prompts/`。

页面将普通提示词与绘画提示词分开管理。绘画提示词可以记录完整提示词或画风、角色、动作、服装等单项提示词，并标注模型、自然语言 / Danbooru 标签格式和示例图片。

## 初始化 Supabase

1. 在 Supabase SQL Editor 执行 [`supabase/prompts.sql`](supabase/prompts.sql)。脚本会为已有的 `prompts` 表补充绘画字段，并创建私有的 `prompt-examples` Storage bucket 及对应的用户隔离策略。
2. 在 Authentication → URL Configuration 的 Redirect URLs 中加入：
   `https://esteliel.github.io/prompts/`
3. 确认 Email 登录已启用。

示例图片只在登录后上传，文件保存在 `prompt-examples/<用户 ID>/<提示词 ID>/` 下；页面使用短时签名 URL 展示，不会把图片内容塞进 localStorage 或提示词 JSON。

前端只使用 publishable key；不要把 `service_role` 或其他 secret key 放入仓库。
