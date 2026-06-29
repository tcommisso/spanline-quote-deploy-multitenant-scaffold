SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quote_items' AND column_name = 'sourceKey') = 0,
  'ALTER TABLE `quote_items` ADD COLUMN `sourceKey` varchar(191) NULL AFTER `source`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quote_items' AND column_name = 'sourceHash') = 0,
  'ALTER TABLE `quote_items` ADD COLUMN `sourceHash` varchar(64) NULL AFTER `sourceKey`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'quote_items' AND index_name = 'idx_quote_items_source_key') = 0,
  'ALTER TABLE `quote_items` ADD INDEX `idx_quote_items_source_key` (`tenantId`, `quoteId`, `source`, `sourceKey`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'quote_items' AND index_name = 'uq_quote_items_generated_source') = 0,
  'ALTER TABLE `quote_items` ADD UNIQUE INDEX `uq_quote_items_generated_source` (`tenantId`, `quoteId`, `sourceKey`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
