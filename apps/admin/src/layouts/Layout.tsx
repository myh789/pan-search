import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, clearToken } from '../api/client';

const links = [
  ['/', '概况'],
  ['/sources', '资源管理'],
  ['/categories', '分类管理'],
  ['/apilist', '接口配置'],
  ['/deposit', '账号管理'],
  ['/conf', '基础设置'],
  ['/attach', '附件管理'],
  ['/logs', '资源日志'],
  ['/feedback', '用户需求'],
  ['/admins', '管理员'],
  ['/groups', '用户组'],
] as const;

export function Layout() {
  const loc = useLocation();
  const logout = async () => {
    try {
      await api.postForm('/admin/admin/logout', {});
    } catch {
      /* ignore */
    }
    clearToken();
    location.href = '/qfadmin/login';
  };

  const title =
    links.find(([to]) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to)))?.[1] || '资源管理系统';

  return (
    <div className="layout">
      <header className="topbar">
        <nav className="top-nav">
          {links.slice(0, 6).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <span className="muted">{title}</span>
          <button type="button" className="linkish" onClick={() => (location.href = '/qfadmin/')}>
            概况
          </button>
          <button type="button" className="linkish" onClick={() => api.postForm('/admin/system/clean', {}).then(() => alert('缓存已清理'))}>
            清除缓存
          </button>
          <button type="button" className="linkish" onClick={logout}>
            退出登录
          </button>
        </div>
      </header>
      <div className="body-row">
        <aside className="side">
          <a className="side-logo" href="/qfadmin/">
            <span>PS</span>
          </a>
          <nav>
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="side-version">
            资源管理系统
            <br />
            Version 3.6 CF
          </div>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
