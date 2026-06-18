SET @isi_serial_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `COLUMN_NAME` = 'serial_number'
);
SET @isi_serial_col_sql := IF(
  @isi_serial_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inventory_stock_items` ADD COLUMN `serial_number` varchar(128) NULL'
);
PREPARE isi_serial_col_stmt FROM @isi_serial_col_sql;
EXECUTE isi_serial_col_stmt;
DEALLOCATE PREPARE isi_serial_col_stmt;

SET @isi_actual_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `COLUMN_NAME` = 'actual_size'
);
SET @isi_actual_col_sql := IF(
  @isi_actual_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inventory_stock_items` ADD COLUMN `actual_size` decimal(12,2) NULL'
);
PREPARE isi_actual_col_stmt FROM @isi_actual_col_sql;
EXECUTE isi_actual_col_stmt;
DEALLOCATE PREPARE isi_actual_col_stmt;

SET @isi_full_len_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `COLUMN_NAME` = 'source_full_length'
);
SET @isi_full_len_col_sql := IF(
  @isi_full_len_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inventory_stock_items` ADD COLUMN `source_full_length` decimal(12,2) NULL'
);
PREPARE isi_full_len_col_stmt FROM @isi_full_len_col_sql;
EXECUTE isi_full_len_col_stmt;
DEALLOCATE PREPARE isi_full_len_col_stmt;

SET @isi_mfg_product_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `COLUMN_NAME` = 'manufacturing_catalogue_product_id'
);
SET @isi_mfg_product_col_sql := IF(
  @isi_mfg_product_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `inventory_stock_items` ADD COLUMN `manufacturing_catalogue_product_id` int NULL'
);
PREPARE isi_mfg_product_col_stmt FROM @isi_mfg_product_col_sql;
EXECUTE isi_mfg_product_col_stmt;
DEALLOCATE PREPARE isi_mfg_product_col_stmt;

SET @isi_idx_serial_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `INDEX_NAME` = 'idx_inventory_stock_items_serial_number'
);
SET @isi_idx_serial_sql := IF(
  @isi_idx_serial_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_inventory_stock_items_serial_number` ON `inventory_stock_items` (`serial_number`)'
);
PREPARE isi_idx_serial_stmt FROM @isi_idx_serial_sql;
EXECUTE isi_idx_serial_stmt;
DEALLOCATE PREPARE isi_idx_serial_stmt;

SET @isi_idx_branch_code_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `INDEX_NAME` = 'idx_inventory_stock_items_tenant_branch_code'
);
SET @isi_idx_branch_code_sql := IF(
  @isi_idx_branch_code_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_inventory_stock_items_tenant_branch_code` ON `inventory_stock_items` (`tenantId`, `branch_id`, `code`)'
);
PREPARE isi_idx_branch_code_stmt FROM @isi_idx_branch_code_sql;
EXECUTE isi_idx_branch_code_stmt;
DEALLOCATE PREPARE isi_idx_branch_code_stmt;

SET @isi_idx_mfg_product_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inventory_stock_items'
    AND `INDEX_NAME` = 'idx_inventory_stock_items_mfg_product'
);
SET @isi_idx_mfg_product_sql := IF(
  @isi_idx_mfg_product_exists > 0,
  'SELECT 1',
  'CREATE INDEX `idx_inventory_stock_items_mfg_product` ON `inventory_stock_items` (`tenantId`, `manufacturing_catalogue_product_id`)'
);
PREPARE isi_idx_mfg_product_stmt FROM @isi_idx_mfg_product_sql;
EXECUTE isi_idx_mfg_product_stmt;
DEALLOCATE PREPARE isi_idx_mfg_product_stmt;
