-- Indexes to cut rows_read on common filters / cleanup / homepage
CREATE INDEX IF NOT EXISTS idx_source_list
  ON source (status, is_delete, is_time, source_id DESC);

CREATE INDEX IF NOT EXISTS idx_source_category_time
  ON source (source_category_id, status, is_delete, is_time, create_time DESC);

CREATE INDEX IF NOT EXISTS idx_source_temp_cleanup
  ON source (is_time, is_delete, create_time);

CREATE INDEX IF NOT EXISTS idx_source_title
  ON source (title);
