import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { uploadImageFile } from './Dashboard';

export function Attach() {
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const j = await api.get('/admin/attach/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>附件管理</h2>
      <div className="card row">
        <label className="ghost" style={{ padding: '8px 14px', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer' }}>
          上传图片到 R2
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const j = await uploadImageFile(f);
              alert(j.message + (j.data?.path ? `\n${j.data.path}` : ''));
              load();
            }}
          />
        </label>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>路径</th>
              <th>大小</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.attach_id}>
                <td>{it.attach_id}</td>
                <td>{it.attach_name}</td>
                <td style={{ wordBreak: 'break-all' }}>
                  <a href={`/api/tool/file?key=${encodeURIComponent(it.attach_path)}`} target="_blank" rel="noreferrer">
                    {it.attach_path}
                  </a>
                </td>
                <td>{it.attach_size}</td>
                <td>
                  <button
                    className="danger"
                    onClick={async () => {
                      await api.postForm('/admin/attach/delete', { attach_id: it.attach_id });
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
