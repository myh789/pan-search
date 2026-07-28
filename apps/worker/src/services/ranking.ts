import type { Env } from '../env';
import { httpJson } from '../utils';
import { getConf } from './conf';

export type RankItem = {
  title: string;
  src?: string;
  ranking?: string | number;
  hot_score?: string | number;
  desc?: string;
  id?: number;
  times?: string;
  rank?: number;
};

/** 对齐原版 Tool::ranking — 按频道拉夸克热榜并缓存 */
export async function fetchChannelRanking(
  env: Env,
  channel: string,
  opts: { force?: boolean; mobile?: boolean } = {}
): Promise<RankItem[]> {
  const conf = await getConf(env);
  const limit = Math.max(1, Number(conf.ranking_num) || 10);
  const mLimit = Math.min(limit, Math.max(1, Number(conf.ranking_m_num) || 6));
  const key = `ranking:${channel}`;

  if (!opts.force) {
    const cached = (await env.KV.get(key, 'json')) as RankItem[] | null;
    if (cached?.length) {
      return opts.mobile ? cached.slice(0, mLimit) : cached.slice(0, limit);
    }
  }

  let data: RankItem[] = [];
  try {
    const res = await httpJson('https://biz.quark.cn/api/trending/ranking/getYingshiRanking', {
      method: 'GET',
      query: {
        area: '全部',
        year: '全部',
        channel,
        rank_type: '最热',
        cate: '全部',
        from: 'hot_page',
        start: '0',
        hit: String(limit),
      },
    });
    const hits = res.data?.data?.hits?.hit?.item || res.data?.hits?.hit?.item || [];
    if (Array.isArray(hits) && hits.length) {
      data = hits.slice(0, limit).map((value: any, i: number) => ({
        title: value.title || '',
        src: value.src || '',
        ranking: value.ranking ?? i + 1,
        hot_score: value.hot_score || '',
        desc: value.desc || '',
        id: 0,
        rank: i + 1,
        times: '',
      }));
    }
  } catch {
    data = [];
  }

  if (data.length) {
    await env.KV.put(key, JSON.stringify(data), { expirationTtl: 43200 });
  }

  return opts.mobile ? data.slice(0, mLimit) : data;
}

export async function refreshAllRankings(env: Env) {
  const cats = await env.DB.prepare(
    'SELECT source_category_id, name, is_sys, is_type FROM source_category WHERE status = 0'
  ).all<any>();
  const conf = await getConf(env);
  const limit = Math.max(1, Number(conf.ranking_num) || 10);

  for (const cat of cats.results || []) {
    if (Number(cat.is_sys) === 1 && Number(cat.is_type) === 0) {
      await fetchChannelRanking(env, cat.name, { force: true });
      continue;
    }
    const local = await env.DB.prepare(
      `SELECT title, source_id as id FROM source WHERE status=1 AND is_delete=0 AND is_time=0 AND source_category_id=? ORDER BY create_time DESC LIMIT ?`
    )
      .bind(cat.source_category_id, limit)
      .all<any>();
    const list = (local.results || []).map((x: any, i: number) => ({
      title: x.title,
      id: x.id,
      rank: i + 1,
      times: '',
    }));
    await env.KV.put(`ranking:${cat.name}`, JSON.stringify(list), { expirationTtl: 43200 });
  }
}
