import { useEffect, useState } from 'react';
import { api } from '../api/client';

function fmtTime(ts?: number) {
  if (!ts) return '-';
  return new Date(Number(ts) * 1000).toLocaleString();
}

/** 对齐原版 log/index：name / IP / domain / 时间 */
export function AccessLogs() {
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const j = await api.get('/admin/log/getList');
    setItems(j.data?.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="plain sm" onClick={load}>
          刷新
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 70 }}>ID</th>
            <th>name</th>
            <th style={{ width: 140 }}>IP</th>
            <th>address</th>
            <th style={{ width: 170 }}>创建时间</th>
            <th style={{ width: 170 }}>最新时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.id}</td>
              <td>{it.name || '-'}</td>
              <td>{it.ip || '-'}</td>
              <td style={{ wordBreak: 'break-all' }}>{it.domain || '-'}</td>
              <td>{fmtTime(it.create_time)}</td>
              <td>{fmtTime(it.update_time)}</td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#909399' }}>
                暂无访问日志
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
