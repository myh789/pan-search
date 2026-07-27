import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** 菜单管理：节点列表（对齐原版 node/index 浏览；改授权请用「用户组」） */
export function Nodes() {
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const j = await api.get('/admin/node/getList');
    setItems(j.data?.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  const byPid = (pid: number) => items.filter((n) => Number(n.node_pid) === pid);

  const walk = (pid: number, depth: number): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    for (const n of byPid(pid)) {
      out.push(
        <tr key={n.node_id}>
          <td>{n.node_id}</td>
          <td style={{ paddingLeft: 8 + depth * 18 }}>
            {depth > 0 ? '└ ' : ''}
            {n.node_title}
          </td>
          <td>{[n.node_module, n.node_controller, n.node_action].filter(Boolean).join('/') || '-'}</td>
          <td>{n.node_order}</td>
          <td>{Number(n.node_show) === 1 ? '显示' : '隐藏'}</td>
          <td>
            <span className={`tag ${Number(n.node_status) === 0 ? 'ok' : 'warn'}`}>
              {Number(n.node_status) === 0 ? '正常' : '禁用'}
            </span>
          </td>
        </tr>
      );
      out.push(...walk(Number(n.node_id), depth + 1));
    }
    return out;
  };

  return (
    <div>
      <div className="toolbar">
        <span className="tips">菜单节点来自数据库；细粒度授权请在「系统 → 用户组」中勾选。</span>
        <span className="spacer" />
        <button type="button" className="plain sm" onClick={load}>
          刷新
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 70 }}>ID</th>
            <th>节点名称</th>
            <th>路由</th>
            <th style={{ width: 70 }}>排序</th>
            <th style={{ width: 70 }}>显示</th>
            <th style={{ width: 70 }}>状态</th>
          </tr>
        </thead>
        <tbody>
          {walk(0, 0)}
          {!items.length && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#909399' }}>
                暂无菜单节点
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
