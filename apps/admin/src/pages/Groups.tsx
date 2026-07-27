import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Groups() {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [gid, setGid] = useState(0);
  const [nodes, setNodes] = useState<any[]>([]);
  const [checked, setChecked] = useState<number[]>([]);

  const load = async () => {
    const j = await api.get('/admin/group/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  const loadAuth = async (id: number) => {
    setGid(id);
    const j = await api.get(`/admin/group/getAuthorize?group_id=${id}`);
    setNodes(j.data?.nodes || []);
    setChecked(j.data?.checked || []);
  };

  return (
    <div>
      <h2>用户组</h2>
      <div className="card row">
        <input placeholder="新组名" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
        <button
          onClick={async () => {
            await api.postForm('/admin/group/add', { group_name: name });
            setName('');
            load();
          }}
        >
          添加组
        </button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.group_id}>
                <td>{it.group_id}</td>
                <td>{it.group_name}</td>
                <td>{it.group_status ? '禁用' : '正常'}</td>
                <td className="row">
                  {it.group_id !== 1 && (
                    <>
                      <button className="ghost" onClick={() => loadAuth(it.group_id)}>
                        授权
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          const j = await api.postForm('/admin/group/delete', { group_id: it.group_id });
                          alert(j.message);
                          load();
                        }}
                      >
                        删
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gid > 0 && gid !== 1 && (
        <div className="card">
          <h3>授权菜单节点（组 {gid}）</h3>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {nodes.map((n) => (
              <label key={n.node_id} style={{ display: 'flex', gap: 6, minWidth: 160 }}>
                <input
                  type="checkbox"
                  checked={checked.includes(n.node_id)}
                  onChange={(e) => {
                    setChecked((prev) =>
                      e.target.checked ? [...prev, n.node_id] : prev.filter((x) => x !== n.node_id)
                    );
                  }}
                />
                {n.node_title}
              </label>
            ))}
          </div>
          <button
            style={{ marginTop: 12 }}
            onClick={async () => {
              const j = await api.postForm('/admin/group/authorize', {
                group_id: gid,
                node_ids: checked.join(','),
              });
              alert(j.message);
            }}
          >
            保存授权
          </button>
        </div>
      )}
    </div>
  );
}
