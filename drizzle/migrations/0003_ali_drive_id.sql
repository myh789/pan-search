-- Aliyun drive_id config
INSERT INTO conf (conf_key, conf_value, conf_title, conf_desc, conf_spec, conf_type, conf_status, conf_sort, conf_system, conf_createtime, conf_updatetime)
SELECT 'ali_drive_id', '2008425230', '阿里drive_id', '阿里云盘 drive_id，账号管理中可改', 0, 4, 1, 76, 1, strftime('%s','now'), strftime('%s','now')
WHERE NOT EXISTS (SELECT 1 FROM conf WHERE conf_key = 'ali_drive_id');
