import { useState } from 'react';
import { api } from '../api/client';

export function Password() {
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', check: '' });

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="card-hd">修改密码</div>
      <div className="field">
        <label>原密码</label>
        <input
          type="password"
          value={pwd.old_password}
          onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })}
          placeholder="请输入原密码"
        />
      </div>
      <div className="field">
        <label>新密码</label>
        <input
          type="password"
          value={pwd.new_password}
          onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
          placeholder="请输入新密码"
        />
      </div>
      <div className="field">
        <label>确认密码</label>
        <input
          type="password"
          value={pwd.check}
          onChange={(e) => setPwd({ ...pwd, check: e.target.value })}
          placeholder="请再次输入新密码"
        />
      </div>
      <button
        type="button"
        onClick={async () => {
          if (!pwd.old_password || !pwd.new_password) return alert('请填写完整');
          if (pwd.new_password !== pwd.check) return alert('两次密码不一致');
          const j = await api.postForm('/admin/admin/motifyPassword', {
            old_password: pwd.old_password,
            new_password: pwd.new_password,
          });
          alert(j.message);
          if (j.code === 200) setPwd({ old_password: '', new_password: '', check: '' });
        }}
      >
        保存密码
      </button>
    </div>
  );
}
