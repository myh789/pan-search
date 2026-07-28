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

  const system = `你是网盘资源站的内容助手。根据「资源标题」推断真实产品/课程/内容，生成便于搜索的关键词和介绍。
规则：
1. keywords（标签）：
   - 输出 10～18 个中文词，每行一个；尽量多写和产品本身相关的搜法、别名、俗称、用途、适用人群、同类说法。
   - 只写「产品相关」词，例如：软件名、课程主题、技能点、行业说法、常见叫法。
   - 禁止笼统/无意义标签：版本号（如 1.0、v7.0.4）、apk/ipa/exe/zip/rar、去广告版、完整版、最新版、安装包、网盘、分享、资源、合集、教程包等纯格式或营销套话。
   - 不要编号、不要解释、不要标点堆砌。
2. intro（介绍）：
   - 120～280 字，大白话、口语一点，像跟人介绍「这是啥、适合谁、能干什么」。
   - 多写具体内容点，少空话；不要广告腔，不要「本站」「点击」「赶紧下载」。
3. 只输出 JSON 对象，键仅含需要的字段：${want.join('、')}。不要 markdown 代码块。`;

  const user = `资源标题：${title}
请生成字段：${want.join('、')}
记住：标签要多且贴产品；介绍用大白话写细一点。`;

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
      temperature: 0.55,
      max_tokens: 1200,
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
  const banExact = new Set([
    'apk',
    'ipa',
    'exe',
    'zip',
    'rar',
    '7z',
    'dmg',
    '网盘',
    '分享',
    '资源',
    '合集',
    '安装包',
    '完整版',
    '最新版',
    '去广告版',
    '破解版',
    '绿色版',
    '免费版',
    '高清',
    '蓝光',
  ]);
  return String(raw || '')
    .split(/[\n,，;；|/]+/)
    .map((s) => s.replace(/^\d+[\.\)、]\s*/, '').trim())
    .filter(Boolean)
    .filter((s) => {
      const low = s.toLowerCase();
      if (banExact.has(low) || banExact.has(s)) return false;
      // 纯版本号 / 带 v 的版本号
      if (/^v?\d+(\.\d+){1,4}([a-z_-]*\d*)?$/i.test(s)) return false;
      // 几乎只有扩展名或「xx版」套话
      if (/^(去广告|完整|最新|官方|精简|增强)?版$/i.test(s)) return false;
      if (/^\.(apk|ipa|exe|zip|rar|7z|dmg)$/i.test(s)) return false;
      return true;
    })
    .slice(0, 24)
    .join('\n');
}
