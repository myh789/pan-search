import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Categories() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');

  const load = async () => {
    const j = await api.get('/admin/source_category/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>分类管理</h2>
      <div className="card row">
        <input placeholder="分类名" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
        <button
          onClick={async () => {
            await api.postForm('/admin/source_category/add', { name, sort: 100 });
            setName('');
            load();
          }}
        >
          添加
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>排序</th>
              <th>自动更新</th>
              <th>类型</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.source_category_id}>
                <td>{it.source_category_id}</td>
                <td>{it.name}</td>
                <td>{it.sort}</td>
                <td>
                  <button
                    className="ghost"
                    onClick={async () => {
                      await api.postForm('/admin/source_category/setStatus', {
                        source_category_id: it.source_category_id,
                        field: 'is_update',
                        value: it.is_update ? 0 : 1,
                      });
                      load();
                    }}
                  >
                    {it.is_update ? '开' : '关'}
                  </button>
                </td>
                <td>{it.is_type === 1 ? '本地' : '网络'}</td>
                <td>
                  {!it.is_sys && (
                    <button
                      className="danger"
                      onClick={async () => {
                        await api.postForm('/admin/source_category/delete', {
                          source_category_id: it.source_category_id,
                        });
                        load();
                      }}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
