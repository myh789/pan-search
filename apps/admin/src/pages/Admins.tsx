import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Admins() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ admin_account: '', admin_password: 'Admin123!', admin_name: '', admin_group: 1 });

  const load = async () => {
    const j = await api.get('/admin/admin/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2>管理员</h2>
      <div className="card row">
        <input placeholder="账号" value={form.admin_account} onChange={(e) => setForm({ ...form, admin_account: e.target.value })} />
        <input placeholder="昵称" value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
        <input
          placeholder="密码"
          value={form.admin_password}
          onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
        />
        <button
          onClick={async () => {
            await api.postForm('/admin/admin/add', form);
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
              <th>账号</th>
              <th>昵称</th>
              <th>组</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.admin_id}>
                <td>{it.admin_id}</td>
                <td>{it.admin_account}</td>
                <td>{it.admin_name}</td>
                <td>{it.admin_group}</td>
                <td>{it.admin_status ? '禁用' : '正常'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
