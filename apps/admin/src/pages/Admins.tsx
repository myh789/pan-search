import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Admins() {
  const [items, setItems] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [dlg, setDlg] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState({
    admin_id: 0,
    admin_account: '',
    admin_password: '',
    admin_name: '',
    admin_group: 1,
  });
  const [selected, setSelected] = useState<number[]>([]);

  const load = async () => {
    const j = await api.get('/admin/admin/getList');
    setItems(j.data?.items || []);
    setSelected([]);
  };
  useEffect(() => {
    load();
    api.get('/admin/group/getList').then((j) => setGroups(j.data?.items || []));
  }, []);

  const groupName = (id: number) => groups.find((g) => g.group_id === id)?.group_name || id;

  const save = async () => {
    if (dlg === 'add') {
      if (!form.admin_account || !form.admin_password) return alert('请填写账号和密码');
      const j = await api.postForm('/admin/admin/add', form);
      alert(j.message);
      if (j.code === 200) {
        setDlg(null);
        load();
      }
    } else {
      const j = await api.postForm('/admin/admin/update', form);
      alert(j.message);
      if (j.code === 200) {
        setDlg(null);
        load();
      }
    }
  };

  const del = async (ids: number[]) => {
    const filtered = ids.filter((id) => id !== 1);
    if (!filtered.length) return alert('不可删除超管 / 未选择');
    if (!confirm(`确认删除 ${filtered.length} 个管理员？`)) return;
    const j = await api.postForm('/admin/admin/delete', { ids: filtered.join(',') });
    alert(j.message);
    load();
  };

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="plain sm"
          onClick={() => {
            setForm({ admin_id: 0, admin_account: '', admin_password: 'Admin123!', admin_name: '', admin_group: 1 });
            setDlg('add');
          }}
        >
          + 添加
        </button>
        <button type="button" className="plain sm" onClick={() => del(selected)}>
          批量删除
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>
              <input
                type="checkbox"
                checked={items.length > 0 && selected.length === items.filter((i) => i.admin_id !== 1).length}
                onChange={(e) =>
                  setSelected(e.target.checked ? items.filter((i) => i.admin_id !== 1).map((i) => i.admin_id) : [])
                }
              />
            </th>
            <th style={{ width: 70 }}>ID</th>
            <th>帐号</th>
            <th>昵称</th>
            <th>用户组</th>
            <th>注册IP</th>
            <th style={{ width: 90, textAlign: 'center' }}>禁用</th>
            <th style={{ width: 120, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.admin_id}>
              <td>
                {it.admin_id !== 1 ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(it.admin_id)}
                    onChange={(e) =>
                      setSelected((s) => (e.target.checked ? [...s, it.admin_id] : s.filter((x) => x !== it.admin_id)))
                    }
                  />
                ) : null}
              </td>
              <td>{it.admin_id}</td>
              <td>{it.admin_account}</td>
              <td>{it.admin_name}</td>
              <td>{groupName(it.admin_group)}</td>
              <td>{it.admin_ipreg || '-'}</td>
              <td style={{ textAlign: 'center' }}>
                {it.admin_id !== 1 ? (
                  <button
                    type="button"
                    className={`switch ${it.admin_status ? 'on danger' : ''}`}
                    onClick={async () => {
                      await api.postForm(it.admin_status ? '/admin/admin/enable' : '/admin/admin/disable', {
                        admin_id: it.admin_id,
                      });
                      load();
                    }}
                  />
                ) : (
                  '-'
                )}
              </td>
              <td style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setForm({
                      admin_id: it.admin_id,
                      admin_account: it.admin_account,
                      admin_password: '',
                      admin_name: it.admin_name || '',
                      admin_group: it.admin_group || 1,
                    });
                    setDlg('edit');
                  }}
                >
                  编辑
                </button>
                {it.admin_id !== 1 ? (
                  <button type="button" className="link-btn danger-text" onClick={() => del([it.admin_id])}>
                    删除
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dlg && (
        <div className="modal-mask" onClick={() => setDlg(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              {dlg === 'add' ? '添加管理员' : '编辑管理员'}
              <button type="button" className="link-btn" onClick={() => setDlg(null)}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              {dlg === 'add' && (
                <div className="field">
                  <label>帐号</label>
                  <input value={form.admin_account} onChange={(e) => setForm({ ...form, admin_account: e.target.value })} />
                </div>
              )}
              <div className="field">
                <label>昵称</label>
                <input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
              </div>
              <div className="field">
                <label>用户组</label>
                <select value={form.admin_group} onChange={(e) => setForm({ ...form, admin_group: Number(e.target.value) })}>
                  {groups.map((g) => (
                    <option key={g.group_id} value={g.group_id}>
                      {g.group_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{dlg === 'add' ? '密码' : '新密码（留空不改）'}</label>
                <input
                  type="password"
                  value={form.admin_password}
                  onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                />
              </div>
            </div>
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
