import { api } from '../api/client';

export function Clean() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-hd">清理缓存</div>
      <p className="tips">清理站点配置缓存、排行榜缓存与 sitemap 缓存。修改基础设置或转存相关配置后如未生效，可点此清理。</p>
      <button
        type="button"
        onClick={async () => {
          const j = await api.postForm('/admin/system/clean', {});
          alert(j.message || '清理完成');
        }}
      >
        立即清理
      </button>
    </div>
  );
}
