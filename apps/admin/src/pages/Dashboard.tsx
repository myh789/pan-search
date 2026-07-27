import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api/client';

export function Dashboard() {
  const [info, setInfo] = useState<any>(null);
  const [stats, setStats] = useState({ sources: 0, lines: 0, feedback: 0 });

  useEffect(() => {
    (async () => {
      const me = await api.get('/admin/admin/getMyInfo');
      setInfo(me.data);
      const s = await api.get('/admin/source/getList?page=1&page_size=1');
      const a = await api.get('/admin/api_list/getList');
      const f = await api.get('/admin/feedback/getList?page=1&page_size=1');
      setStats({
        sources: s.data?.total || 0,
        lines: a.data?.items?.length || 0,
        feedback: f.data?.total || f.data?.items?.length || 0,
      });
    })();
  }, []);

  return (
    <div className="home-dash">
      <div className="home-hero">
        <div className="home-logo">PS</div>
        <p className="home-brand">@资源管理系统</p>
        <p className="muted">
          欢迎，{info?.admin_name || info?.admin_account || '管理员'}
        </p>
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
