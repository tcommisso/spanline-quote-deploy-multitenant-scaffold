SET @add_client_number := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `crm_leads` ADD COLUMN `clientNumber` varchar(64) NULL AFTER `contactAddress`',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND COLUMN_NAME = 'clientNumber'
);
PREPARE stmt FROM @add_client_number;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_client_number_index := (
  SELECT IF(
    COUNT(*) = 0,
    'CREATE INDEX `idx_crm_leads_client_number` ON `crm_leads` (`clientNumber`)',
    'SELECT 1'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND INDEX_NAME = 'idx_crm_leads_client_number'
);
PREPARE stmt FROM @add_client_number_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
