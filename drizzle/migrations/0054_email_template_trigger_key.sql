SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'email_templates' AND column_name = 'triggerKey') = 0,
  'ALTER TABLE `email_templates` ADD COLUMN `triggerKey` varchar(128) NULL AFTER `category`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'email_templates' AND index_name = 'idx_email_templates_tenant_trigger') = 0,
  'ALTER TABLE `email_templates` ADD KEY `idx_email_templates_tenant_trigger` (`tenantId`, `triggerKey`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
