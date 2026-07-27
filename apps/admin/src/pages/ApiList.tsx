import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function ApiList() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    type: 'api',
    pantype: 0,
    url: '',
    method: 'GET',
    weight: 10,
    count: 10,
    fixed_params: '{"keyword":"{keyword}"}',
    field_map: '{"list":"data","title":"title","url":"url"}',
  });

  const load = async () => {
    const j = await api.get('/admin/api_list/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>全网搜线路</h2>
      <div className="card">
        <div className="row">
          <input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ maxWidth: 120 }}>
            <option value="api">api</option>
            <option value="html">html</option>
            <option value="tg">tg</option>
            <option value="kk">kk</option>
          </select>
          <select
            value={form.pantype}
            onChange={(e) => setForm({ ...form, pantype: Number(e.target.value) })}
            style={{ maxWidth: 120 }}
          >
            <option value={0}>夸克</option>
            <option value={2}>百度</option>
            <option value={3}>UC</option>
            <option value={4}>迅雷</option>
          </select>
          <input placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </div>
        <div className="row">
          <input placeholder="fixed_params JSON" value={form.fixed_params} onChange={(e) => setForm({ ...form, fixed_params: e.target.value })} />
          <input placeholder="field_map JSON" value={form.field_map} onChange={(e) => setForm({ ...form, field_map: e.target.value })} />
          <button
            onClick={async () => {
              await api.postForm('/admin/api_list/add', form);
              load();
            }}
          >
            添加线路
          </button>
        </div>
        <p className="muted">
          试搜：打开前台搜索页切到全网搜，或访问{' '}
          <code>/api/other/web_search?title=测试&is_type=0</code>
        </p>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>类型</th>
              <th>盘</th>
              <th>权重</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.id}</td>
                <td>{it.name}</td>
                <td>{it.type}</td>
                <td>{it.pantype}</td>
                <td>{it.weight}</td>
                <td>{it.status ? '启用' : '停用'}</td>
                <td className="row">
                  <button
                    className="ghost"
                    onClick={async () => {
                      await api.postForm(it.status ? '/admin/api_list/disable' : '/admin/api_list/enable', { id: it.id });
                      load();
                    }}
                  >
                    {it.status ? '停用' : '启用'}
                  </button>
                  <button
                    className="danger"
                    onClick={async () => {
                      await api.postForm('/admin/api_list/delete', { id: it.id });
                      load();
                    }}
                  >
                    删
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
