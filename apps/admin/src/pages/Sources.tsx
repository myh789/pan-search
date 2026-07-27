import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';

type Cat = { source_category_id: number; name: string };
type Row = {
  source_id: number;
  title: string;
  url: string;
  code?: string;
  is_type?: number;
  source_category_id?: number;
  description?: string;
  vod_content?: string;
  create_time?: number;
  update_time?: number;
};

function fmtTime(ts?: number) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const emptyForm = {
  source_id: 0,
  title: '',
  url: '',
  code: '',
  source_category_id: 0,
  description: '',
  vod_content: '',
  status: 1,
};

export function Sources() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [filterCat, setFilterCat] = useState(0);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const [dlgAdd, setDlgAdd] = useState(false);
  const [dlgEdit, setDlgEdit] = useState(false);
  const [dlgExcel, setDlgExcel] = useState(false);
  const [dlgBatch, setDlgBatch] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [excelCat, setExcelCat] = useState(0);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [batchType, setBatchType] = useState<1 | 2 | 0>(0);
  const [batchCat, setBatchCat] = useState(0);
  const [batchUrls, setBatchUrls] = useState('');

  const catName = (id?: number) => cats.find((c) => c.source_category_id === id)?.name || '-';

  const load = async (opts?: { p?: number; ps?: number; kw?: string; cat?: number }) => {
    const p = opts?.p ?? page;
    const ps = opts?.ps ?? pageSize;
    const kw = opts?.kw ?? keyword;
    const cat = opts?.cat ?? filterCat;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(p),
        page_size: String(ps),
        title: kw,
      });
      if (cat) q.set('source_category_id', String(cat));
      const j = await api.get(`/admin/source/getList?${q}`);
      setItems(j.data?.items || []);
      setTotal(j.data?.total || 0);
      setSelected([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/admin/source_category/getList').then((j) => setCats(j.data?.items || []));
    load({ p: 1, ps: pageSize });
  }, []);

  const openAdd = () => {
    setForm({ ...emptyForm });
    setDlgAdd(true);
  };

  const openEdit = async (row: Row) => {
    const j = await api.postForm('/admin/source/detail', { source_id: row.source_id }).catch(() => null);
    const d = j?.code === 200 ? j.data : row;
    setForm({
      source_id: d.source_id,
      title: d.title || '',
      url: d.url || '',
      code: d.code || '',
      source_category_id: d.source_category_id || 0,
      description: d.description || '',
      vod_content: d.vod_content || '',
      status: d.status ?? 1,
    });
    setDlgEdit(true);
  };

  const saveAdd = async () => {
    if (!form.title || !form.url) return alert('请填写名称和地址');
    const j = await api.postForm('/admin/source/add', form);
    alert(j.message);
    if (j.code === 200) {
      setDlgAdd(false);
      load();
    }
  };

  const saveEdit = async () => {
    if (!form.title || !form.url) return alert('请填写名称和地址');
    const j = await api.postForm('/admin/source/update', form);
    alert(j.message);
    if (j.code === 200) {
      setDlgEdit(false);
      load();
    }
  };

  const delOne = async (id: number) => {
    if (!confirm('删除后，资源将无法查看，是否继续删除?')) return;
    await api.postForm('/admin/source/delete', { source_id: id });
    load();
  };

  const delMulti = async () => {
    if (!selected.length) return alert('未选择任何资源！');
    if (!confirm('即将删除选中的资源, 是否确认?')) return;
    await api.postForm('/admin/source/delete', { source_id: selected.join(',') });
    load();
  };

  const exportExcel = () => {
    const rows = items.map((it) => ({ 资源名称: it.title, 资源地址: it.url }));
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 资源名称: '', 资源地址: '' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '资源');
    XLSX.writeFile(wb, 'sources.xlsx');
  };

  const submitExcel = async () => {
    if (!excelFile) return alert('请选择文件');
    const buf = await excelFile.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 }) as any[][];
    const dataRows = raw.slice(1);
    const list: { title: string; url: string }[] = [];
    for (const v of dataRows) {
      if (!v) continue;
      let title = '';
      let url = '';
      for (let i = 1; i <= 3; i++) {
        const cell = v[i] != null ? String(v[i]) : '';
        const m = cell.match(/http[^ ]+/);
        if (m) {
          title = String(v[i - 1] ?? '').replace(/^\d+\.|\d+\-/g, '');
          url = m[0];
          break;
        }
      }
      if (!url && v[1]) {
        title = String(v[0] ?? '');
        url = String(v[1]);
      }
      if (url) list.push({ title, url });
    }
    const j = await api.postJson('/admin/source/imports', {
      items: list,
      source_category_id: excelCat,
      mode: 'excel',
    });
    alert(j.message);
    if (j.code === 200) {
      setDlgExcel(false);
      setExcelFile(null);
      load();
    }
  };

  const submitBatch = async () => {
    if (!batchType) return alert('请选择导入方式');
    if (!batchUrls.trim()) return alert('请输入资源地址');
    const j = await api.postForm('/admin/source/transfer', {
      type: batchType,
      urls: batchUrls,
      source_category_id: batchCat,
    });
    alert(j.message || '已提交任务，稍后查看结果');
    if (j.code === 200) {
      setDlgBatch(false);
      setBatchUrls('');
      setBatchType(0);
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? items.map((i) => i.source_id) : []);
  };

  const lastPage = Math.max(1, Math.ceil(total / pageSize) || 1);

  const formFields = (
    <>
      <div className="field">
        <label>资源分类</label>
        <select
          value={form.source_category_id}
          onChange={(e) => setForm({ ...form, source_category_id: Number(e.target.value) })}
        >
          <option value={0}>请选择分类</option>
          {cats.map((c) => (
            <option key={c.source_category_id} value={c.source_category_id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>资源名称</label>
        <input placeholder="请输入资源名称" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="field">
        <label>资源地址</label>
        <input placeholder="请输入资源地址" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </div>
      <div className="field">
        <label>关键词搜索</label>
        <textarea rows={4} placeholder="一行一个名称" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="field">
        <label>资源介绍</label>
        <textarea rows={4} value={form.vod_content} onChange={(e) => setForm({ ...form, vod_content: e.target.value })} />
      </div>
    </>
  );

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="plain sm" onClick={openAdd}>
          + 添加资源
        </button>
        <button type="button" className="plain sm" onClick={delMulti}>
          批量删除
        </button>
        <button type="button" className="plain sm" onClick={exportExcel}>
          导出资源
        </button>
        <button type="button" className="plain sm" onClick={() => setDlgExcel(true)}>
          表格导入
        </button>
        <button type="button" className="plain sm" onClick={() => setDlgBatch(true)}>
          批量导入
        </button>
        <span className="spacer" />
        <select
          style={{ maxWidth: 140 }}
          value={filterCat}
          onChange={(e) => setFilterCat(Number(e.target.value))}
        >
          <option value={0}>筛选分类</option>
          {cats.map((c) => (
            <option key={c.source_category_id} value={c.source_category_id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          style={{ maxWidth: 200 }}
          placeholder="输入关键词搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              load({ p: 1 });
            }
          }}
        />
        <button
          type="button"
          className="plain sm"
          onClick={() => {
            setPage(1);
            load({ p: 1 });
          }}
        >
          搜索
        </button>
        <button
          type="button"
          className="plain sm"
          onClick={() => {
            setKeyword('');
            setFilterCat(0);
            setPage(1);
            load({ p: 1, kw: '', cat: 0 });
          }}
        >
          重置
        </button>
      </div>

      {loading && <p className="muted">加载中…</p>}

      <table>
        <thead>
          <tr>
            <th style={{ width: 50 }}>
              <input
                type="checkbox"
                checked={items.length > 0 && selected.length === items.length}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </th>
            <th style={{ width: 80 }}>ID</th>
            <th>资源名称</th>
            <th>资源分类</th>
            <th style={{ textAlign: 'center' }}>资源地址</th>
            <th style={{ width: 180, textAlign: 'center' }}>入库时间</th>
            <th style={{ width: 180, textAlign: 'center' }}>更新时间</th>
            <th style={{ width: 120, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.source_id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(it.source_id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, it.source_id] : s.filter((x) => x !== it.source_id)))
                  }
                />
              </td>
              <td>{it.source_id}</td>
              <td>{it.title}</td>
              <td>{catName(it.source_category_id)}</td>
              <td style={{ maxWidth: 260, wordBreak: 'break-all', textAlign: 'center' }}>{it.url}</td>
              <td style={{ textAlign: 'center' }}>{fmtTime(it.create_time)}</td>
              <td style={{ textAlign: 'center' }}>{fmtTime(it.update_time)}</td>
              <td style={{ textAlign: 'center' }}>
                <button type="button" className="link-btn success" onClick={() => openEdit(it)}>
                  编辑
                </button>
                <button type="button" className="link-btn danger-text" onClick={() => delOne(it.source_id)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
          {!items.length && !loading && (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', color: '#909399' }}>
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="pager">
        <span className="muted">共 {total} 条</span>
        <select
          style={{ maxWidth: 100 }}
          value={pageSize}
          onChange={(e) => {
            const ps = Number(e.target.value);
            setPageSize(ps);
            setPage(1);
            load({ p: 1, ps });
          }}
        >
          {[10, 20, 50, 100, 200, 500].map((n) => (
            <option key={n} value={n}>
              {n}/页
            </option>
          ))}
        </select>
        <button type="button" className="plain sm" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load({ p }); }}>
          上一页
        </button>
        <span>
          {page} / {lastPage}
        </span>
        <button type="button" className="plain sm" disabled={page >= lastPage} onClick={() => { const p = page + 1; setPage(p); load({ p }); }}>
          下一页
        </button>
      </div>

      {dlgAdd && (
        <div className="modal-mask" onClick={() => setDlgAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              添加资源
              <button type="button" className="link-btn" onClick={() => setDlgAdd(false)}>
                ×
              </button>
            </div>
            <div className="modal-bd">{formFields}</div>
            <div className="modal-ft">
              <button type="button" onClick={saveAdd}>
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}

      {dlgEdit && (
        <div className="modal-mask" onClick={() => setDlgEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              修改资源
              <button type="button" className="link-btn" onClick={() => setDlgEdit(false)}>
                ×
              </button>
            </div>
            <div className="modal-bd">{formFields}</div>
            <div className="modal-ft">
              <button type="button" onClick={saveEdit}>
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {dlgExcel && (
        <div className="modal-mask" onClick={() => setDlgExcel(false)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              导入资源
              <button type="button" className="link-btn" onClick={() => setDlgExcel(false)}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              <div className="field">
                <label>资源分类</label>
                <select value={excelCat} onChange={(e) => setExcelCat(Number(e.target.value))}>
                  <option value={0}>请选择分类</option>
                  {cats.map((c) => (
                    <option key={c.source_category_id} value={c.source_category_id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="upload-box">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setExcelFile(e.target.files?.[0] || null)} />
                <p className="tips">请使用 xlsx 格式，第一列资源名称，第二列资源地址</p>
                {excelFile && <p className="muted">已选：{excelFile.name}</p>}
              </div>
            </div>
            <div className="modal-ft">
              <button type="button" onClick={submitExcel}>
                提交
              </button>
            </div>
          </div>
        </div>
      )}

      {dlgBatch && (
        <div className="modal-mask" onClick={() => setDlgBatch(false)}>
          <div className="modal" style={{ width: 'min(790px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              导入资源
              <button type="button" className="link-btn" onClick={() => setDlgBatch(false)}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              <div className="field">
                <label>选择方式</label>
                <div className="seg">
                  <button type="button" className={batchType === 1 ? 'active' : ''} onClick={() => setBatchType(1)}>
                    直接导入
                  </button>
                  <button type="button" className={batchType === 2 ? 'active' : ''} onClick={() => setBatchType(2)}>
                    转存分享导入
                  </button>
                </div>
                {batchType === 1 && (
                  <p className="tips">
                    直接导入：链接校验有效后直接入库（<em>不转存到自己网盘</em>）；Tips：原版说明该功能不做重复检测。
                    <br />
                    支持 <em>夸克、阿里、UC、百度、迅雷</em>（一次最多 500 条）
                  </p>
                )}
                {batchType === 2 && (
                  <p className="tips">
                    将资源转存到自己网盘后再分享入库。
                    <br />
                    支持 <em>夸克、阿里、UC、百度、迅雷</em>（一次最多 500 条；百度/阿里完整转存仍有限）
                  </p>
                )}
              </div>
              {!!batchType && (
                <>
                  <div className="field">
                    <label>资源分类</label>
                    <select value={batchCat} onChange={(e) => setBatchCat(Number(e.target.value))}>
                      <option value={0}>请选择分类</option>
                      {cats.map((c) => (
                        <option key={c.source_category_id} value={c.source_category_id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>资源链接</label>
                    <textarea
                      rows={16}
                      placeholder={`资源示例：\n一条资源一行\nhttps://pan.quark.cn/s/xxxxxxxx\nhttps://www.alipan.com/s/xxxxxxxxx\nhttps://drive.uc.cn/s/xxxxxxxxxxx\nhttps://pan.baidu.com/s/xxxxxx?pwd=xxxx\nhttps://pan.xunlei.com/s/xxxxxx?pwd=xxxx`}
                      value={batchUrls}
                      onChange={(e) => setBatchUrls(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-ft">
              <button type="button" onClick={submitBatch}>
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
