# 周报生成器

一键生成三种风格（简洁版 / 正式汇报版 / 数据重点版）的周报文案。

## 使用方式

1. 打开 `index.html` 即可使用
2. 输入本周工作关键词（逗号分隔）
3. 点击"生成周报"
4. 切换风格查看不同版本
5. 一键复制或导出为长图

## 部署

将整个 `weekly-report/` 目录推送到 GitHub，在仓库 Settings → Pages 中启用 GitHub Pages，选择分支后即可通过 URL 访问。

或使用任何静态托管服务（Vercel、Netlify、Cloudflare Pages 等）。

## 技术

- 纯前端 HTML + CSS + JavaScript
- 图片导出依赖 html2canvas (CDN)
- 文本由模板引擎随机组合生成，不依赖 AI API
