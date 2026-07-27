import { useEffect, useState } from 'react';
import { api } from '../api/client';

const panLabel: Record<number, string> = { 0: '夸克网盘', 2: '百度网盘', 3: 'UC网盘', 4: '迅雷云盘' };
const typeLabel: Record<string, string> = { api: '接口', html: '网页', tg: 'TG频道', kk: 'KK' };

const empty = {
  id: 0,
  name: '',
  type: 'api',
  pantype: 0,
  url: '',
  method: 'GET',
  weight: 10,
  count: 5,
  fixed_params: '{"keyword":"{keyword}"}',
  field_map: '{"list":"data","title":"title","url":"url"}',
  headers: '{}',
  status: 1,
};

export function ApiList() {
  const [items, setItems] = useState<any[]>([]);
  const [dlg, setDlg] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    const j = await api.get('/admin/api_list/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.name.trim() || !form.url.trim()) return alert('请填写名称和地址');
    const j =
      dlg === 'edit' ? await api.postForm('/admin/api_list/update', form) : await api.postForm('/admin/api_list/add', form);
    alert(j.message);
    if (j.code === 200) {
      setDlg(null);
      load();
    }
  };

  const formFields = (
    <>
      <div className="field">
        <label>网盘类型</label>
        <div className="seg">
          {[0, 2, 3, 4].map((p) => (
            <button key={p} type="button" className={form.pantype === p ? 'active' : ''} onClick={() => setForm({ ...form, pantype: p })}>
              {panLabel[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>线路名称</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <label>总数限制</label>
        <input
          type="number"
          style={{ maxWidth: 120 }}
          value={form.count}
          onChange={(e) => setForm({ ...form, count: Number(e.target.value) })}
        />
        <p className="tips">建议最大设置为 5</p>
      </div>
      <div className="field">
        <label>类型</label>
        <div className="seg">
          {(['api', 'tg', 'html', 'kk'] as const).map((t) => (
            <button key={t} type="button" className={form.type === t ? 'active' : ''} onClick={() => setForm({ ...form, type: t })}>
              {typeLabel[t]}
            </button>
          ))}
        </div>
        {form.type === 'html' && <p className="tips"><em>网页爬虫配置较复杂，不推荐</em></p>}
        {form.type === 'tg' && <p className="tips"><em>国内服务器可能无法访问；如 https://t.me/s/NewQuark 只填 NewQuark</em></p>}
      </div>
      <div className="field">
        <label>{form.type === 'tg' ? 'TG 频道' : '地址'}</label>
        <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </div>
      <div className="field">
        <label>权重/排序</label>
        <input
          type="number"
          style={{ maxWidth: 120 }}
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
        />
      </div>
      {form.type === 'api' || form.type === 'kk' ? (
        <>
          <div className="field">
            <label>fixed_params</label>
            <textarea rows={2} value={form.fixed_params} onChange={(e) => setForm({ ...form, fixed_params: e.target.value })} />
          </div>
          <div className="field">
            <label>field_map</label>
            <textarea rows={2} value={form.field_map} onChange={(e) => setForm({ ...form, field_map: e.target.value })} />
          </div>
        </>
      ) : null}
    </>
  );

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="plain sm"
          onClick={() => {
            setForm({ ...empty });
            setDlg('add');
          }}
        >
          + 添加
        </button>
        <a className="plain sm" style={{ padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 4 }} href="/api/other/web_search?title=仙逆&is_show=1" target="_blank" rel="noreferrer">
          夸克测试
        </a>
        <a className="plain sm" style={{ padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 4 }} href="/api/other/web_search?title=仙逆&is_show=1&is_type=2" target="_blank" rel="noreferrer">
          百度测试
        </a>
        <a className="plain sm" style={{ padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 4 }} href="/api/other/web_search?title=仙逆&is_show=1&is_type=3" target="_blank" rel="noreferrer">
          UC测试
        </a>
        <a className="plain sm" style={{ padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 4 }} href="/api/other/web_search?title=仙逆&is_show=1&is_type=4" target="_blank" rel="noreferrer">
          迅雷测试
        </a>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>ID</th>
            <th style={{ width: 100 }}>网盘类型</th>
            <th>线路名称</th>
            <th>地址</th>
            <th style={{ width: 80 }}>类型</th>
            <th style={{ width: 90, textAlign: 'center' }}>获取数</th>
            <th style={{ width: 90, textAlign: 'center' }}>是否开启</th>
            <th style={{ width: 70, textAlign: 'center' }}>排序</th>
            <th style={{ width: 120, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.id}</td>
              <td>{panLabel[it.pantype] || '夸克网盘'}</td>
              <td>{it.name}</td>
              <td style={{ maxWidth: 220, wordBreak: 'break-all' }}>{it.url}</td>
              <td>{typeLabel[it.type] || it.type}</td>
              <td style={{ textAlign: 'center' }}>{it.count}</td>
              <td style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className={`switch ${it.status ? 'on' : ''}`}
                  onClick={async () => {
                    await api.postForm(it.status ? '/admin/api_list/disable' : '/admin/api_list/enable', { id: it.id });
                    load();
                  }}
                />
              </td>
              <td style={{ textAlign: 'center' }}>{it.weight}</td>
              <td style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setForm({
                      id: it.id,
                      name: it.name || '',
                      type: it.type || 'api',
                      pantype: it.pantype || 0,
                      url: it.url || '',
                      method: it.method || 'GET',
                      weight: it.weight || 10,
                      count: it.count || 5,
                      fixed_params: it.fixed_params || '{}',
                      field_map: it.field_map || '{}',
                      headers: it.headers || '{}',
                      status: it.status ?? 1,
                    });
                    setDlg('edit');
                  }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="link-btn danger-text"
                  onClick={async () => {
                    if (!confirm('确认删除该线路？')) return;
                    await api.postForm('/admin/api_list/delete', { id: it.id });
                    load();
                  }}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dlg && (
        <div className="modal-mask" onClick={() => setDlg(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              {dlg === 'add' ? '添加线路' : '编辑线路'}
              <button type="button" className="link-btn" onClick={() => setDlg(null)}>
                ×
              </button>
            </div>
            <div className="modal-bd">{formFields}</div>
            <div className="modal-ft">
              <button type="button" onClick={save}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
