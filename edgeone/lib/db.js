import { KEYS, blobGet, blobSet } from './blob.js';
import { encodePassword, env, nowSec, randString } from './utils.js';

const DEFAULT_CONF = {
  app_name: '资源姐搜索',
  app_title: '',
  app_subname: '聚合多个网盘来源，快速找到可用链接',
  is_quan: '1',
  is_quan_type: '0',
  is_quan_zc: '0',
  ban_keywords: '',
  temp_source_ttl: '30',
  pc_type: '0',
  enable_quark: '1',
  enable_baidu: '1',
  enable_xunlei: '1',
  quark_cookie: '',
  quark_file: '',
  quark_file_time: '',
  Authorization: '',
  ali_drive_id: '',
  ali_file: '',
  ali_file_time: '',
  baidu_cookie: '',
  baidu_file: '',
  baidu_file_time: '',
  uc_cookie: '',
  uc_file: '',
  uc_file_time: '',
  xunlei_cookie: '',
  xunlei_file: '',
  xunlei_file_time: '',
  quark_banned: '',
  seo_statistics: '',
  footer_copyright: '资源姐搜索',
  contact_text: '资源缺失可联系管理员，或加入交流群获取帮助。',
  search_tips: '聚合多个网盘来源，快速找到可用链接',
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function bumpSearchStats() {
  let st = (await blobGet(KEYS.searchStats)) || {};
  if (typeof st !== 'object') st = {};
  const today = todayStr();
  if (st.day !== today) {
    st.day = today;
    st.today = 0;
  }
  st.today = Number(st.today || 0) + 1;
  st.total = Number(st.total || 0) + 1;
  st.updated_at = nowSec();
  await blobSet(KEYS.searchStats, st);
  return st;
}

export async function getSearchStats() {
  let st = (await blobGet(KEYS.searchStats)) || {};
  if (typeof st !== 'object') st = {};
  const today = todayStr();
  if (st.day !== today) {
    return { today: 0, total: Number(st.total || 0), day: today };
  }
  return { today: Number(st.today || 0), total: Number(st.total || 0), day: today };
}

/** 默认夸克全网搜线路（空库时写入；也可后台一键导入） */
export const DEFAULT_QUARK_LINES = [
  {
    name: 'PanHunt夸克',
    type: 0,
    pantype: 0,
    url: 'https://s.panhunt.com/api/search',
    method: 'GET',
    fixed_params: '{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"all"}',
    field_map: '{"list":"data.merged_by_type.quark","title":"note","url":"url"}',
    headers: '{}',
    count: 10,
    weight: 30,
    status: 1,
    scene: 0,
  },
  {
    name: 'PanHunt插件夸克',
    type: 0,
    pantype: 0,
    url: 'https://s.panhunt.com/api/search',
    method: 'GET',
    fixed_params: '{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"plugin"}',
    field_map: '{"list":"data.merged_by_type.quark","title":"note","url":"url"}',
    headers: '{}',
    count: 10,
    weight: 28,
    status: 1,
    scene: 0,
  },
  {
    name: '252035夸克',
    type: 0,
    pantype: 0,
    url: 'https://so.252035.xyz/api/search',
    method: 'GET',
    fixed_params: '{"kw":"{keyword}","cloud_types":"quark","res":"merge","src":"all"}',
    field_map: '{"list":"data.merged_by_type.quark","title":"note","url":"url"}',
    headers: '{}',
    count: 10,
    weight: 26,
    status: 1,
    scene: 0,
  },
  {
    name: '猫狸盘搜夸克',
    type: 1,
    pantype: 0,
    url: 'https://www.alipansou.com/search?k={keyword}&p=quark&s=0&t=-1',
    method: 'GET',
    fixed_params: '{}',
    field_map: '{}',
    headers: '{}',
    count: 10,
    weight: 22,
    status: 1,
    scene: 0,
  },
  {
    name: 'AI盘搜夸克',
    type: 1,
    pantype: 0,
    url: 'https://aipanso.com/search?k={keyword}&p=quark&s=0&t=-1',
    method: 'GET',
    fixed_params: '{}',
    field_map: '{}',
    headers: '{}',
    count: 10,
    weight: 20,
    status: 1,
    scene: 0,
  },
];

/** 生成 PanSou 兼容 JSON 线路（仅 type=0） */
function pansouJsonLine({ name, pantype, cloud, src, url, weight, count = 20, extra = {} }) {
  return {
    name,
    type: 0,
    pantype,
    url,
    method: 'GET',
    fixed_params: JSON.stringify({
      kw: '{keyword}',
      cloud_types: cloud,
      res: 'merge',
      src,
      ...extra,
    }),
    field_map: JSON.stringify({
      list: `data.merged_by_type.${cloud}`,
      title: 'note',
      url: 'url',
      code: 'password',
      times: 'datetime',
    }),
    headers: '{}',
    count,
    weight,
    status: 1,
    scene: 0,
  };
}

const PANHUNT = 'https://s.panhunt.com/api/search';
const SO252035 = 'https://so.252035.xyz/api/search';

/** 百度：多源 PanSou JSON（提高 count；all + plugin + tg + 热门插件） */
export const DEFAULT_BAIDU_LINES = [
  pansouJsonLine({ name: '252035百度', pantype: 2, cloud: 'baidu', src: 'all', url: SO252035, weight: 36, count: 25 }),
  pansouJsonLine({ name: 'PanHunt百度', pantype: 2, cloud: 'baidu', src: 'all', url: PANHUNT, weight: 34, count: 25 }),
  pansouJsonLine({ name: '252035插件百度', pantype: 2, cloud: 'baidu', src: 'plugin', url: SO252035, weight: 30, count: 20 }),
  pansouJsonLine({ name: 'PanHunt插件百度', pantype: 2, cloud: 'baidu', src: 'plugin', url: PANHUNT, weight: 28, count: 20 }),
  pansouJsonLine({ name: '252035频道百度', pantype: 2, cloud: 'baidu', src: 'tg', url: SO252035, weight: 26, count: 20 }),
  pansouJsonLine({ name: 'PanHunt频道百度', pantype: 2, cloud: 'baidu', src: 'tg', url: PANHUNT, weight: 24, count: 20 }),
  // 指定偏百度的插件集，补 all/plugin 之外的结果
  pansouJsonLine({
    name: '252035混合盘百度',
    pantype: 2,
    cloud: 'baidu',
    src: 'plugin',
    url: SO252035,
    weight: 22,
    count: 20,
    extra: { plugins: 'hunhepan,pansearch,panta,kkkob,jikepan' },
  }),
  pansouJsonLine({
    name: 'PanHunt混合盘百度',
    pantype: 2,
    cloud: 'baidu',
    src: 'plugin',
    url: PANHUNT,
    weight: 20,
    count: 20,
    extra: { plugins: 'hunhepan,pansearch,panta,kkkob,jikepan' },
  }),
];

/** 迅雷：仅 JSON 接口（网页源不导入） */
export const DEFAULT_XUNLEI_LINES = [
  pansouJsonLine({ name: 'PanHunt迅雷', pantype: 4, cloud: 'xunlei', src: 'all', url: PANHUNT, weight: 32, count: 20 }),
  pansouJsonLine({ name: 'PanHunt插件迅雷', pantype: 4, cloud: 'xunlei', src: 'plugin', url: PANHUNT, weight: 30, count: 15 }),
  pansouJsonLine({ name: 'PanHunt频道迅雷', pantype: 4, cloud: 'xunlei', src: 'tg', url: PANHUNT, weight: 28, count: 15 }),
  pansouJsonLine({ name: '252035迅雷', pantype: 4, cloud: 'xunlei', src: 'all', url: SO252035, weight: 26, count: 20 }),
  pansouJsonLine({ name: '252035插件迅雷', pantype: 4, cloud: 'xunlei', src: 'plugin', url: SO252035, weight: 24, count: 15 }),
  pansouJsonLine({ name: '252035频道迅雷', pantype: 4, cloud: 'xunlei', src: 'tg', url: SO252035, weight: 22, count: 15 }),
];

export const DEFAULT_SEARCH_LINES = [
  ...DEFAULT_QUARK_LINES,
  ...DEFAULT_BAIDU_LINES,
  ...DEFAULT_XUNLEI_LINES,
];

export async function seedDefaultQuarkLines({ force = false } = {}) {
  let list = (await blobGet(KEYS.apiList)) || [];
  if (!Array.isArray(list)) list = [];
  if (force) list = [];

  // 百度/迅雷只保留 JSON：清掉已存在的网页抓取线路
  const before = list.length;
  list = list.filter((x) => {
    const p = Number(x.pantype);
    if ((p === 2 || p === 4) && Number(x.type) === 1) return false;
    return true;
  });
  const removedHtml = before - list.length;

  const meta = (await blobGet(KEYS.meta)) || { next_source_id: 1, next_api_id: 1 };
  let nextId = Number(meta.next_api_id || 1);
  const existingKeys = new Set(list.map((x) => `${x.name}|${x.url}|${x.fixed_params || ''}`));
  const added = [];
  let updated = 0;

  for (const tpl of DEFAULT_SEARCH_LINES) {
    const key = `${tpl.name}|${tpl.url}|${tpl.fixed_params || ''}`;
    // 同名同址：升级 count / field_map / weight / fixed_params（便于百度扩源后热更新）
    const same = list.find(
      (x) =>
        String(x.name) === String(tpl.name) &&
        String(x.url) === String(tpl.url) &&
        Number(x.pantype) === Number(tpl.pantype)
    );
    if (same) {
      let dirty = false;
      if (Number(same.count || 0) < Number(tpl.count || 0)) {
        same.count = tpl.count;
        dirty = true;
      }
      if (tpl.field_map && same.field_map !== tpl.field_map) {
        same.field_map = tpl.field_map;
        dirty = true;
      }
      if (tpl.fixed_params && same.fixed_params !== tpl.fixed_params) {
        same.fixed_params = tpl.fixed_params;
        dirty = true;
      }
      if (typeof tpl.weight === 'number' && Number(same.weight) !== Number(tpl.weight)) {
        same.weight = tpl.weight;
        dirty = true;
      }
      if (dirty) {
        same.update_time = nowSec();
        updated += 1;
      }
      existingKeys.add(`${same.name}|${same.url}|${same.fixed_params || ''}`);
      continue;
    }
    if (existingKeys.has(key)) continue;
    const row = { ...tpl, id: nextId++, create_time: nowSec(), update_time: nowSec() };
    list.push(row);
    added.push(row);
    existingKeys.add(key);
  }
  if (added.length || removedHtml || updated) {
    meta.next_api_id = nextId;
    await blobSet(KEYS.meta, meta);
    await blobSet(KEYS.apiList, list);
  }
  return { added: added.length, updated, removedHtml, total: list.length, items: list };
}

export async function ensureBootstrap() {
  let meta = await blobGet(KEYS.meta);
  if (!meta) {
    meta = { next_source_id: 1, next_api_id: 1, bootstrapped_at: nowSec() };
    await blobSet(KEYS.meta, meta);
  }

  let conf = await blobGet(KEYS.conf);
  if (!conf || typeof conf !== 'object') {
    conf = { ...DEFAULT_CONF };
    await blobSet(KEYS.conf, conf);
  } else {
    conf = { ...DEFAULT_CONF, ...conf };
    let dirty = false;
    if (/edgeone/i.test(String(conf.app_subname || ''))) {
      conf.app_subname = DEFAULT_CONF.app_subname;
      dirty = true;
    }
    if (/转存后分享/.test(String(conf.app_subname || ''))) {
      conf.app_subname = DEFAULT_CONF.app_subname;
      dirty = true;
    }
    if (/转存后分享/.test(String(conf.search_tips || ''))) {
      conf.search_tips = DEFAULT_CONF.search_tips;
      dirty = true;
    }
    if (/^pansearch$/i.test(String(conf.app_name || '').trim())) {
      conf.app_name = DEFAULT_CONF.app_name;
      dirty = true;
    }
    if (/一站式|网盘资源搜索/.test(String(conf.app_title || ''))) {
      conf.app_title = DEFAULT_CONF.app_title;
      dirty = true;
    }
    if (/^pansearch$/i.test(String(conf.footer_copyright || '').trim()) || /edgeone/i.test(String(conf.footer_copyright || ''))) {
      conf.footer_copyright = DEFAULT_CONF.footer_copyright;
      dirty = true;
    }
    if (dirty) await blobSet(KEYS.conf, conf);
  }

  let admin = await blobGet(KEYS.admin);
  if (!admin) {
    const salt = 'abcd';
    const pwd = env('ADMIN_BOOTSTRAP_PASSWORD', 'Admin123!');
    admin = {
      admin_id: 1,
      admin_account: 'admin',
      admin_password: encodePassword(pwd, salt),
      admin_salt: salt,
      admin_name: '管理员',
      admin_status: 0,
    };
    await blobSet(KEYS.admin, admin);
  }

  let apiList = await blobGet(KEYS.apiList);
  if (!Array.isArray(apiList) || !apiList.length) {
    const seeded = await seedDefaultQuarkLines({ force: false });
    apiList = seeded.items;
  }

  let tempIndex = await blobGet(KEYS.tempIndex);
  if (!Array.isArray(tempIndex)) {
    await blobSet(KEYS.tempIndex, []);
  }

  return { conf, admin, apiList, meta };
}

export async function getConf(force = false) {
  if (!force) {
    const c = await blobGet(KEYS.conf);
    if (c && typeof c === 'object') return { ...DEFAULT_CONF, ...c };
  }
  const { conf } = await ensureBootstrap();
  return conf;
}

export async function setConfMany(patch) {
  const conf = await getConf(true);
  for (const [k, v] of Object.entries(patch || {})) {
    if (['access_token', 'plat', 'version'].includes(k)) continue;
    conf[k] = String(v ?? '');
  }
  // 产品策略：只做转存后分享，不向前台暴露第三方原链
  conf.is_quan_type = '0';
  await blobSet(KEYS.conf, conf);
  return conf;
}

export async function getApiList({ pantype, scene, enabledOnly = false } = {}) {
  await ensureBootstrap();
  let list = (await blobGet(KEYS.apiList)) || [];
  if (!Array.isArray(list)) list = [];
  if (pantype !== undefined && pantype !== null && pantype !== '') {
    list = list.filter((x) => Number(x.pantype) === Number(pantype));
  }
  if (scene !== undefined && scene !== null && scene !== '') {
    const s = Number(scene) === 1 ? 1 : 0;
    list = list.filter((x) => Number(x.scene || 0) === s);
  }
  if (enabledOnly) list = list.filter((x) => Number(x.status) === 1);
  return list.sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0) || Number(b.id) - Number(a.id));
}

export async function saveApiList(list) {
  await blobSet(KEYS.apiList, list);
}

export async function nextId(kind) {
  const meta = (await blobGet(KEYS.meta)) || { next_source_id: 1, next_api_id: 1 };
  if (kind === 'api') {
    const id = Number(meta.next_api_id || 1);
    meta.next_api_id = id + 1;
    await blobSet(KEYS.meta, meta);
    return id;
  }
  const id = Number(meta.next_source_id || 1);
  meta.next_source_id = id + 1;
  await blobSet(KEYS.meta, meta);
  return id;
}

export async function createSession(adminId) {
  const token = randString(40);
  const session = { admin_id: adminId, created_at: nowSec() };
  await blobSet(KEYS.access(token), session);
  return token;
}

export async function getSession(token) {
  if (!token) return null;
  return blobGet(KEYS.access(token));
}

export async function deleteSession(token) {
  if (!token) return;
  const { blobDel } = await import('./blob.js');
  await blobDel(KEYS.access(token));
}

export async function insertTempSource(row) {
  const id = await nextId('source');
  const item = {
    source_id: id,
    title: row.title || '',
    url: row.url || '',
    code: row.code || '',
    is_type: Number(row.is_type || 0),
    fid: row.fid || '',
    is_time: 1,
    create_time: nowSec(),
    update_time: nowSec(),
  };
  await blobSet(KEYS.temp(id), item);
  const idx = (await blobGet(KEYS.tempIndex)) || [];
  idx.push(id);
  await blobSet(KEYS.tempIndex, [...new Set(idx)]);
  return item;
}

export async function listTempSources() {
  const idx = (await blobGet(KEYS.tempIndex)) || [];
  const rows = [];
  for (const id of idx) {
    const row = await blobGet(KEYS.temp(id));
    if (row) rows.push(row);
  }
  return rows;
}

export async function removeTempSource(id) {
  const { blobDel } = await import('./blob.js');
  await blobDel(KEYS.temp(id));
  const idx = ((await blobGet(KEYS.tempIndex)) || []).filter((x) => Number(x) !== Number(id));
  await blobSet(KEYS.tempIndex, idx);
}

export { DEFAULT_CONF };
