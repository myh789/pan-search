import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api/client';

const ADMIN_NAME_KEY = 'ps_admin_name';

export function Dashboard() {
  const [name, setName] = useState(() => localStorage.getItem(ADMIN_NAME_KEY) || '管理员');
  const [stats, setStats] = useState({ sources: 0, lines: 0, feedback: 0 });

  useEffect(() => {
    (async () => {
      // 单次 KV 缓存统计，不再打三次列表 COUNT
      const j = await api.get('/admin/system/stats');
      if (j.code === 200 && j.data) {
        setStats({
          sources: j.data.sources || 0,
          lines: j.data.lines || 0,
          feedback: j.data.feedback || 0,
        });
      }
      const cached = localStorage.getItem(ADMIN_NAME_KEY);
      if (cached) setName(cached);
      else {
        const me = await api.get('/admin/admin/getMyInfo');
        const n = me.data?.admin_name || me.data?.admin_account;
        if (n) {
          localStorage.setItem(ADMIN_NAME_KEY, n);
          setName(n);
        }
      }
    })();
  }, []);

  return (
    <div className="home-dash">
      <div className="home-hero">
        <div className="home-logo">PS</div>
        <p className="home-brand">@资源管理系统</p>
        <p className="muted">欢迎，{name}</p>
      </div>

      <div className="row home-stats">
        <Link className="stat-card" to="/sources">
          <div className="muted">资源数</div>
          <strong>{stats.sources}</strong>
        </Link>
        <Link className="stat-card" to="/apilist">
          <div className="muted">搜索线路</div>
          <strong>{stats.lines}</strong>
        </Link>
        <Link className="stat-card" to="/feedback">
          <div className="muted">用户需求</div>
          <strong>{stats.feedback}</strong>
        </Link>
      </div>
    </div>
  );
}

/** multipart upload helper for R2 */
export async function uploadImageFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/admin/attach/uploadImage', {
    method: 'POST',
    headers: { access_token: getToken(), plat: 'web', version: '1.0' },
    body: fd,
  });
  return res.json();
}
