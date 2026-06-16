SET @add_source_created_at := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `crm_leads` ADD COLUMN `sourceCreatedAt` timestamp NULL AFTER `leadDate`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND COLUMN_NAME = 'sourceCreatedAt'
);
PREPARE stmt FROM @add_source_created_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_source_created_at_index := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `idx_crm_leads_source_created_at` ON `crm_leads` (`sourceCreatedAt`)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND INDEX_NAME = 'idx_crm_leads_source_created_at'
);
PREPARE stmt FROM @add_source_created_at_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
