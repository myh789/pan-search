import { useEffect, useState } from 'react';
import { api, getToken } from '../api/client';

export function Dashboard() {
  const [info, setInfo] = useState<any>(null);
  const [stats, setStats] = useState({ sources: 0, lines: 0, feedback: 0 });
  const [pwd, setPwd] = useState({ old_password: '', new_password: '' });

  useEffect(() => {
    (async () => {
      const me = await api.get('/admin/admin/getMyInfo');
      setInfo(me.data);
      const s = await api.get('/admin/source/getList?page=1&page_size=1');
      const a = await api.get('/admin/api_list/getList');
      const f = await api.get('/admin/feedback/getList');
      setStats({
        sources: s.data?.total || 0,
        lines: a.data?.items?.length || 0,
        feedback: f.data?.items?.length || 0,
      });
    })();
  }, []);

  return (
    <div>
      <h2>概况</h2>
      <div className="card">
        <p>
          欢迎，{info?.admin_name || info?.admin_account}（组 {info?.admin_group}）
        </p>
        <div className="row">
          <div className="card" style={{ flex: 1 }}>
            <div className="muted">资源数</div>
            <strong style={{ fontSize: '1.6rem' }}>{stats.sources}</strong>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="muted">搜索线路</div>
            <strong style={{ fontSize: '1.6rem' }}>{stats.lines}</strong>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="muted">用户需求</div>
            <strong style={{ fontSize: '1.6rem' }}>{stats.feedback}</strong>
          </div>
        </div>
        <div className="row">
          <button
            onClick={async () => {
              await api.postForm('/admin/system/clean', {});
              alert('缓存已清理');
            }}
          >
            清理缓存
          </button>
          <a href="/" target="_blank" rel="noreferrer">
            打开前台
          </a>
          <a href="/health" target="_blank" rel="noreferrer">
            健康检查
          </a>
        </div>
      </div>

      <div className="card">
        <h3>修改密码</h3>
        <div className="row">
          <input
            type="password"
            placeholder="原密码"
            value={pwd.old_password}
            onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })}
            style={{ maxWidth: 200 }}
          />
          <input
            type="password"
            placeholder="新密码"
            value={pwd.new_password}
            onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
            style={{ maxWidth: 200 }}
          />
          <button
            onClick={async () => {
              const j = await api.postForm('/admin/admin/motifyPassword', pwd);
              alert(j.message);
              if (j.code === 200) setPwd({ old_password: '', new_password: '' });
            }}
          >
            保存密码
          </button>
        </div>
        <p className="muted">上线后请立即修改默认密码，并在「基础设置」中修改 api_key。</p>
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
