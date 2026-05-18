# 周报生成器 — DeepSeek API 集成设计

## 概述

将周报生成器从纯模板拼接改为 DeepSeek API 实时生成，提升文本个性化和自然度。模板引擎保留作为 API 失败时的降级兜底。

## 架构变更

### 当前架构
```
GitHub Pages → 纯前端 HTML（模板拼接）
```

### 目标架构
```
Vercel → 静态前端 HTML + Serverless Function（API 代理）
              ↓
         DeepSeek API（deepseek-chat / V4-Flash）
```

### 请求流程

```
用户点击"生成周报"
  → 前端 POST /api/generate（传入 keywords, department, position, style）
    → Vercel 函数从环境变量读取 DEEPSEEK_API_KEY
    → 调用 DeepSeek API，一次返回三种风格
  → 成功：前端缓存三种风格，用户切换 Tab 不重复调 API
  → 失败（超时/5xx/网络错误）：自动降级到现有模板拼接，Toast 提示"已切换至离线模式"
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `weekly-report/index.html` | 修改 | 删除模板数据库，新增 API 调用逻辑 + 降级兜底 |
| `api/generate.js` | 新增 | Vercel Serverless Function，代理 DeepSeek API 调用 |
| `vercel.json` | 新增 | Vercel 部署配置（重写规则 + 函数目录） |
| `weekly-report/README.md` | 修改 | 更新部署说明 |

## API 设计

### `POST /api/generate`

**请求：**
```json
{
  "keywords": ["Q2复盘", "客户拜访", "合同签署"],
  "department": "市场部",
  "position": "运营专员"
}
```

**响应（成功）：**
```json
{
  "concise": "本周工作主要围绕Q2复盘展开，...",
  "formal": "【本周工作汇报】\n汇报人：运营专员（市场部）...",
  "data": "📊 本周数据概览\n..."
}
```

**响应（失败）：**
```json
{
  "error": "timeout"
}
```

前端收到 error 后自动降级模板。

### Vercel 函数内部调用 DeepSeek

```javascript
// api/generate.js
export default async function handler(req, res) {
  const { keywords, department, position } = req.body;

  const prompt = `关键词：${keywords.join('、')}\n部门：${department}\n职位：${position}`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.8,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(8000)
  });

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  // parsed = { concise: "...", formal: "...", data: "..." }

  res.json(parsed);
}
```

## Prompt 设计

### System Prompt

```
你是资深职场周报撰写助手。根据用户提供的关键词、部门和职位，生成一份周报。

输出要求：
- 严格遵守 JSON 格式输出，不要输出任何其他内容
- 三个字段：concise（简洁版）、formal（正式汇报版）、data（数据重点版）
- 根据用户给出的关键词生成内容，不要编造无关联的工作内容
- 用中文输出

各字段风格要求：
1. concise：3-5句话概括，干练直接，无废话，不分段无标题
2. formal：结构完整，含①本周工作概述 ②分条详述（每条带序号） ③下周计划，语气专业，适合提交领导
3. data：量化导向，每条工作有进度/完成度/关键产出，使用 ▸ █ ░ ━━ 视觉符号
```

### User Message

```
关键词：${keywords.join('、')}
部门：${department}
职位：${position}
```

## 错误处理与降级

| 情况 | 前端行为 |
|------|---------|
| API 正常返回 | 展示 AI 生成的周报，缓存三种风格 |
| API 超时（> 8s） | 降级模板拼接 |
| API 5xx / 网络错误 | 降级模板拼接，Toast "已切换至离线模式" |
| JSON 解析失败 | 降级模板拼接 |
| 用户切换 Tab | 从缓存读取，不调 API |

### 降级实现

前端保留现有模板数据库（`templates` 对象），封装生成函数：

```javascript
async function getReports(keywords, department, position) {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords, department, position }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { source: 'ai', ...data };
  } catch {
    // Fallback to template
    return {
      source: 'template',
      ...generateReport(keywords, department, position)
    };
  }
}
```

## 成本估算（DeepSeek V4-Flash）

| 计费项 | 单价 | 单次用量 | 单次成本 |
|--------|------|----------|----------|
| 输入 | ¥1/百万 tokens | ~350 tokens | ¥0.00035 |
| 输出 | ¥2/百万 tokens | ~600 tokens | ¥0.0012 |
| **合计** | | | **≈ ¥0.0015** |

售价 19.9 元，单个用户使用 100 次 API 成本仅 ¥0.15，几乎零成本。

## 部署

- 平台：Vercel（替代 GitHub Pages）
- 环境变量：`DEEPSEEK_API_KEY` 在 Vercel 控制台配置
- 触发：Git push → Vercel 自动部署
- 域名：vercel 默认域名或自定义域名

## 向后兼容

- 保留现有模板数据库，不做删除
- API 调用失败时自动切换模板，用户不受影响
- 无网络环境下仍然可用（纯模板模式）
