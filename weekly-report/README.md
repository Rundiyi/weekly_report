# 周报生成器

一键生成三种风格（简洁版 / 正式汇报版 / 数据重点版）的周报文案，基于 DeepSeek AI 实时生成。

## 使用方式

1. 打开页面，输入本周工作关键词（逗号分隔）
2. 点击"生成周报"，AI 实时生成三种风格
3. 切换风格查看不同版本
4. 一键复制或导出为长图

## 部署（Vercel）

1. Fork 本仓库
2. 在 [Vercel](https://vercel.com) 导入项目
3. 在 Vercel 项目 Settings → Environment Variables 添加：
   - `DEEPSEEK_API_KEY`：你的 DeepSeek API Key
4. 部署完成后即可通过 Vercel 域名访问

DeepSeek API Key 获取：https://platform.deepseek.com/api_keys

## 本地开发

```bash
npx vercel dev
```

## 技术

- 前端：HTML + CSS + JavaScript
- AI 生成：DeepSeek V4-Flash API（通过 Vercel Serverless Function 代理）
- 图片导出：html2canvas (CDN)
- 离线兜底：API 失败时自动降级到模板拼接
