import { useEffect, useState } from 'react';
import { api } from '../api/client';

function fmtTime(ts?: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

export function Feedback() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  const load = async (p = page) => {
    const j = await api.get(`/admin/feedback/getList?page=${p}&page_size=50`);
    setItems(j.data?.items || []);
    setTotal(j.data?.total || 0);
    setSelected([]);
  };

  useEffect(() => {
    load(1);
  }, []);

  const del = async (ids: number[]) => {
    if (!ids.length) return alert('未选择任何需求');
    if (!confirm(`确认删除 ${ids.length} 条用户需求？`)) return;
    const j = await api.postForm('/admin/feedback/delete', { ids: ids.join(',') });
    alert(j.message);
    if (j.code === 200) load(page);
  };

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="plain sm" onClick={() => del(selected)}>
          批量删除
        </button>
        <button type="button" className="plain sm" onClick={() => load(page)}>
          刷新
        </button>
        <span className="spacer" />
        <span className="muted">共 {total} 条</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>
              <input
                type="checkbox"
                checked={items.length > 0 && selected.length === items.length}
                onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])}
              />
            </th>
            <th style={{ width: 80 }}>ID</th>
            <th>用户想要的资源描述</th>
            <th style={{ width: 180, textAlign: 'center' }}>提交时间</th>
            <th style={{ width: 100, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(it.id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, it.id] : s.filter((x) => x !== it.id)))
                  }
                />
              </td>
              <td>{it.id}</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{it.content}</td>
              <td style={{ textAlign: 'center' }}>{fmtTime(it.create_time)}</td>
              <td style={{ textAlign: 'center' }}>
                <button type="button" className="link-btn danger-text" onClick={() => del([it.id])}>
                  删除
                </button>
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#909399' }}>
                暂无用户需求
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="pager">
        <button
          type="button"
          className="plain sm"
          disabled={page <= 1}
          onClick={() => {
            const p = page - 1;
            setPage(p);
            load(p);
          }}
        >
          上一页
        </button>
        <span>{page}</span>
        <button
          type="button"
          className="plain sm"
          disabled={items.length < 50}
          onClick={() => {
            const p = page + 1;
            setPage(p);
            load(p);
          }}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
