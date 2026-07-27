import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, clearToken } from '../api/client';

type SideItem = { to: string; label: string; end?: boolean };
type TopItem = { key: string; label: string; match: (path: string) => boolean; defaultTo: string; side: SideItem[] };

const TOP: TopItem[] = [
  {
    key: 'home',
    label: '概况',
    match: (p) => p === '/' || p === '',
    defaultTo: '/',
    side: [{ to: '/', label: '概况', end: true }],
  },
  {
    key: 'source',
    label: '资源',
    match: (p) =>
      ['/sources', '/categories', '/apilist', '/deposit', '/logs', '/feedback'].some((x) => p === x || p.startsWith(x + '/')),
    defaultTo: '/sources',
    side: [
      { to: '/sources', label: '资源管理' },
      { to: '/categories', label: '分类管理' },
      { to: '/apilist', label: '接口配置' },
      { to: '/deposit', label: '账号管理' },
      { to: '/logs', label: '资源日志' },
      { to: '/feedback', label: '用户需求' },
    ],
  },
  {
    key: 'system',
    label: '系统',
    match: (p) =>
      ['/conf', '/profile', '/password', '/clean', '/admins', '/groups'].some((x) => p === x || p.startsWith(x + '/')),
    defaultTo: '/conf',
    side: [
      { to: '/conf', label: '基础设置' },
      { to: '/admins', label: '管理员' },
      { to: '/groups', label: '用户组' },
    ],
  },
  {
    key: 'config',
    label: '配置',
    match: (p) =>
      ['/attach', '/access-logs', '/conf-params', '/nodes'].some((x) => p === x || p.startsWith(x + '/')),
    defaultTo: '/attach',
    side: [
      { to: '/attach', label: '附件管理' },
      { to: '/conf-params', label: '参数配置' },
      { to: '/nodes', label: '菜单管理' },
      { to: '/access-logs', label: '访问日志' },
    ],
  },
];

export function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const [name, setName] = useState('管理员');
  const [userOpen, setUserOpen] = useState(false);

  useEffect(() => {
    api.get('/admin/admin/getMyInfo').then((j) => {
      if (j.data?.admin_name || j.data?.admin_account) {
        setName(j.data.admin_name || j.data.admin_account);
      }
    });
  }, []);

  const path = loc.pathname;
  const activeTop = useMemo(() => TOP.find((t) => t.match(path)) || TOP[0], [path]);

  const logout = async () => {
    try {
      await api.postForm('/admin/admin/logout', {});
    } catch {
      /* ignore */
    }
    clearToken();
    location.href = '/qfadmin/login';
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="layout yadmin">
      <header className="topbar">
        <nav className="top-nav">
          {TOP.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`top-nav-item ${activeTop.key === t.key ? 'is-active' : ''}`}
              onClick={() => nav(t.defaultTo)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button type="button" className="icon-btn" title="全屏" onClick={toggleFullscreen}>
            ⛶
          </button>
          <div className="user-menu" onBlur={() => setTimeout(() => setUserOpen(false), 150)}>
            <button type="button" className="user-trigger" onClick={() => setUserOpen((v) => !v)}>
              {name} ▾
            </button>
            {userOpen && (
              <div className="user-dropdown">
                <button type="button" onClick={() => { setUserOpen(false); nav('/profile'); }}>
                  修改资料
                </button>
                <button type="button" onClick={() => { setUserOpen(false); nav('/password'); }}>
                  修改密码
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setUserOpen(false);
                    await api.postForm('/admin/system/clean', {});
                    alert('缓存已清理');
                  }}
                >
                  清除缓存
                </button>
                <button type="button" onClick={logout}>
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="body-row">
        <aside className="side">
          <a className="side-logo" href="/qfadmin/" title="概况">
            <span>PS</span>
          </a>
          <nav>
            {activeTop.side.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end || item.to === '/'}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-version">
            资源管理系统
            <br />
            Version 3.6
          </div>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
