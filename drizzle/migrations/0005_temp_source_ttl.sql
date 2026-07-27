-- Temporary resource auto-cleanup TTL (minutes)
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'temp_source_ttl', '30', '临时资源保留时长', '全网搜转存后的临时文件与分享链接，超过该分钟数后自动删除网盘文件并软删库记录。建议 15～120，默认 30。Cron 每 10 分钟扫描一次。', 0, 1, 1, 5, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'temp_source_ttl');
