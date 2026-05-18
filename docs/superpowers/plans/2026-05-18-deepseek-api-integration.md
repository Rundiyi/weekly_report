# DeepSeek API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace template-only report generation with DeepSeek V4-Flash API calls via a Vercel Serverless Function proxy, with template fallback on failure.

**Architecture:** Frontend POSTs to `/api/generate` on Vercel → the function reads `DEEPSEEK_API_KEY` from env vars → calls DeepSeek `deepseek-chat` model → returns three styles as JSON → frontend caches and displays. On any failure, falls back to existing template engine.

**Tech Stack:** HTML + CSS + Vanilla JS (frontend), Node.js Serverless Function (Vercel), DeepSeek API (deepseek-chat / V4-Flash)

**Design spec reference:** `docs/superpowers/specs/2026-05-18-deepseek-api-integration-design.md`

---

## File Map

| File | Purpose |
|------|---------|
| `api/generate.js` | Vercel Serverless Function — proxy DeepSeek API, inject API key from env |
| `vercel.json` | Vercel config — rewrite root to weekly-report/index.html |
| `weekly-report/index.html` | Frontend — add async getReports with API-first strategy and template fallback |
| `weekly-report/README.md` | Update deploy instructions to Vercel |

---

### Task 1: Create Vercel Serverless Function

**Files:**
- Create: `api/generate.js`

- [ ] **Step 1: Create api/generate.js**

```javascript
// api/generate.js — Vercel Serverless Function: proxy DeepSeek API calls

const SYSTEM_PROMPT = `你是资深职场周报撰写助手。根据用户提供的关键词、部门和职位，生成一份周报。

输出要求：
- 严格遵守 JSON 格式输出，不要输出任何其他内容
- 三个字段：concise（简洁版）、formal（正式汇报版）、data（数据重点版）
- 根据用户给出的关键词生成内容，不要编造无关联的工作内容
- 用中文输出

各字段风格要求：
1. concise：3-5句话概括，干练直接，无废话，不分段无标题
2. formal：结构完整，含①本周工作概述 ②分条详述（每条带序号） ③下周计划，语气专业，适合提交领导
3. data：量化导向，每条工作有进度/完成度/关键产出，使用 ▸ █ ░ ━━ 视觉符号`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { keywords, department, position } = req.body || {};

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'keywords is required and must be a non-empty array' });
  }

  const dept = (department || '某部门').trim();
  const pos = (position || '员工').trim();
  const userMessage = `关键词：${keywords.join('、')}\n部门：${dept}\n职位：${pos}`;

  try {
    const apiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2000,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '');
      console.error(`DeepSeek API error ${apiRes.status}: ${errText}`);
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await apiRes.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      console.error('DeepSeek returned empty response');
      return res.status(502).json({ error: 'empty_response' });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error(`JSON parse failed for: ${raw.substring(0, 200)}`);
      return res.status(502).json({ error: 'parse_error' });
    }

    const concise = typeof parsed.concise === 'string' ? parsed.concise.trim() : '';
    const formal = typeof parsed.formal === 'string' ? parsed.formal.trim() : '';
    const dataStyle = typeof parsed.data === 'string' ? parsed.data.trim() : '';

    if (!concise && !formal && !dataStyle) {
      return res.status(502).json({ error: 'all fields empty' });
    }

    return res.json({ concise, formal, data: dataStyle });
  } catch (err) {
    console.error(`Generate error: ${err.message}`);
    return res.status(502).json({ error: err.name === 'TimeoutError' ? 'timeout' : 'upstream_error' });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/generate.js
git commit -m "feat: add Vercel serverless function for DeepSeek API proxy"
```

---

### Task 2: Create Vercel config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "rewrites": [
    { "source": "/", "destination": "/weekly-report/index.html" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel config with root rewrite"
```

---

### Task 3: Modify frontend to call API with template fallback

**Files:**
- Modify: `weekly-report/index.html`

This is the core change. The approach: keep all existing template code, wrap generation logic in an async function that tries API first.

- [ ] **Step 1: Replace the generate button handler with async version**

Find the generate button event listener (the `generateBtn.addEventListener('click', ...)` block) and replace the internal logic to use the async `getReports` function. In the file at `weekly-report/index.html`, find the section:

```javascript
// Generate handler
generateBtn.addEventListener('click', () => {
  const keywords = keywordsEl.value.trim();
  if (!keywords) {
    keywordsEl.focus();
    keywordsEl.style.borderColor = '#ef4444';
    setTimeout(() => { keywordsEl.style.borderColor = ''; }, 1500);
    return;
  }

  generateBtn.textContent = '正在生成...';
  generateBtn.disabled = true;

  // Small delay so the button state change renders before generation
  setTimeout(() => {
    currentReports = generateReport(
      keywords,
      departmentEl.value,
      positionEl.value
    );

    resultSection.style.display = 'block';
    showReport(currentStyle);
    resultSection.scrollIntoView({ behavior: 'smooth' });

    generateBtn.textContent = '重新生成';
    generateBtn.disabled = false;
    resetBtn.style.display = 'block';
  }, 100);
});
```

Replace with:

```javascript
// Async generate: try API first, fallback to template
async function getReports(keywordsRaw, department, position) {
  const kwList = parseKeywords(keywordsRaw);
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: kwList, department, position }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { source: 'ai', concise: data.concise, formal: data.formal, data: data.data };
  } catch {
    return {
      source: 'template',
      ...generateReport(keywordsRaw, department, position),
    };
  }
}

// Generate handler
generateBtn.addEventListener('click', async () => {
  const keywords = keywordsEl.value.trim();
  if (!keywords) {
    keywordsEl.focus();
    keywordsEl.style.borderColor = '#ef4444';
    setTimeout(() => { keywordsEl.style.borderColor = ''; }, 1500);
    return;
  }

  generateBtn.textContent = '正在生成...';
  generateBtn.disabled = true;

  currentReports = await getReports(
    keywords,
    departmentEl.value,
    positionEl.value
  );

  resultSection.style.display = 'block';
  showReport(currentStyle);
  resultSection.scrollIntoView({ behavior: 'smooth' });

  generateBtn.textContent = '重新生成';
  generateBtn.disabled = false;
  resetBtn.style.display = 'block';

  if (currentReports.source === 'template') {
    showToast('已切换至离线模式');
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add weekly-report/index.html
git commit -m "feat: add DeepSeek API call with template fallback"
```

---

### Task 4: Update README

**Files:**
- Modify: `weekly-report/README.md`

- [ ] **Step 1: Replace content with updated deploy instructions**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add weekly-report/README.md
git commit -m "docs: update README for Vercel + DeepSeek deployment"
```

---

### Task 5: Local test and QA

**Files:**
- Test: `api/generate.js`, `weekly-report/index.html`

- [ ] **Step 1: Install Vercel CLI and run dev server**

```bash
npm i -g vercel
cd j:\cangku\message
vercel dev
```

- [ ] **Step 2: Set env var for local testing**

Create a `.env.local` file (gitignored by Vercel):

```bash
echo "DEEPSEEK_API_KEY=sk-your-key-here" > .env.local
```

- [ ] **Step 3: Manual QA checklist**

Open http://localhost:3000 in browser and test:

1. [ ] Enter keywords, click generate → verify AI-generated report appears (all 3 styles different, natural text)
2. [ ] Switch tabs → verify instant switch (no additional API calls)
3. [ ] Click "重新生成" → verify different content generated (not cached stale)
4. [ ] Click "一键复制" → paste to verify content
5. [ ] Click "导出长图" → verify PNG downloads correctly
6. [ ] Disconnect network, click generate → verify template fallback + "已切换至离线模式" toast
7. [ ] Click "清空重填" → verify form clears and result hides
8. [ ] Test Ctrl+Enter shortcut
9. [ ] Test mobile viewport (375px) — verify layout and touch targets
10. [ ] Test empty keywords → verify validation (red border flash, no request)

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: QA fixes from DeepSeek API integration testing"
```
