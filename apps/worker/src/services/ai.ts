import type { Env } from '../env';
import { getConf } from './conf';

export type AiFillResult = {
  description?: string;
  vod_content?: string;
  skipped: boolean;
  reason?: string;
};

function resolveAiConfig(conf: Record<string, string>, env: Env) {
  const enabled = (conf.ai_enabled ?? '1') !== '0';
  const baseUrl = (conf.ai_base_url || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/, '');
  const model = conf.ai_model || 'agnes-2.5-flash';
  const apiKey = (env.AGNES_API_KEY || conf.ai_api_key || '').trim();
  return { enabled, baseUrl, model, apiKey };
}

/** 调用 Agnes / OpenAI 兼容 Chat Completions，仅补全空的 description / vod_content */
export async function fillSourceMeta(
  env: Env,
  row: { title: string; description?: string | null; vod_content?: string | null },
  conf?: Record<string, string>
): Promise<AiFillResult> {
  const cfg = resolveAiConfig(conf || (await getConf(env)), env);
  if (!cfg.enabled) return { skipped: true, reason: 'AI 填充未启用' };
  if (!cfg.apiKey) return { skipped: true, reason: '未配置 AI API Key' };

  const needDesc = !String(row.description || '').trim();
  const needIntro = !String(row.vod_content || '').trim();
  if (!needDesc && !needIntro) {
    return { skipped: true, reason: '关键词与介绍均已存在，跳过' };
  }

  const title = String(row.title || '').trim();
  if (!title) return { skipped: true, reason: '资源标题为空' };

  const want: string[] = [];
  if (needDesc) want.push('keywords');
  if (needIntro) want.push('intro');

  const system = `你是网盘资源站的内容助手。根据资源标题生成搜索关键词与介绍。
规则：
1. keywords：5～12 个中文搜索词，每行一个，覆盖别名、常见搜法、相关作品名，不要编号，不要解释。
2. intro：80～200 字客观中文介绍，不要广告话术，不要出现「本站」「点击」等。
3. 只输出 JSON 对象，键仅含需要的字段：${want.join('、')}。不要 markdown 代码块。`;

  const user = `资源标题：${title}
请生成字段：${want.join('、')}`;

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = String(data.choices?.[0]?.message?.content || '').trim();
  const parsed = parseAiJson(raw);
  if (!parsed) throw new Error('AI 返回无法解析为 JSON');

  const out: AiFillResult = { skipped: false };
  if (needDesc) {
    const kw = normalizeKeywords(parsed.keywords ?? parsed.description ?? '');
    if (kw) out.description = kw;
  }
  if (needIntro) {
    const intro = String(parsed.intro ?? parsed.vod_content ?? '')
      .trim()
      .replace(/^["「]|["」]$/g, '');
    if (intro) out.vod_content = intro;
  }
  if (!out.description && !out.vod_content) {
    return { skipped: true, reason: 'AI 未返回可用内容' };
  }
  return out;
}

function parseAiJson(raw: string): Record<string, string> | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object') {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) map[k] = Array.isArray(v) ? v.join('\n') : String(v ?? '');
      return map;
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

function normalizeKeywords(raw: string): string {
  return String(raw || '')
    .split(/[\n,，;；|/]+/)
    .map((s) => s.replace(/^\d+[\.\)、]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .join('\n');
}
