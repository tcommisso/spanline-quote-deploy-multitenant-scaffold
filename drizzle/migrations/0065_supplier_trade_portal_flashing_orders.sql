SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'suppliers' AND column_name = 'tradePortalFlashingOrdersEnabled') = 0,
  'ALTER TABLE `suppliers` ADD COLUMN `tradePortalFlashingOrdersEnabled` boolean NOT NULL DEFAULT false',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
