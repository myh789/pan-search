/**
 * 多榜单热搜：百度风云榜 + 豆瓣分类榜
 * EdgeOne 出网失败时回退猫眼 / 静态常搜片名
 * GET ?board=douban_top | baidu_movie | ...
 */

import { KEYS, blobGet, blobSet } from './blob.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const cache = new Map();
const TTL_MS = 20 * 60 * 1000;

/** 可切换榜单（前端「换一批」按此顺序循环） */
export const HOT_BOARDS = [
  { id: 'douban_top', title: '豆瓣高分', hint: '电影' },
  { id: 'baidu_movie', title: '百度电影', hint: '风云榜' },
  { id: 'baidu_teleplay', title: '百度剧集', hint: '风云榜' },
  { id: 'douban_cn', title: '华语电影', hint: '豆瓣' },
  { id: 'douban_hot', title: '豆瓣热门', hint: '电影' },
  { id: 'douban_tv_cn', title: '国产剧', hint: '豆瓣' },
  { id: 'douban_variety', title: '综艺榜', hint: '豆瓣' },
  { id: 'douban_us', title: '欧美电影', hint: '豆瓣' },
  { id: 'douban_jp', title: '日本电影', hint: '豆瓣' },
  { id: 'douban_kr', title: '韩国电影', hint: '豆瓣' },
  { id: 'douban_doc', title: '纪录片', hint: '豆瓣' },
  { id: 'baidu_novel', title: '百度小说', hint: '风云榜' },
];

const BOARD_MAP = Object.fromEntries(HOT_BOARDS.map((b) => [b.id, b]));

/** EdgeOne 出网受限时的兜底榜（常搜片名） */
const STATIC_FALLBACKS = {
  douban_top: [
    ['哪吒之魔童闹海', '8.4'], ['肖申克的救赎', '9.7'], ['霸王别姬', '9.6'], ['阿甘正传', '9.5'],
    ['泰坦尼克号', '9.5'], ['这个杀手不太冷', '9.4'], ['美丽人生', '9.5'], ['千与千寻', '9.4'],
    ['辛德勒的名单', '9.5'], ['星际穿越', '9.4'], ['盗梦空间', '9.4'], ['楚门的世界', '9.4'],
  ],
  douban_cn: [
    ['哪吒之魔童闹海', '8.4'], ['浪浪山小妖怪', '8.5'], ['我不是药神', '9.0'], ['让子弹飞', '9.0'],
    ['大话西游之大圣娶亲', '9.2'], ['无间道', '9.3'], ['活着', '9.3'], ['流浪地球', '7.9'],
    ['你好，李焕英', '8.0'], ['长津湖', '7.4'], ['封神第一部', '7.2'], ['满江红', '7.6'],
  ],
  douban_hot: [
    ['寒战1994', ''], ['消失的人', ''], ['穿普拉达的女王2', ''], ['真人快打2', ''],
    ['哪吒之魔童闹海', ''], ['疯狂动物城2', ''], ['浪浪山小妖怪', ''], ['复仇者联盟', ''],
    ['速度与激情', ''], ['蜘蛛侠', ''], ['流浪地球2', ''], ['满江红', ''],
  ],
  douban_tv_cn: [
    ['狂飙', '9.0'], ['漫长的季节', '9.4'], ['三体', '8.0'], ['繁花', '8.0'],
    ['人世间', '8.5'], ['觉醒年代', '9.3'], ['隐秘的角落', '8.8'], ['庆余年', '8.0'],
    ['甄嬛传', '9.3'], ['琅琊榜', '9.4'], ['父母爱情', '9.3'], ['大明王朝1566', '9.7'],
  ],
  douban_variety: [
    ['现在就出发', ''], ['花儿与少年', ''], ['奔跑吧', ''], ['极限挑战', ''],
    ['向往的生活', ''], ['脱口秀大会', ''], ['演员请就位', ''], ['声生不息', ''],
    ['中餐厅', ''], ['乘风破浪', ''], ['这就是街舞', ''], ['中国好声音', ''],
  ],
  baidu_movie: [
    ['寒战1994', ''], ['10间敢死队', ''], ['消失的人', ''], ['纵横四海', ''],
    ['三心两意', ''], ['穿普拉达的女王2', ''], ['真人快打2', ''], ['哪吒之魔童闹海', ''],
    ['浪浪山小妖怪', ''], ['疯狂动物城2', ''], ['唐探1900', ''], ['封神第二部', ''],
  ],
  baidu_teleplay: [
    ['蜜语纪', ''], ['八千里路云和月', ''], ['佳偶天成', ''], ['爱情没有神话', ''],
    ['方圆八百米', ''], ['月鳞绮纪', ''], ['白日提灯', ''], ['黑夜告白', ''],
    ['九门', ''], ['悬案', ''], ['御廷谣', ''], ['雀骨', ''],
  ],
};

function cleanTitle(t) {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*电影\s*$/u, '')
    .replace(/\s*电视剧\s*$/u, '')
    .trim();
}

function fmtHot(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v >= 10000) return (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万';
  return String(Math.round(v));
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json,*/*',
      Referer: 'https://top.baidu.com/',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

async function fetchJson(url, referer) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: referer || 'https://movie.douban.com/',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function fromBaiduBoard(tab) {
  const html = await fetchText('https://top.baidu.com/board?tab=' + encodeURIComponent(tab));
  const m = html.match(/<!--s-data:(.*?)-->/);
  if (!m) throw new Error('baidu ' + tab + ' parse fail');
  const parsed = JSON.parse(m[1]);
  const content = parsed?.data?.cards?.[0]?.content;
  if (!Array.isArray(content) || !content.length) throw new Error('baidu ' + tab + ' empty');
  return content.slice(0, 12).map((row, i) => ({
    rank: i + 1,
    title: cleanTitle(row.word || row.query || ''),
    hot: row.hotScore ? fmtHot(row.hotScore) : '',
    source: 'baidu_' + tab,
  })).filter((x) => x.title);
}

async function fromDouban(type, tag) {
  const j = await fetchJson(
    `https://movie.douban.com/j/search_subjects?type=${encodeURIComponent(type)}&tag=${encodeURIComponent(tag)}&page_limit=12&page_start=0`
  );
  const list = Array.isArray(j?.subjects) ? j.subjects : [];
  if (!list.length) throw new Error('douban ' + tag + ' empty');
  return list.slice(0, 12).map((row, i) => ({
    rank: i + 1,
    title: cleanTitle(row.title),
    hot: row.rate ? String(row.rate) : '',
    source: 'douban_' + tag,
  })).filter((x) => x.title);
}

async function fromMaoyan60s() {
  const j = await fetchJson('https://60s.viki.moe/v2/maoyan', 'https://60s.viki.moe/');
  const list = Array.isArray(j?.data?.list) ? j.data.list : [];
  if (!list.length) throw new Error('maoyan empty');
  return list.slice(0, 12).map((row, i) => ({
    rank: i + 1,
    title: cleanTitle(row.movie_name || row.title || ''),
    hot: row.box_office_desc || '',
    source: 'maoyan',
  })).filter((x) => x.title);
}

function fromStatic(id) {
  const rows = STATIC_FALLBACKS[id] || STATIC_FALLBACKS.douban_top;
  return rows.map((row, i) => ({
    rank: i + 1,
    title: row[0],
    hot: row[1] || '',
    source: 'static',
  }));
}

async function loadBoardItems(id) {
  switch (id) {
    case 'baidu_movie':
      return fromBaiduBoard('movie');
    case 'baidu_teleplay':
      return fromBaiduBoard('teleplay');
    case 'baidu_novel':
      return fromBaiduBoard('novel');
    case 'douban_top':
      return fromDouban('movie', '豆瓣高分');
    case 'douban_cn':
      return fromDouban('movie', '华语');
    case 'douban_hot':
      return fromDouban('movie', '热门');
    case 'douban_tv_cn':
      return fromDouban('tv', '国产剧');
    case 'douban_variety':
      return fromDouban('tv', '综艺');
    case 'douban_us':
      return fromDouban('movie', '欧美');
    case 'douban_jp':
      return fromDouban('movie', '日本');
    case 'douban_kr':
      return fromDouban('movie', '韩国');
    case 'douban_doc':
      return fromDouban('tv', '纪录片');
    default:
      throw new Error('unknown board');
  }
}

function resolveBoard(boardId) {
  if (boardId && BOARD_MAP[boardId]) return BOARD_MAP[boardId];
  return HOT_BOARDS[0];
}

export async function getHotList(boardId) {
  const board = resolveBoard(boardId);
  const now = Date.now();
  const hit = cache.get(board.id);
  if (hit && now - hit.at < TTL_MS) {
    return { ...hit.data, cached: true };
  }

  try {
    const blobHit = await blobGet(KEYS.hot(board.id));
    if (
      blobHit &&
      Number(blobHit.at) > 0 &&
      now - Number(blobHit.at) < TTL_MS &&
      Array.isArray(blobHit.data?.list) &&
      blobHit.data.list.length
    ) {
      cache.set(board.id, { at: Number(blobHit.at), data: blobHit.data });
      return { ...blobHit.data, cached: true };
    }
  } catch {
    /* ignore blob miss */
  }

  let items = [];
  let source = board.id;
  const errors = [];

  try {
    items = await loadBoardItems(board.id);
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  if (items.length < 6) {
    try {
      const maoyan = await fromMaoyan60s();
      if (!items.length) {
        items = maoyan;
      } else {
        const seen = new Set(items.map((x) => x.title.toLowerCase()));
        for (const row of maoyan) {
          if (seen.has(row.title.toLowerCase())) continue;
          items.push({ ...row, rank: items.length + 1 });
          if (items.length >= 12) break;
        }
      }
      source = source + '+maoyan';
    } catch (e) {
      errors.push('maoyan:' + (e?.message || e));
    }
  }

  if (items.length < 6) {
    items = fromStatic(board.id);
    source = source + '+static';
  }

  items = items.slice(0, 12).map((row, i) => ({ ...row, rank: i + 1 }));

  const payload = {
    board: board.id,
    title: board.title,
    subtitle: board.hint || '',
    source,
    update_time: new Date().toISOString(),
    list: items,
    boards: HOT_BOARDS,
    errors: errors.length ? errors : undefined,
  };
  cache.set(board.id, { at: now, data: payload });
  try {
    await blobSet(KEYS.hot(board.id), { at: now, data: payload });
  } catch {
    /* ignore persist fail */
  }
  return { ...payload, cached: false };
}
