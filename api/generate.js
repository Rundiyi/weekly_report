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
