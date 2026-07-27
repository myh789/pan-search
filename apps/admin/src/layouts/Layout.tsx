import { NavLink, Outlet } from 'react-router-dom';
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
  return (
    <div className="layout">
      <aside className="side">
        <h1>PanSearch</h1>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {label}
          </NavLink>
        ))}
        <button
          className="ghost"
          style={{ margin: '16px 12px', width: 'calc(100% - 24px)' }}
          onClick={async () => {
            try {
              await api.postForm('/admin/admin/logout', {});
            } catch {
              /* ignore */
            }
            clearToken();
            location.href = '/qfadmin/login';
          }}
        >
          退出登录
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
