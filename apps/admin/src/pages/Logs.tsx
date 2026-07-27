import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Logs() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api.get('/admin/source_log/getList').then((j) => setItems(j.data?.items || []));
  }, []);
  return (
    <div>
      <h2>资源日志</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>任务</th>
              <th>总数</th>
              <th>新增</th>
              <th>跳过</th>
              <th>失败</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.source_log_id}>
                <td>{it.source_log_id}</td>
                <td>{it.name}</td>
                <td>{it.total_num}</td>
                <td>{it.new_num}</td>
                <td>{it.skip_num}</td>
                <td>{it.fail_num}</td>
                <td>{it.fail_dec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Feedback() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api.get('/admin/feedback/getList').then((j) => setItems(j.data?.items || []));
  }, []);
  return (
    <div>
      <h2>用户需求</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>内容</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.id}</td>
                <td>{it.content}</td>
                <td>{it.create_time ? new Date(it.create_time * 1000).toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
