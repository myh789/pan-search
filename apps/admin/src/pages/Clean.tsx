import { api } from '../api/client';

export function Clean() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-hd">清理缓存</div>
      <p className="tips">
        清理站点配置、排行榜、sitemap，并<strong>重建本地搜索 KV 索引</strong>（导入/改资源后若搜索结果偏旧，点此即可；否则约每 10 分钟 Cron 自动重建）。
      </p>
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
