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
      <div className="toolbar">
        <input placeholder="新组名" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }} />
        <button
          type="button"
          className="plain sm"
          onClick={async () => {
            if (!name.trim()) return alert('请填写组名');
            await api.postForm('/admin/group/add', { group_name: name });
            setName('');
            load();
          }}
        >
          + 添加组
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>ID</th>
            <th>名称</th>
            <th style={{ width: 90, textAlign: 'center' }}>禁用</th>
            <th style={{ width: 200, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.group_id}>
              <td>{it.group_id}</td>
              <td>{it.group_name}</td>
              <td style={{ textAlign: 'center' }}>
                {it.group_id !== 1 ? (
                  <button
                    type="button"
                    className={`switch ${it.group_status ? 'on danger' : ''}`}
                    onClick={async () => {
                      await api.postForm(it.group_status ? '/admin/group/enable' : '/admin/group/disable', {
                        group_id: it.group_id,
                      });
                      load();
                    }}
                  />
                ) : (
                  '-'
                )}
              </td>
              <td style={{ textAlign: 'center' }}>
                {it.group_id !== 1 ? (
                  <>
                    <button type="button" className="link-btn" onClick={() => loadAuth(it.group_id)}>
                      授权
                    </button>
                    <button
                      type="button"
                      className="link-btn danger-text"
                      onClick={async () => {
                        if (!confirm('确认删除该用户组？')) return;
                        const j = await api.postForm('/admin/group/delete', { group_id: it.group_id });
                        alert(j.message);
                        if (gid === it.group_id) setGid(0);
                        load();
                      }}
                    >
                      删除
                    </button>
                  </>
                ) : (
                  <span className="muted">超管组</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {gid > 0 && gid !== 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-hd">授权菜单节点（组 {gid}）</div>
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
            type="button"
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
