import { useEffect, useState } from 'react';
import { api } from '../api/client';

function fmtTime(ts?: number) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

export function Logs() {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  const load = async () => {
    const j = await api.get('/admin/source_log/getList');
    setItems(j.data?.items || []);
    setSelected([]);
  };

  useEffect(() => {
    load();
  }, []);

  const del = async (ids: number[]) => {
    if (!ids.length) return alert('未选择日志');
    if (!confirm(`确认删除 ${ids.length} 条日志？`)) return;
    const j = await api.postForm('/admin/source_log/delete', { ids: ids.join(',') });
    alert(j.message);
    if (j.code === 200) load();
  };

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="plain sm" onClick={() => del(selected)}>
          批量删除
        </button>
        <button type="button" className="plain sm" onClick={load}>
          刷新
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>
              <input
                type="checkbox"
                checked={items.length > 0 && selected.length === items.length}
                onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.source_log_id) : [])}
              />
            </th>
            <th>任务名称</th>
            <th style={{ textAlign: 'center' }}>转存/导入总数</th>
            <th style={{ textAlign: 'center' }}>新增数</th>
            <th style={{ textAlign: 'center' }}>重复跳过</th>
            <th style={{ textAlign: 'center' }}>失败数</th>
            <th style={{ textAlign: 'center' }}>最新错误信息</th>
            <th style={{ textAlign: 'center' }}>状态</th>
            <th style={{ width: 200, textAlign: 'center' }}>时间</th>
            <th style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.source_log_id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(it.source_log_id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, it.source_log_id] : s.filter((x) => x !== it.source_log_id)
                    )
                  }
                />
              </td>
              <td>{it.name}</td>
              <td style={{ textAlign: 'center' }}>{it.total_num}</td>
              <td style={{ textAlign: 'center' }}>{it.new_num}</td>
              <td style={{ textAlign: 'center' }}>{it.skip_num}</td>
              <td style={{ textAlign: 'center' }}>{it.fail_num}</td>
              <td style={{ textAlign: 'center', maxWidth: 200, wordBreak: 'break-all' }}>{it.fail_dec || '-'}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={`tag ${it.end_time ? 'ok' : 'warn'}`}>{it.end_time ? '已完成' : '转存中'}</span>
              </td>
              <td style={{ textAlign: 'center', fontSize: 12 }}>
                <div>开始：{fmtTime(it.create_time)}</div>
                {it.end_time ? <div>结束：{fmtTime(it.end_time)}</div> : null}
              </td>
              <td>
                <button type="button" className="link-btn danger-text" onClick={() => del([it.source_log_id])}>
                  删除
                </button>
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={10} style={{ textAlign: 'center', color: '#909399' }}>
                暂无日志
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
