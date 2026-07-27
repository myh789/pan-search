import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';

export function Sources() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState('');
  const [form, setForm] = useState({ title: '', url: '', code: '', source_category_id: 0, is_type: 0 });
  const [batch, setBatch] = useState('');
  const [cats, setCats] = useState<any[]>([]);

  const load = async () => {
    const j = await api.get(`/admin/source/getList?page=1&page_size=50&title=${encodeURIComponent(title)}`);
    setItems(j.data?.items || []);
    setTotal(j.data?.total || 0);
  };

  useEffect(() => {
    load();
    api.get('/admin/source_category/getList').then((j) => setCats(j.data?.items || []));
  }, []);

  const add = async () => {
    const j = await api.postForm('/admin/source/add', form);
    alert(j.message);
    if (j.code === 200) {
      setForm({ title: '', url: '', code: '', source_category_id: 0, is_type: 0 });
      load();
    }
  };

  const transferBatch = async () => {
    const j = await api.postForm('/admin/source/transfer', {
      urls: batch,
      source_category_id: form.source_category_id,
    });
    alert(j.message + (j.data?.logId ? ` log#${j.data.logId}` : ''));
  };

  const onExcel = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);
    const items = rows.map((r) => ({
      title: r.title || r.标题 || '',
      url: r.url || r.链接 || '',
      code: r.code || r.提取码 || '',
    }));
    const j = await api.postJson('/admin/source/imports', {
      items,
      source_category_id: form.source_category_id,
      mode: 'transfer',
    });
    alert(j.message);
  };

  return (
    <div>
      <h2>资源管理 ({total})</h2>
      <div className="card">
        <div className="row">
          <input style={{ maxWidth: 240 }} placeholder="搜索标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button onClick={load}>查询</button>
        </div>
        <div className="row">
          <input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input placeholder="链接" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input placeholder="提取码" style={{ maxWidth: 100 }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <select
            style={{ maxWidth: 160 }}
            value={form.source_category_id}
            onChange={(e) => setForm({ ...form, source_category_id: Number(e.target.value) })}
          >
            <option value={0}>分类</option>
            {cats.map((c) => (
              <option key={c.source_category_id} value={c.source_category_id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={add}>添加</button>
        </div>
        <textarea rows={4} placeholder="批量转存：每行 链接 [提取码] [标题]" value={batch} onChange={(e) => setBatch(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={transferBatch}>提交批量转存</button>
          <label className="ghost" style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
            Excel 导入
            <input
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => e.target.files?.[0] && onExcel(e.target.files[0])}
            />
          </label>
        </div>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>类型</th>
              <th>链接</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.source_id}>
                <td>{it.source_id}</td>
                <td>{it.title}</td>
                <td>{it.is_type}</td>
                <td style={{ maxWidth: 280, wordBreak: 'break-all' }}>{it.url}</td>
                <td>
                  <button
                    className="danger"
                    onClick={async () => {
                      await api.postForm('/admin/source/delete', { source_id: it.source_id });
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
      </div>
    </div>
  );
}
