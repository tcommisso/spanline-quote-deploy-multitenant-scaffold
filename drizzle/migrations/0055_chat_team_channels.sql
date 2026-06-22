SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_channels' AND column_name = 'type' AND COLUMN_TYPE LIKE '%team%') = 0,
  'ALTER TABLE `chat_channels` MODIFY COLUMN `type` enum(''system'',''team'',''job'') NOT NULL DEFAULT ''job''',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
