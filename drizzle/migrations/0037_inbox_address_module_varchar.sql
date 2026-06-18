SET @inbox_addresses_module_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'inbox_addresses'
    AND `COLUMN_NAME` = 'module'
);
SET @inbox_addresses_module_col_sql := IF(
  @inbox_addresses_module_col_exists > 0,
  'ALTER TABLE `inbox_addresses` MODIFY COLUMN `module` varchar(50) NULL',
  'SELECT 1'
);
PREPARE inbox_addresses_module_col_stmt FROM @inbox_addresses_module_col_sql;
EXECUTE inbox_addresses_module_col_stmt;
DEALLOCATE PREPARE inbox_addresses_module_col_stmt;
