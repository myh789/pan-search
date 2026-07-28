-- api_list.scene: 0=资源全网搜 1=音乐搜（与 pantype 正交）
ALTER TABLE api_list ADD COLUMN scene INTEGER NOT NULL DEFAULT 0;
