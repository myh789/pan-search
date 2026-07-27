-- Source pin (is_top) + Agnes AI fill config

ALTER TABLE source ADD COLUMN is_top INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_source_is_top ON source(is_top DESC, source_id DESC);

-- AI settings (conf_type = 5 → 后台「AI设置」Tab)；秘钥留空，由后台填写或 Wrangler secret
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_enabled', '1', '启用 AI 填充', '开启后可在资源管理一键生成关键词标签与资源介绍（已有内容不覆盖）', 2, 5, 1, 99, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_enabled');

INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_base_url', 'https://apihub.agnes-ai.com/v1', 'AI Base URL', 'OpenAI 兼容接口根地址，默认 Agnes', 0, 5, 1, 98, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_base_url');

INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_model', 'agnes-2.5-flash', 'AI 模型', '默认 Agnes 2.5 Flash', 0, 5, 1, 97, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_model');

INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ai_api_key', '', 'AI API Key', 'Agnes API Key；也可通过 wrangler secret put AGNES_API_KEY 注入（Secret 优先）', 0, 5, 1, 96, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ai_api_key');

UPDATE conf SET conf_content = '关闭=>0
开启=>1' WHERE conf_key = 'ai_enabled' AND (conf_content IS NULL OR conf_content = '');
