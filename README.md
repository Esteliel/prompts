# Esteliel Prompts

独立部署的提示词管理页，地址为 `https://esteliel.github.io/prompts/`。

## 初始化 Supabase

1. 在 Supabase SQL Editor 执行 [`supabase/prompts.sql`](supabase/prompts.sql)。
2. 在 Authentication → URL Configuration 的 Redirect URLs 中加入：
   `https://esteliel.github.io/prompts/`
3. 确认 Email 登录已启用。

前端只使用 publishable key；不要把 `service_role` 或其他 secret key 放入仓库。
