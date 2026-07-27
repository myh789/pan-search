import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { uploadImageFile } from './Dashboard';

type Cat = {
  source_category_id: number;
  name: string;
  image?: string;
  sort?: number;
  status?: number;
  is_update?: number;
  is_type?: number;
  is_sys?: number;
};

const empty = { source_category_id: 0, name: '', image: '', sort: 100, status: 0, is_update: 1, is_type: 0 };

export function Categories() {
  const [items, setItems] = useState<Cat[]>([]);
  const [dlg, setDlg] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState({ ...empty });

  const load = async () => {
    const j = await api.get('/admin/source_category/getList');
    setItems(j.data?.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = async (it: Cat, field: 'is_type' | 'is_update' | 'status') => {
    // original: is_type 1=本地展示; status 0=前台展示 1=不展示 — switch flips value
    let next = Number(it[field] || 0) ? 0 : 1;
    if (field === 'status') {
      // UI「是否前台展示」: status==0 means show; switch on => status 0
      next = Number(it.status) === 0 ? 1 : 0;
    }
    await api.postForm('/admin/source_category/setStatus', {
      source_category_id: it.source_category_id,
      field,
      value: next,
    });
    load();
  };

  const save = async () => {
    if (!form.name.trim()) return alert('请填写分类名称');
    const j =
      dlg === 'edit'
        ? await api.postForm('/admin/source_category/update', form)
        : await api.postForm('/admin/source_category/add', form);
    alert(j.message);
    if (j.code === 200) {
      setDlg(null);
      load();
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="plain sm"
          onClick={() => {
            setForm({ ...empty });
            setDlg('add');
          }}
        >
          + 添加
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}>ID</th>
            <th>分类名称</th>
            <th style={{ width: 130, textAlign: 'center' }}>是否展示本地</th>
            <th style={{ width: 130, textAlign: 'center' }}>是否每日更新</th>
            <th style={{ width: 130, textAlign: 'center' }}>是否前台展示</th>
            <th style={{ width: 80, textAlign: 'center' }}>排序</th>
            <th style={{ width: 140, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.source_category_id}>
              <td>{it.source_category_id}</td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {it.image ? <img src={it.image} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4 }} /> : null}
                  {it.name}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button type="button" className={`switch ${it.is_type == 1 ? 'on' : ''}`} onClick={() => toggle(it, 'is_type')} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <button type="button" className={`switch ${it.is_update == 1 ? 'on' : ''}`} onClick={() => toggle(it, 'is_update')} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <button type="button" className={`switch ${it.status == 0 ? 'on' : ''}`} onClick={() => toggle(it, 'status')} />
              </td>
              <td style={{ textAlign: 'center' }}>{it.sort}</td>
              <td style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setForm({
                      source_category_id: it.source_category_id,
                      name: it.name,
                      image: it.image || '',
                      sort: it.sort || 0,
                      status: it.status || 0,
                      is_update: it.is_update ?? 1,
                      is_type: it.is_type || 0,
                    });
                    setDlg('edit');
                  }}
                >
                  编辑
                </button>
                {!it.is_sys ? (
                  <button
                    type="button"
                    className="link-btn danger-text"
                    onClick={async () => {
                      if (!confirm('确认删除该分类？')) return;
                      await api.postForm('/admin/source_category/delete', { source_category_id: it.source_category_id });
                      load();
                    }}
                  >
                    删除
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dlg && (
        <div className="modal-mask" onClick={() => setDlg(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              {dlg === 'add' ? '添加资源分类' : '修改资源分类'}
              <button type="button" className="link-btn" onClick={() => setDlg(null)}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              <div className="field">
                <label>分类名称</label>
                <input
                  value={form.name}
                  disabled={dlg === 'edit'}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>图标</label>
                <div className="row">
                  <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="图片 URL" />
                  <label className="plain" style={{ padding: '8px 12px', border: '1px solid var(--line-strong)', borderRadius: 4, cursor: 'pointer' }}>
                    上传
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const j = await uploadImageFile(f);
                        if (j.code === 200 && j.data?.path) setForm((prev) => ({ ...prev, image: j.data.path }));
                        else alert(j.message || '上传失败');
                      }}
                    />
                  </label>
                </div>
                {form.image ? <img src={form.image} alt="" style={{ maxHeight: 48, marginTop: 8 }} /> : null}
              </div>
              <div className="field">
                <label>排序</label>
                <input
                  type="number"
                  style={{ maxWidth: 120 }}
                  value={form.sort}
                  onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="modal-ft">
              <button type="button" onClick={save}>
                {dlg === 'add' ? '确认添加' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
