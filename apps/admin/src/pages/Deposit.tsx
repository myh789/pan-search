import { useEffect, useState } from 'react';
import { api } from '../api/client';

const tabs = [
  {
    key: '0',
    label: '夸克网盘',
    root: '0',
    fields: [
      ['quark_cookie', '设置 cookie', true],
      ['quark_file', '默认转存目录', false],
      ['quark_file_time', '临时资源目录', false],
    ] as const,
  },
  {
    key: '1',
    label: '阿里云盘',
    root: 'root',
    fields: [
      ['Authorization', '设置 Token', true],
      ['ali_drive_id', 'drive_id', false],
      ['ali_file', '默认转存目录', false],
      ['ali_file_time', '临时资源目录', false],
    ] as const,
    tip: '转存目录不能为空；阿里网盘禁止香港及海外服务器调用分享接口',
  },
  {
    key: '2',
    label: '百度网盘',
    root: '/',
    fields: [
      ['baidu_cookie', '设置 cookie', true],
      ['baidu_file', '默认转存目录', false],
      ['baidu_file_time', '临时资源目录', false],
    ] as const,
  },
  {
    key: '3',
    label: 'UC网盘',
    root: '0',
    fields: [
      ['uc_cookie', '设置 cookie', true],
      ['uc_file', '默认转存目录', false],
      ['uc_file_time', '临时资源目录', false],
    ] as const,
  },
  {
    key: '4',
    label: '迅雷云盘',
    root: '',
    fields: [
      ['xunlei_cookie', '设置 refresh_token', true],
      ['xunlei_file', '默认转存目录', false],
      ['xunlei_file_time', '临时资源目录', false],
    ] as const,
  },
] as const;

const fidKey: Record<string, string> = {
  '0': 'quark_file',
  '1': 'ali_file',
  '2': 'baidu_file',
  '3': 'uc_file',
  '4': 'xunlei_file',
};

function rootOf(tab: string) {
  const t = tabs.find((x) => x.key === tab)!;
  return t.root === '' ? '0' : t.root;
}

export function Deposit() {
  const [conf, setConf] = useState<Record<string, string>>({});
  const [tab, setTab] = useState('0');
  const [files, setFiles] = useState<any[]>([]);
  const [pdir, setPdir] = useState('0');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const cur = tabs.find((t) => t.key === tab)!;

  useEffect(() => {
    api.get('/admin/conf/getBaseConfig').then((j) => {
      const map: Record<string, string> = {};
      for (const row of j.data || []) map[row.conf_key] = row.conf_value || '';
      setConf(map);
    });
  }, []);

  const switchTab = (key: string) => {
    setTab(key);
    setFiles([]);
    setHint('');
    setPdir(rootOf(key));
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      for (const t of tabs) for (const [k] of t.fields) payload[k] = conf[k] || '';
      const j = await api.postJson('/admin/conf/updateBaseConfig', payload);
      alert(j.message || '保存成功');
    } finally {
      setBusy(false);
    }
  };

  /** 拉取并展示目录（账号检测 / 加载共用） */
  const fetchDirs = async (dir?: string, opts?: { silentOk?: boolean }) => {
    const target = dir ?? rootOf(tab);
    setBusy(true);
    setHint('');
    try {
      const j = await api.get(`/admin/source/getFiles?type=${tab}&pdir_fid=${encodeURIComponent(target)}`);
      if (j.code !== 200) {
        setFiles([]);
        setHint(j.message || '加载失败');
        alert(j.message || '加载失败');
        return false;
      }
      const list = Array.isArray(j.data) ? j.data : [];
      setFiles(list);
      setPdir(target);
      if (!list.length) {
        setHint('账号可用，但当前目录为空。可换目录，或确认 Cookie 对应账号下确有文件夹。');
        if (!opts?.silentOk) alert('账号可用，但当前目录为空');
      } else if (!opts?.silentOk) {
        alert(`已登录，共 ${list.length} 项（文件夹已排在前面）`);
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const checkAccount = () => fetchDirs(rootOf(tab));
  const loadFiles = (dir = pdir) => fetchDirs(dir, { silentOk: true });

  const pickFid = (fid: string, asTemp = false) => {
    const key = asTemp ? fidKey[tab]?.replace('_file', '_file_time') || fidKey[tab] : fidKey[tab];
    if (!key) return;
    setConf({ ...conf, [key]: fid });
  };

  return (
    <div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'active' : ''} onClick={() => switchTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-hd">{cur.label}</div>
        {cur.fields.map(([k, label, tall]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <div className="input-with-btn">
              {tall ? (
                <textarea
                  rows={3}
                  value={conf[k] || ''}
                  onChange={(e) => setConf({ ...conf, [k]: e.target.value })}
                  placeholder="请输入"
                />
              ) : (
                <input
                  value={conf[k] || ''}
                  onChange={(e) => setConf({ ...conf, [k]: e.target.value })}
                  placeholder="请输入或从下方选择"
                />
              )}
              {k.includes('cookie') || k === 'Authorization' || k === 'xunlei_cookie' ? (
                <button type="button" className="plain" disabled={busy} onClick={checkAccount}>
                  {busy ? '检测中…' : '账号检测'}
                </button>
              ) : null}
            </div>
            {(k.includes('cookie') || k === 'Authorization' || k === 'xunlei_cookie') && (
              <p className="tips">修改后请先保存，再点「账号检测」（会自动加载下方目录列表）</p>
            )}
          </div>
        ))}
        {'tip' in cur && cur.tip ? (
          <p className="tips">
            <em>{cur.tip}</em>
          </p>
        ) : null}
        <button type="button" disabled={busy} onClick={save}>
          保存
        </button>
      </div>

      <div className="card">
        <div className="card-hd">
          浏览网盘目录（点「选用」填入上方目录）
          {files.length ? <span className="muted"> · 当前 {files.length} 项</span> : null}
        </div>
        <div className="row">
          <input
            style={{ maxWidth: 220 }}
            value={pdir}
            onChange={(e) => setPdir(e.target.value)}
            placeholder={tab === '1' ? 'root' : tab === '2' ? '/' : '父目录 fid'}
          />
          <button type="button" className="plain" disabled={busy} onClick={() => loadFiles(pdir)}>
            {busy ? '加载中…' : '加载'}
          </button>
          <button type="button" className="plain" disabled={busy} onClick={() => loadFiles(rootOf(tab))}>
            回到根目录
          </button>
        </div>
        {hint ? <p className="tips">{hint}</p> : null}
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>ID</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, i) => {
              const name = f._name || f.file_name || f.server_filename || f.name || '-';
              const fid = String(f._id || f.fid || f.fs_id || f.id || f.file_id || f.path || '');
              const isDir = f._is_dir;
              return (
                <tr key={fid || i}>
                  <td>
                    {isDir ? '📁 ' : '📄 '}
                    {name}
                  </td>
                  <td style={{ wordBreak: 'break-all' }}>{fid}</td>
                  <td>
                    {isDir && (
                      <button type="button" className="link-btn" onClick={() => loadFiles(fid)}>
                        进入
                      </button>
                    )}
                    <button type="button" className="link-btn success" onClick={() => pickFid(fid, false)}>
                      选用默认
                    </button>
                    <button type="button" className="link-btn" onClick={() => pickFid(fid, true)}>
                      选用临时
                    </button>
                  </td>
                </tr>
              );
            })}
            {!files.length && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: '#909399' }}>
                  {busy ? '正在加载目录…' : '暂无目录。请先保存 Cookie，再点上方「账号检测」或「加载」'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
