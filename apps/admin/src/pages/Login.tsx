import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api/client';

export function Login() {
  const nav = useNavigate();
  const [account, setAccount] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [captcha, setCaptcha] = useState('');
  const [cap, setCap] = useState<{ token: string; image: string } | null>(null);
  const [err, setErr] = useState('');

  const loadCap = async () => {
    const j = await api.get('/admin/system/getCaptcha');
    setCap(j.data);
  };

  useEffect(() => {
    loadCap();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const j = await api.postForm('/admin/admin/login', {
      admin_account: account,
      admin_password: password,
      captcha,
      captcha_token: cap?.token,
      plat: 'web',
    });
    if (j.code !== 200) {
      setErr(j.message || '登录失败');
      loadCap();
      return;
    }
    setToken(j.data.access_token);
    nav('/');
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h2>管理后台登录</h2>
        <div className="field">
          <label>账号</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="field">
          <label>密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>验证码</label>
          <div className="captcha">
            <input value={captcha} onChange={(e) => setCaptcha(e.target.value)} />
            {cap && <img src={cap.image} alt="captcha" onClick={loadCap} title="点击刷新" />}
          </div>
        </div>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        <button style={{ width: '100%' }}>登录</button>
        <p className="muted" style={{ marginTop: 12 }}>
          默认账号 admin / Admin123!
        </p>
      </form>
    </div>
  );
}
