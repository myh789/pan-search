import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { uploadImageFile } from './Dashboard';

type ConfRow = {
  conf_key: string;
  conf_value: string;
  conf_title?: string;
  conf_desc?: string;
  conf_spec?: number;
  conf_type?: number;
  conf_content?: string | null;
};

const TABS: { name: string; val: number }[] = [
  { name: '基础设置', val: 0 },
  { name: 'SEO设置', val: 9 },
  { name: '前端模版', val: 3 },
  { name: '搜索设置', val: 1 },
  { name: '微信设置', val: 8 },
  { name: '上传配置', val: 2 },
  { name: '其他配置', val: 4 },
];

const FALLBACK_RADIO: Record<string, [string, string][]> = {
  search_type: [
    ['精准搜索', '0'],
    ['模糊搜索', '1'],
    ['分词搜索', '2'],
  ],
  ranking_type: [
    ['无图模式', '0'],
    ['有图模式', '1'],
  ],
  app_demand: [
    ['开启', '0'],
    ['关闭', '1'],
  ],
  app_name_hide: [
    ['显示', '0'],
    ['隐藏', '1'],
  ],
  home_new: [
    ['开启', '0'],
    ['关闭', '1'],
  ],
  is_quan: [
    ['关闭', '0'],
    ['开启', '1'],
  ],
  pc_type: [
    ['跳转+扫码', '0'],
    ['仅跳转', '1'],
    ['仅扫码', '2'],
  ],
  is_quan_type: [
    ['转存分享', '0'],
    ['第三方直链', '1'],
  ],
  is_quan_zc: [
    ['开启', '1'],
    ['关闭', '0'],
  ],
};

function parseOptions(row: ConfRow): [string, string][] {
  const raw = row.conf_content;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, value] = l.split('=>');
        return [String(name || value || ''), String(value ?? name ?? '')] as [string, string];
      });
  }
  return FALLBACK_RADIO[row.conf_key] || [
    ['关闭', '0'],
    ['开启', '1'],
  ];
}

export function ConfPage() {
  const [rows, setRows] = useState<ConfRow[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [tab, setTab] = useState(0);

  const load = async () => {
    const j = await api.get('/admin/conf/getBaseConfig');
    const list = (j.data || []) as ConfRow[];
    setRows(list);
    const m: Record<string, string> = {};
    for (const r of list) m[r.conf_key] = r.conf_value || '';
    setMap(m);
  };

  useEffect(() => {
    load();
  }, []);

  const visibleTabs = useMemo(() => {
    const types = new Set(rows.map((r) => Number(r.conf_type)));
    return TABS.filter((t) => types.has(t.val));
  }, [rows]);

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.val === tab)) {
      setTab(visibleTabs[0].val);
    }
  }, [visibleTabs, tab]);

  const list = rows.filter((r) => Number(r.conf_type) === tab);

  const save = async () => {
    const payload: Record<string, string> = {};
    for (const r of list) payload[r.conf_key] = map[r.conf_key] ?? '';
    const j = await api.postJson('/admin/conf/updateBaseConfig', payload);
    alert(j.message);
  };

  return (
    <div>
      <div className="tabs">
        {visibleTabs.map((t) => (
          <button key={t.val} type="button" className={tab === t.val ? 'active' : ''} onClick={() => setTab(t.val)}>
            {t.name}
          </button>
        ))}
      </div>
      <p className="tips">上线前务必修改 <code>api_key</code>；图片字段可点「上传」。当前 Tab 保存只写入本页字段。</p>
      <div className="card">
        {list.map((r) => {
          const spec = Number(r.conf_spec || 0);
          return (
            <div className="field" key={r.conf_key}>
              <label>
                {r.conf_title || r.conf_key} <span className="muted">({r.conf_key})</span>
              </label>
              {spec === 1 ? (
                <textarea rows={4} value={map[r.conf_key] || ''} onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })} />
              ) : spec === 2 ? (
                <div className="seg">
                  {parseOptions(r).map(([name, value]) => (
                    <button
                      key={value}
                      type="button"
                      className={(map[r.conf_key] || '') === value ? 'active' : ''}
                      onClick={() => setMap({ ...map, [r.conf_key]: value })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : spec === 7 ? (
                <div className="row">
                  <input
                    type="color"
                    style={{ width: 48, height: 36, padding: 2 }}
                    value={/^#[0-9a-fA-F]{6}$/.test(map[r.conf_key] || '') ? map[r.conf_key] : '#133ab3'}
                    onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })}
                  />
                  <input value={map[r.conf_key] || ''} onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })} style={{ maxWidth: 160 }} />
                </div>
              ) : spec === 4 ? (
                <div className="row">
                  <input value={map[r.conf_key] || ''} onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })} placeholder="图片 URL" />
                  <label className="plain" style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 4, cursor: 'pointer' }}>
                    上传
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const j = await uploadImageFile(f);
                        if (j.code === 200 && j.data?.path) setMap((prev) => ({ ...prev, [r.conf_key]: j.data.path }));
                        else alert(j.message || '上传失败');
                      }}
                    />
                  </label>
                </div>
              ) : (
                <input value={map[r.conf_key] || ''} onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })} />
              )}
              {r.conf_desc ? <div className="tips">{r.conf_desc}</div> : null}
              {spec === 4 && map[r.conf_key] ? (
                <img src={map[r.conf_key]} alt="" style={{ maxHeight: 48, marginTop: 8, borderRadius: 6 }} />
              ) : null}
            </div>
          );
        })}
        {!list.length && <p className="muted">此分类暂无配置项</p>}
        <button type="button" onClick={save}>
          保存配置
        </button>
      </div>
    </div>
  );
}
