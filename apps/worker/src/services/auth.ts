import type { Env } from '../env';
import { encodePassword, nowSec, randString } from '../utils';

export async function createCaptcha(env: Env) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const token = randString(24);
  await env.DB.prepare('INSERT INTO captcha (token, code, expires) VALUES (?, ?, ?)')
    .bind(token, code, nowSec() + 300)
    .run();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="100%" height="100%" fill="#1a2332"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#3d8bfd" font-size="22" font-family="monospace">${code}</text></svg>`;
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return { token, image: `data:image/svg+xml;base64,${btoa(bin)}` };
}

export async function verifyCaptcha(env: Env, token: string, code: string) {
  const row = await env.DB.prepare('SELECT * FROM captcha WHERE token = ?').bind(token).first<{
    code: string;
    expires: number;
  }>();
  await env.DB.prepare('DELETE FROM captcha WHERE token = ?').bind(token).run();
  if (!row || row.expires < nowSec()) return false;
  return String(row.code).toLowerCase() === String(code).toLowerCase();
}

export async function loginAdmin(
  env: Env,
  account: string,
  password: string,
  plat: string,
  ip: string
) {
  const admin = await env.DB.prepare('SELECT * FROM admin WHERE admin_account = ?').bind(account).first<any>();
  if (!admin) return { ok: false as const, message: '账号或密码错误' };
  if (admin.admin_status === 1) return { ok: false as const, message: '账号已禁用' };
  const hash = await encodePassword(password, admin.admin_salt);
  if (hash !== admin.admin_password) return { ok: false as const, message: '账号或密码错误' };
  const group = await env.DB.prepare('SELECT * FROM groups WHERE group_id = ?').bind(admin.admin_group).first<any>();
  if (group && group.group_status === 1) return { ok: false as const, message: '用户组已禁用' };
  const token = randString(48);
  await env.DB.prepare(
    'INSERT INTO access (access_admin, access_token, access_plat, access_ip, access_status, access_createtime, access_updatetime) VALUES (?, ?, ?, ?, 0, ?, ?)'
  )
    .bind(admin.admin_id, token, plat || 'web', ip, nowSec(), nowSec())
    .run();
  return {
    ok: true as const,
    data: {
      access_token: token,
      admin_id: admin.admin_id,
      admin_name: admin.admin_name,
      admin_account: admin.admin_account,
      admin_group: admin.admin_group,
    },
  };
}

export async function resolveAccess(env: Env, token?: string | null) {
  if (!token) return null;
  const access = await env.DB.prepare(
    'SELECT a.*, ad.admin_group, ad.admin_status, ad.admin_name, ad.admin_account FROM access a JOIN admin ad ON a.access_admin = ad.admin_id WHERE a.access_token = ? AND a.access_status = 0'
  )
    .bind(token)
    .first<any>();
  if (!access) return null;
  if (access.admin_status === 1) return null;
  await env.DB.prepare('UPDATE access SET access_updatetime = ? WHERE access_id = ?')
    .bind(nowSec(), access.access_id)
    .run();
  return access;
}

export async function getMenuForAdmin(env: Env, adminGroup: number) {
  const nodes = await env.DB.prepare(
    'SELECT * FROM node WHERE node_status = 0 AND node_show = 1 ORDER BY node_order DESC, node_id ASC'
  ).all<any>();
  if (adminGroup === 1) return nodes.results || [];
  const auths = await env.DB.prepare('SELECT auth_node FROM auth WHERE auth_group = ? AND auth_status = 0')
    .bind(adminGroup)
    .all<{ auth_node: number }>();
  const allow = new Set((auths.results || []).map((a) => a.auth_node));
  return (nodes.results || []).filter((n) => allow.has(n.node_id) || allow.has(n.node_pid));
}

export async function assertNodeAccess(
  env: Env,
  adminGroup: number,
  controller: string,
  action: string
): Promise<boolean> {
  if (adminGroup === 1) return true;
  const node = await env.DB.prepare(
    'SELECT node_id FROM node WHERE node_module = ? AND node_controller = ? AND (node_action = ? OR node_action = "") LIMIT 1'
  )
    .bind('qfadmin', controller, action)
    .first<{ node_id: number }>();
  if (!node) return true; // no matching node → allow like APIs without menu
  const auth = await env.DB.prepare(
    'SELECT auth_id FROM auth WHERE auth_group = ? AND auth_node = ? AND auth_status = 0'
  )
    .bind(adminGroup, node.node_id)
    .first();
  return !!auth;
}
