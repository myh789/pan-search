import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Profile() {
  const [form, setForm] = useState({
    admin_account: '',
    admin_name: '',
    admin_truename: '',
    admin_email: '',
    admin_idcard: '',
  });

  useEffect(() => {
    api.get('/admin/admin/getMyInfo').then((j) => {
      if (j.code === 200 && j.data) {
        setForm({
          admin_account: j.data.admin_account || '',
          admin_name: j.data.admin_name || '',
          admin_truename: j.data.admin_truename || '',
          admin_email: j.data.admin_email || '',
          admin_idcard: j.data.admin_idcard || '',
        });
      }
    });
  }, []);

  return (
    <div>
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-hd">修改我的资料</div>
        <div className="field">
          <label>帐号</label>
          <input value={form.admin_account} disabled />
        </div>
        <div className="field">
          <label>昵称</label>
          <input
            placeholder="请输入你的昵称"
            value={form.admin_name}
            onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>姓名</label>
          <input
            placeholder="请输入你的真实姓名"
            value={form.admin_truename}
            onChange={(e) => setForm({ ...form, admin_truename: e.target.value })}
          />
        </div>
        <div className="field">
          <label>邮箱</label>
          <input
            placeholder="请输入你的邮箱"
            value={form.admin_email}
            onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
          />
        </div>
        <div className="field">
          <label>身份证</label>
          <input
            placeholder="请输入你的身份证"
            value={form.admin_idcard}
            onChange={(e) => setForm({ ...form, admin_idcard: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!form.admin_name.trim()) return alert('昵称必须填写');
            const j = await api.postForm('/admin/admin/updateMyInfo', form);
            if (j.code === 200) localStorage.setItem('ps_admin_name', form.admin_name.trim());
            alert(j.message);
          }}
        >
          更新资料
        </button>
      </div>
    </div>
  );
}
