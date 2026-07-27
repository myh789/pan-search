import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { uploadImageFile } from './Dashboard';

function fileUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return `/api/tool/file?key=${encodeURIComponent(path)}`;
}

function sizeLabel(n?: number) {
  if (!n) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function Attach() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = async (p = page) => {
    const j = await api.get(`/admin/attach/getList?page=${p}&page_size=20`);
    setItems(j.data?.items || []);
    setTotal(j.data?.total || 0);
    setSelected([]);
  };

  useEffect(() => {
    load(1);
  }, []);

  const del = async (ids: number[]) => {
    if (!ids.length) return alert('未选择任何附件');
    if (!confirm(`确认删除 ${ids.length} 个附件？`)) return;
    const j = await api.postForm('/admin/attach/delete', { ids: ids.join(',') });
    alert(j.message);
    if (j.code === 200) load(page);
  };

  return (
    <div>
      <div className="toolbar">
        <label className="plain" style={{ padding: '6px 12px', border: '1px solid var(--line-strong)', borderRadius: 4, cursor: 'pointer' }}>
          {uploading ? '上传中…' : '上传图片'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            hidden
            disabled={uploading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2 * 1024 * 1024) return alert('图片需小于 2MB');
              setUploading(true);
              try {
                const j = await uploadImageFile(f);
                alert(j.message);
                if (j.code === 200) load(page);
              } finally {
                setUploading(false);
                e.target.value = '';
              }
            }}
          />
        </label>
        <button type="button" className="plain sm" onClick={() => del(selected)}>
          批量删除
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
                onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.attach_id) : [])}
              />
            </th>
            <th style={{ width: 60 }}>ID</th>
            <th style={{ width: 120 }}>文件预览</th>
            <th>文件名称</th>
            <th style={{ width: 100 }}>附件大小</th>
            <th style={{ width: 120 }}>附件类型</th>
            <th style={{ width: 80 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const url = fileUrl(it.attach_path);
            return (
              <tr key={it.attach_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(it.attach_id)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, it.attach_id] : s.filter((x) => x !== it.attach_id)))
                    }
                  />
                </td>
                <td>{it.attach_id}</td>
                <td>
                  <a href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt=""
                      style={{ width: 80, height: 80, objectFit: 'contain', background: '#f8f8f9', borderRadius: 6 }}
                    />
                  </a>
                </td>
                <td>{it.attach_name}</td>
                <td>{sizeLabel(it.attach_size)}</td>
                <td>
                  <span className="tag warn">{String(it.attach_type || '').toUpperCase()}</span>
                </td>
                <td>
                  <button type="button" className="link-btn danger-text" onClick={() => del([it.attach_id])}>
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
          {!items.length && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: '#909399' }}>
                暂无附件
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
          disabled={items.length < 20}
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
