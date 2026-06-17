SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'manufacturing_purchase_orders'
    AND COLUMN_NAME = 'deliverToBranchId'
);
SET @statement := IF(
  @column_exists = 0,
  'ALTER TABLE `manufacturing_purchase_orders` ADD COLUMN `deliverToBranchId` int NULL',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'manufacturing_purchase_orders'
    AND COLUMN_NAME = 'deliverToBranchName'
);
SET @statement := IF(
  @column_exists = 0,
  'ALTER TABLE `manufacturing_purchase_orders` ADD COLUMN `deliverToBranchName` varchar(128) NULL',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'manufacturing_purchase_orders'
    AND COLUMN_NAME = 'deliverToAddress'
);
SET @statement := IF(
  @column_exists = 0,
  'ALTER TABLE `manufacturing_purchase_orders` ADD COLUMN `deliverToAddress` text NULL',
  'SELECT 1'
);
PREPARE migration_statement FROM @statement;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
