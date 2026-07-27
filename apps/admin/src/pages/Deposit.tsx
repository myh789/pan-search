import { useEffect, useState } from 'react';
import { api } from '../api/client';

const fields = [
  ['quark_cookie', '夸克 Cookie'],
  ['quark_file', '夸克默认目录 fid'],
  ['quark_file_time', '夸克临时目录 fid'],
  ['baidu_cookie', '百度 Cookie'],
  ['baidu_file', '百度默认目录'],
  ['baidu_file_time', '百度临时目录'],
  ['uc_cookie', 'UC Cookie'],
  ['uc_file', 'UC默认目录'],
  ['uc_file_time', 'UC临时目录'],
  ['xunlei_cookie', '迅雷 refresh_token'],
  ['xunlei_file', '迅雷默认目录'],
  ['xunlei_file_time', '迅雷临时目录'],
  ['Authorization', '阿里 Authorization'],
  ['ali_drive_id', '阿里 drive_id'],
  ['ali_file', '阿里默认目录'],
  ['ali_file_time', '阿里临时目录'],
] as const;

export function Deposit() {
  const [conf, setConf] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<any[]>([]);
  const [panType, setPanType] = useState(0);
  const [pdir, setPdir] = useState('0');

  useEffect(() => {
    api.get('/admin/conf/getBaseConfig').then((j) => {
      const map: Record<string, string> = {};
      for (const row of j.data || []) map[row.conf_key] = row.conf_value || '';
      setConf(map);
    });
  }, []);

  const save = async () => {
    const payload: Record<string, string> = {};
    for (const [k] of fields) payload[k] = conf[k] || '';
    const j = await api.postJson('/admin/conf/updateBaseConfig', payload);
    alert(j.message);
  };

  const loadFiles = async () => {
    const j = await api.get(`/admin/source/getFiles?type=${panType}&pdir_fid=${encodeURIComponent(pdir)}`);
    if (j.code !== 200) return alert(j.message);
    setFiles(j.data || []);
  };

  return (
    <div>
      <h2>账号管理</h2>
      <div className="card">
        {fields.map(([k, label]) => (
          <div className="field" key={k}>
            <label>{label}</label>
            <textarea
              rows={k.includes('cookie') || k === 'Authorization' ? 3 : 1}
              value={conf[k] || ''}
              onChange={(e) => setConf({ ...conf, [k]: e.target.value })}
            />
          </div>
        ))}
        <button onClick={save}>保存账号配置</button>
      </div>
      <div className="card">
        <h3>浏览网盘目录</h3>
        <div className="row">
          <select value={panType} onChange={(e) => setPanType(Number(e.target.value))} style={{ maxWidth: 140 }}>
            <option value={0}>夸克</option>
            <option value={1}>阿里</option>
            <option value={2}>百度</option>
            <option value={3}>UC</option>
            <option value={4}>迅雷</option>
          </select>
          <input style={{ maxWidth: 220 }} value={pdir} onChange={(e) => setPdir(e.target.value)} placeholder="父目录 fid" />
          <button onClick={loadFiles}>加载</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>fid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f, i) => (
              <tr key={i}>
                <td>{f.file_name || f.server_filename || f.name || f.file_name}</td>
                <td style={{ wordBreak: 'break-all' }}>{f.fid || f.fs_id || f.id || f.file_id}</td>
                <td>
                  <button className="ghost" onClick={() => setPdir(String(f.fid || f.fs_id || f.id || f.file_id))}>
                    进入
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
