import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { uploadImageFile } from './Dashboard';

export function ConfPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/admin/conf/getBaseConfig').then((j) => {
      setRows(j.data || []);
      const m: Record<string, string> = {};
      for (const r of j.data || []) m[r.conf_key] = r.conf_value || '';
      setMap(m);
    });
  }, []);

  const save = async () => {
    const j = await api.postJson('/admin/conf/updateBaseConfig', map);
    alert(j.message);
  };

  const groups: Record<number, any[]> = {};
  for (const r of rows) {
    groups[r.conf_type] = groups[r.conf_type] || [];
    groups[r.conf_type].push(r);
  }
  const labels: Record<number, string> = {
    0: '站点',
    1: '搜索/接口',
    2: '上传',
    3: '首页样式',
    4: '网盘',
    9: 'SEO',
  };

  return (
    <div>
      <h2>基础设置</h2>
      <p className="muted">上线前务必修改 <code>api_key</code>；图片类字段可点「上传」写入 R2 地址。</p>
      {Object.entries(groups).map(([type, list]) => (
        <div className="card" key={type}>
          <h3>{labels[Number(type)] || `分类 ${type}`}</h3>
          {list.map((r) => (
            <div className="field" key={r.conf_key}>
              <label>
                {r.conf_title} <span className="muted">({r.conf_key})</span>
              </label>
              <div className="row">
                {Number(r.conf_spec) === 1 || (map[r.conf_key] || '').length > 80 ? (
                  <textarea
                    rows={3}
                    value={map[r.conf_key] || ''}
                    onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })}
                  />
                ) : (
                  <input
                    value={map[r.conf_key] || ''}
                    onChange={(e) => setMap({ ...map, [r.conf_key]: e.target.value })}
                  />
                )}
                {Number(r.conf_spec) === 4 && (
                  <label
                    className="ghost"
                    style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    上传
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const j = await uploadImageFile(f);
                        if (j.code === 200 && j.data?.path) {
                          setMap((prev) => ({ ...prev, [r.conf_key]: j.data.path }));
                          alert('已填入地址，请点「保存全部」');
                        } else {
                          alert(j.message || '上传失败');
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {r.conf_desc && <div className="muted">{r.conf_desc}</div>}
              {Number(r.conf_spec) === 4 && map[r.conf_key] && (
                <img src={map[r.conf_key]} alt="" style={{ maxHeight: 48, marginTop: 8, borderRadius: 6 }} />
              )}
            </div>
          ))}
        </div>
      ))}
      <button onClick={save}>保存全部</button>
    </div>
  );
}
