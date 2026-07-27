import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** 参数配置：列表 + 按 key 改值（对齐原版 conf/index 常用能力） */
export function ConfParams() {
  const [items, setItems] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [val, setVal] = useState('');

  const load = async () => {
    const j = await api.get('/admin/conf/getList');
    setItems(j.data?.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <span className="muted">全部配置项（与「基础设置」同源；此处可按 key 直接改值）</span>
        <span className="spacer" />
        <button type="button" className="plain sm" onClick={load}>
          刷新
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>ID</th>
            <th style={{ width: 160 }}>Key</th>
            <th style={{ width: 140 }}>标题</th>
            <th>值</th>
            <th style={{ width: 80 }}>类型</th>
            <th style={{ width: 90 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.conf_id || it.conf_key}>
              <td>{it.conf_id}</td>
              <td>
                <code>{it.conf_key}</code>
              </td>
              <td>{it.conf_title}</td>
              <td style={{ wordBreak: 'break-all', maxWidth: 360 }}>{String(it.conf_value ?? '').slice(0, 120)}</td>
              <td>{it.conf_type}</td>
              <td>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setEdit(it);
                    setVal(String(it.conf_value ?? ''));
                  }}
                >
                  编辑
                </button>
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#909399' }}>
                暂无配置
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {edit && (
        <div className="modal-mask" onClick={() => setEdit(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              编辑 {edit.conf_title || edit.conf_key}
              <button type="button" className="link-btn" onClick={() => setEdit(null)}>
                关闭
              </button>
            </div>
            <div className="modal-bd">
              <div className="field">
                <label>Key</label>
                <input value={edit.conf_key} disabled />
              </div>
              <div className="field">
                <label>值</label>
                <textarea rows={6} value={val} onChange={(e) => setVal(e.target.value)} />
              </div>
            </div>
            <div className="modal-ft">
              <button type="button" className="plain" onClick={() => setEdit(null)}>
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  const j = await api.postForm('/admin/conf/updateBaseConfig', { [edit.conf_key]: val });
                  alert(j.message || '已保存');
                  setEdit(null);
                  load();
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
