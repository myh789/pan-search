const TOKEN_KEY = 'eo_access_token';
const $ = (id) => document.getElementById(id);

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, { method = 'GET', form, jsonBody, skipAuthReload = false } = {}) {
  const headers = { access_token: getToken(), plat: 'web', version: '1.0' };
  let body;
  if (form) {
    const fd = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null) fd.set(k, String(v));
    fd.set('access_token', getToken());
    body = fd;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (jsonBody) {
    body = JSON.stringify(jsonBody);
    headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body });
  } catch (e) {
    return { code: 500, message: '网络错误：' + (e?.message || e), data: null };
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return {
      code: 500,
      message: `接口返回非 JSON（HTTP ${res.status}），多半是 /api 未进 Cloud Functions 或 Blob SDK 加载失败`,
      data: { preview: String(text).slice(0, 240) },
    };
  }
  if (!skipAuthReload && data.code === 401) {
    clearToken();
    location.reload();
  }
  return data;
}

function setLoginError(msg) {
  const el = $('loginError');
  if (!el) {
    if (msg) alert(msg);
    return;
  }
  if (!msg) {
    el.textContent = '';
    el.classList.remove('show');
    return;
  }
  el.textContent = msg;
  el.classList.add('show');
}

async function doLogin() {
  const btn = $('loginBtn');
  const account = $('account').value.trim();
  const password = $('password').value;
  setLoginError('');
  if (!password) {
    setLoginError('请输入密码');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = '登录中…';
  }
  try {
    // 用 JSON，避免部分 Cloud Functions 环境 formData 解析异常
    const j = await api('/admin/login', {
      method: 'POST',
      jsonBody: { admin_account: account, admin_password: password },
      skipAuthReload: true,
    });
    if (j.code === 200 && j.data?.access_token) {
      setToken(j.data.access_token);
      showMain();
      return;
    }
    const detail = j.data?.preview ? `\n${j.data.preview}` : '';
    setLoginError((j.message || '登录失败') + detail);
  } catch (e) {
    setLoginError('登录异常：' + (e?.message || e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  }
}
window.__doLogin = doLogin;

function showMain() {
  $('loginView').hidden = true;
  $('mainView').hidden = false;
  window.scrollTo(0, 0);
  loadAll();
}

function showLogin() {
  $('loginView').hidden = false;
  $('mainView').hidden = true;
  window.scrollTo(0, 0);
}

document.querySelectorAll('aside nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('aside nav button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('main section').forEach((s) => {
      s.hidden = s.dataset.panel !== tab;
    });
  });
});

async function loadAll() {
  const j = await api('/admin/conf/getRaw');
  if (j.code !== 200) return;
  const c = j.data || {};
  $('banKeywords').value = c.ban_keywords || '';
  for (const k of [
    'quark_cookie',
    'quark_file',
    'quark_file_time',
    'Authorization',
    'ali_drive_id',
    'baidu_cookie',
    'baidu_file',
    'baidu_file_time',
    'uc_cookie',
    'xunlei_cookie',
    'xunlei_file',
    'xunlei_file_time',
    'temp_source_ttl',
    'app_name',
    'app_subname',
  ]) {
    if ($(k)) $(k).value = c[k] || '';
  }
  $('is_quan_type').value = '0';
  $('is_quan_zc').value = c.is_quan_zc || '0';
  if ($('enable_quark')) $('enable_quark').value = c.enable_quark === '0' ? '0' : '1';
  if ($('enable_baidu')) $('enable_baidu').value = c.enable_baidu === '0' ? '0' : '1';
  if ($('enable_xunlei')) $('enable_xunlei').value = c.enable_xunlei === '0' ? '0' : '1';
  await loadLines();
}

function toast(msg, ms = 2200) {
  const el = $('toast');
  if (!el) {
    alert(msg);
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

async function loadLines() {
  const j = await api('/admin/api_list/getList');
  const box = $('lineList');
  box.innerHTML = '';
  const items = j.data?.items || [];
  if (!items.length) {
    box.innerHTML =
      '<div class="line-empty">暂无线路。可点「导入示例线路」，或自己「新增线路」。</div>';
    return;
  }
  const panLabel = { 0: '夸克', 2: '百度', 4: '迅雷' };
  for (const it of items) {
    const enabled = Number(it.status) === 1;
    const el = document.createElement('article');
    el.className = 'line-item';
    el.innerHTML = `
      <div>
        <h4>${escapeHtml(it.name)}</h4>
        <div class="line-meta">
          <span class="badge">${escapeHtml(panLabel[Number(it.pantype)] || '夸克')}</span>
          <span class="badge">${Number(it.type) === 1 ? '网页' : 'JSON'}</span>
          <span class="badge">权重 ${escapeHtml(it.weight || 0)}</span>
          <span class="badge ${enabled ? 'ok' : 'off'}">${enabled ? '启用' : '停用'}</span>
        </div>
        <div class="line-url">${escapeHtml(it.url || '')}</div>
      </div>`;
    const actions = document.createElement('div');
    actions.className = 'line-actions';
    const edit = document.createElement('button');
    edit.className = 'btn ghost';
    edit.textContent = '编辑';
    edit.onclick = () => openLine(it);
    const tog = document.createElement('button');
    tog.className = 'btn ghost';
    tog.textContent = enabled ? '停用' : '启用';
    tog.onclick = async () => {
      await api('/admin/api_list/toggle', {
        method: 'POST',
        form: { id: it.id, status: enabled ? 0 : 1 },
      });
      loadLines();
    };
    const del = document.createElement('button');
    del.className = 'btn ghost danger-text';
    del.textContent = '删除';
    del.onclick = async () => {
      if (!confirm('确认删除这条线路？')) return;
      await api('/admin/api_list/delete', { method: 'POST', form: { id: it.id } });
      loadLines();
    };
    actions.append(edit, tog, del);
    el.appendChild(actions);
    box.appendChild(el);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openLine(it = null) {
  $('lineDlgTitle').textContent = it ? '编辑线路' : '新增线路';
  $('line_id').value = it?.id || '';
  $('line_pantype').value = String(it?.pantype ?? 0);
  $('line_name').value = it?.name || '';
  $('line_type').value = String(it?.type ?? 0);
  $('line_url').value = it?.url || '';
  $('line_method').value = it?.method || 'GET';
  $('line_fixed').value = it?.fixed_params || '';
  $('line_map').value = it?.field_map || '';
  $('line_count').value = it?.count ?? 10;
  $('line_weight').value = it?.weight ?? 10;
  $('line_status').value = String(it?.status ?? 1);
  const adv = $('lineDlg')?.querySelector('details.adv-box');
  if (adv) adv.open = !!(it && (it.fixed_params || it.field_map || (it.method && it.method !== 'GET')));
  $('lineDlg').showModal();
}

$('lineSave').addEventListener('click', async (e) => {
  e.preventDefault();
  const type = Number($('line_type').value);
  const url = $('line_url').value.trim();
  let fixed = ($('line_fixed').value || '').trim();
  let fmap = ($('line_map').value || '').trim();
  if (!fixed) {
    fixed = type === 1 ? '{}' : '{"keyword":"{keyword}"}';
  }
  if (!fmap) {
    fmap = type === 1 ? '{}' : '{"title":"title","url":"url"}';
  }
  const payload = {
    id: $('line_id').value || undefined,
    name: $('line_name').value.trim(),
    pantype: Number($('line_pantype').value || 0),
    type,
    url,
    method: $('line_method').value || 'GET',
    fixed_params: fixed,
    field_map: fmap,
    count: Number($('line_count').value || 10),
    weight: Number($('line_weight').value || 10),
    status: Number($('line_status').value),
    scene: 0,
  };
  const j = await api('/admin/api_list/save', { method: 'POST', jsonBody: payload });
  toast(j.message || (j.code === 200 ? '已保存' : '保存失败'));
  if (j.code === 200) {
    $('lineDlg').close();
    loadLines();
  }
});

$('addLine').onclick = () => openLine(null);
$('seedQuarkLines')?.addEventListener('click', async () => {
  const j = await api('/admin/api_list/seedQuark', { method: 'POST', jsonBody: {} });
  toast(j.message || (j.code === 200 ? '已导入' : '导入失败'));
  if (j.code === 200) loadLines();
});
$('lineDlgClose')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('lineDlg').close();
});
$('loginBtn').onclick = doLogin;
$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
$('logoutBtn').onclick = async () => {
  await api('/admin/logout', { method: 'POST', form: {} });
  clearToken();
  showLogin();
};
$('saveBan').onclick = async () => {
  const j = await api('/admin/conf/save', { method: 'POST', form: { ban_keywords: $('banKeywords').value } });
  toast(j.message || '已保存');
};
$('saveCookies').onclick = async () => {
  const form = {};
  for (const k of [
    'quark_cookie',
    'quark_file',
    'quark_file_time',
    'Authorization',
    'ali_drive_id',
    'baidu_cookie',
    'baidu_file',
    'baidu_file_time',
    'uc_cookie',
    'xunlei_cookie',
    'xunlei_file',
    'xunlei_file_time',
  ])
    form[k] = $(k)?.value || '';
  const j = await api('/admin/conf/save', { method: 'POST', form });
  toast(j.message || '已保存');
};

const PAN_META = {
  0: {
    name: '夸克',
    cookieId: 'quark_cookie',
    cookieKey: 'quark_cookie',
    hintId: 'quarkLoginHint',
    transfer: 'quark_file',
    temp: 'quark_file_time',
    root: '0',
  },
  2: {
    name: '百度',
    cookieId: 'baidu_cookie',
    cookieKey: 'baidu_cookie',
    hintId: 'baiduLoginHint',
    transfer: 'baidu_file',
    temp: 'baidu_file_time',
    root: '/',
  },
  4: {
    name: '迅雷',
    cookieId: 'xunlei_cookie',
    cookieKey: 'xunlei_cookie',
    hintId: 'xunleiLoginHint',
    transfer: 'xunlei_file',
    temp: 'xunlei_file_time',
    root: '',
  },
};

let folderState = {
  pantype: 0,
  pdir: '0',
  stack: [{ fid: '0', name: '根目录' }],
  pickTarget: '',
};

function panMeta(pantype) {
  return PAN_META[Number(pantype)] || PAN_META[0];
}

function panCookieValue(pantype) {
  const m = panMeta(pantype);
  return ($(m.cookieId)?.value || '').trim();
}

function setPanHint(pantype, msg, ok) {
  const el = $(panMeta(pantype).hintId);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('ok', !!ok);
  el.classList.toggle('err', !!msg && !ok);
}

async function loadPanFolders(pdir) {
  const pantype = folderState.pantype;
  const meta = panMeta(pantype);
  const cookie = panCookieValue(pantype);
  if (!cookie) {
    toast(`请先填写${meta.name}凭证`);
    return;
  }
  const box = $('folderList');
  if (!box) return;
  box.innerHTML = '<div class="folder-empty">加载中…</div>';
  const body = { pantype, pdir_fid: pdir };
  body[meta.cookieKey] = cookie;
  const j = await api('/admin/deposit/folders', { method: 'POST', jsonBody: body });
  if (j.code !== 200) {
    box.innerHTML = `<div class="folder-empty">${escapeHtml(j.message || '加载失败')}</div>`;
    toast(j.message || '加载失败');
    return;
  }
  const items = j.data?.items || [];
  folderState.pdir = j.data?.pdir_fid ?? pdir;
  if ($('folderCurrentFid')) $('folderCurrentFid').textContent = folderState.pdir || meta.root || '根';
  if ($('folderPath')) $('folderPath').textContent = folderState.stack.map((x) => x.name).join(' / ');
  if (!items.length) {
    box.innerHTML =
      '<div class="folder-empty">当前目录下没有子文件夹。可直接把「当前目录」设为转存/临时目录。</div>';
    return;
  }
  box.innerHTML = '';
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-item';
    btn.innerHTML = `<div><strong>${escapeHtml(it.name)}</strong><div><span>${escapeHtml(
      it.fid
    )}</span></div></div><span>进入 →</span>`;
    btn.onclick = () => {
      folderState.stack.push({ fid: it.fid, name: it.name });
      loadPanFolders(it.fid);
    };
    box.appendChild(btn);
  }
}

function openFolderPicker(pickTarget = '', pantype = 0) {
  const meta = panMeta(pantype);
  folderState.pantype = Number(pantype);
  folderState.pickTarget = pickTarget || '';
  folderState.stack = [{ fid: meta.root, name: '根目录' }];
  const title = $('folderDlgTitle');
  const lead = $('folderDlgLead');
  const isTemp = pickTarget === meta.temp;
  const isTransfer = pickTarget === meta.transfer;
  if (isTransfer) {
    if (title) title.textContent = `选择${meta.name}转存目录`;
    if (lead) lead.textContent = '进入目标文件夹后，点「使用当前目录」填入。';
  } else if (isTemp) {
    if (title) title.textContent = `选择${meta.name}临时目录`;
    if (lead) lead.textContent = '建议单独建一个临时文件夹，到期后会从该目录清理转存文件。';
  } else {
    if (title) title.textContent = `浏览${meta.name}文件夹`;
    if (lead) lead.textContent = '可进入子目录；再选择设为转存或临时目录。';
  }
  const one = !!pickTarget;
  if ($('pickAsTransfer')) $('pickAsTransfer').hidden = one && !isTransfer;
  if ($('pickAsTemp')) $('pickAsTemp').hidden = one && !isTemp;
  if ($('pickCurrent')) {
    $('pickCurrent').hidden = !one;
    $('pickCurrent').textContent = isTemp ? '使用当前目录（临时）' : '使用当前目录（转存）';
  }
  $('folderDlg').showModal();
  loadPanFolders(meta.root);
}

function applyFolderPick(asTemp) {
  const meta = panMeta(folderState.pantype);
  const fid = folderState.pdir ?? meta.root;
  let target = folderState.pickTarget;
  if (!target) target = asTemp ? meta.temp : meta.transfer;
  if ($(target)) $(target).value = fid;
  toast(target === meta.temp ? `已填入临时目录：${fid}` : `已填入转存目录：${fid}`);
  $('folderDlg').close();
}

async function testPanLogin(pantype, btnId) {
  const meta = panMeta(pantype);
  const cookie = panCookieValue(pantype);
  if (!cookie) {
    setPanHint(pantype, '请先填写凭证', false);
    toast(`请先填写${meta.name}凭证`);
    return false;
  }
  setPanHint(pantype, '检测中…', true);
  const btn = $(btnId);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '检测中…';
  }
  try {
    const body = { pantype: Number(pantype) };
    body[meta.cookieKey] = cookie;
    const j = await api('/admin/deposit/test', { method: 'POST', jsonBody: body });
    const ok = j.code === 200;
    setPanHint(pantype, j.message || (ok ? '登录成功' : '登录失败'), ok);
    toast(j.message || (ok ? '登录成功' : '登录失败'));
    return ok;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '测试登录';
    }
  }
}

$('testQuarkLogin').onclick = () => testPanLogin(0, 'testQuarkLogin');
$('browseQuarkFolders').onclick = async () => {
  if (await testPanLogin(0, 'testQuarkLogin')) openFolderPicker('', 0);
};
$('testBaiduLogin')?.addEventListener('click', () => testPanLogin(2, 'testBaiduLogin'));
$('browseBaiduFolders')?.addEventListener('click', async () => {
  if (await testPanLogin(2, 'testBaiduLogin')) openFolderPicker('', 2);
});
$('testXunleiLogin')?.addEventListener('click', () => testPanLogin(4, 'testXunleiLogin'));
$('browseXunleiFolders')?.addEventListener('click', async () => {
  if (await testPanLogin(4, 'testXunleiLogin')) openFolderPicker('', 4);
});
document.querySelectorAll('[data-pick]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const pantype = Number(btn.getAttribute('data-pantype') || 0);
    const meta = panMeta(pantype);
    if (!panCookieValue(pantype)) {
      toast(`请先填写${meta.name}凭证`);
      return;
    }
    openFolderPicker(btn.getAttribute('data-pick') || '', pantype);
  });
});
$('folderDlgClose').onclick = () => $('folderDlg').close();
$('folderRoot').onclick = () => {
  const meta = panMeta(folderState.pantype);
  folderState.stack = [{ fid: meta.root, name: '根目录' }];
  loadPanFolders(meta.root);
};
$('folderUp').onclick = () => {
  if (folderState.stack.length > 1) folderState.stack.pop();
  const cur = folderState.stack[folderState.stack.length - 1];
  loadPanFolders(cur.fid);
};
$('folderRefresh').onclick = () => {
  const meta = panMeta(folderState.pantype);
  loadPanFolders(folderState.pdir ?? meta.root);
};
$('pickAsTransfer').onclick = () => applyFolderPick(false);
$('pickAsTemp').onclick = () => applyFolderPick(true);
$('pickCurrent')?.addEventListener('click', () => {
  const meta = panMeta(folderState.pantype);
  applyFolderPick(folderState.pickTarget === meta.temp);
});
$('testQuark')?.addEventListener('click', () => testPanLogin(0, 'testQuarkLogin'));

$('saveMisc').onclick = async () => {
  const enable_quark = $('enable_quark')?.value || '1';
  const enable_baidu = $('enable_baidu')?.value || '1';
  const enable_xunlei = $('enable_xunlei')?.value || '1';
  if (enable_quark === '0' && enable_baidu === '0' && enable_xunlei === '0') {
    toast('至少开启一个网盘平台');
    return;
  }
  const j = await api('/admin/conf/save', {
    method: 'POST',
    form: {
      is_quan_type: '0',
      is_quan_zc: $('is_quan_zc').value,
      temp_source_ttl: $('temp_source_ttl').value,
      enable_quark,
      enable_baidu,
      enable_xunlei,
      app_name: $('app_name').value,
      app_subname: $('app_subname').value,
      is_quan: '1',
    },
  });
  toast(j.message || '已保存');
};
$('runCleanup').onclick = async () => {
  const j = await api('/admin/system/cleanup', { method: 'POST', form: {} });
  toast(j.message || '清理完成', 3200);
};

window.__adminReady = true;
if (getToken()) showMain();
else showLogin();
