SET @ss_quote_items_colour_id_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'colourId'
);
SET @ss_quote_items_colour_id_col_sql := IF(
  @ss_quote_items_colour_id_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `colourId` int NULL AFTER `quantity`'
);
PREPARE ss_quote_items_colour_id_col_stmt FROM @ss_quote_items_colour_id_col_sql;
EXECUTE ss_quote_items_colour_id_col_stmt;
DEALLOCATE PREPARE ss_quote_items_colour_id_col_stmt;

SET @ss_quote_items_colour_name_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'colourName'
);
SET @ss_quote_items_colour_name_col_sql := IF(
  @ss_quote_items_colour_name_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `colourName` varchar(128) NULL AFTER `colourId`'
);
PREPARE ss_quote_items_colour_name_col_stmt FROM @ss_quote_items_colour_name_col_sql;
EXECUTE ss_quote_items_colour_name_col_stmt;
DEALLOCATE PREPARE ss_quote_items_colour_name_col_stmt;

SET @ss_quote_items_handle_side_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'handleSide'
);
SET @ss_quote_items_handle_side_col_sql := IF(
  @ss_quote_items_handle_side_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `handleSide` varchar(32) NULL AFTER `colourName`'
);
PREPARE ss_quote_items_handle_side_col_stmt FROM @ss_quote_items_handle_side_col_sql;
EXECUTE ss_quote_items_handle_side_col_stmt;
DEALLOCATE PREPARE ss_quote_items_handle_side_col_stmt;

SET @ss_quote_items_hinge_side_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'hingeSide'
);
SET @ss_quote_items_hinge_side_col_sql := IF(
  @ss_quote_items_hinge_side_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `hingeSide` varchar(32) NULL AFTER `handleSide`'
);
PREPARE ss_quote_items_hinge_side_col_stmt FROM @ss_quote_items_hinge_side_col_sql;
EXECUTE ss_quote_items_hinge_side_col_stmt;
DEALLOCATE PREPARE ss_quote_items_hinge_side_col_stmt;

SET @ss_quote_items_opening_direction_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'openingDirection'
);
SET @ss_quote_items_opening_direction_col_sql := IF(
  @ss_quote_items_opening_direction_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `openingDirection` varchar(32) NULL AFTER `hingeSide`'
);
PREPARE ss_quote_items_opening_direction_col_stmt FROM @ss_quote_items_opening_direction_col_sql;
EXECUTE ss_quote_items_opening_direction_col_stmt;
DEALLOCATE PREPARE ss_quote_items_opening_direction_col_stmt;

SET @ss_quote_items_hinge_position_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'hingePosition'
);
SET @ss_quote_items_hinge_position_col_sql := IF(
  @ss_quote_items_hinge_position_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `hingePosition` varchar(32) NULL AFTER `openingDirection`'
);
PREPARE ss_quote_items_hinge_position_col_stmt FROM @ss_quote_items_hinge_position_col_sql;
EXECUTE ss_quote_items_hinge_position_col_stmt;
DEALLOCATE PREPARE ss_quote_items_hinge_position_col_stmt;

SET @ss_quote_items_glass_infill_id_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'glassInfillId'
);
SET @ss_quote_items_glass_infill_id_col_sql := IF(
  @ss_quote_items_glass_infill_id_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `glassInfillId` int NULL AFTER `hingePosition`'
);
PREPARE ss_quote_items_glass_infill_id_col_stmt FROM @ss_quote_items_glass_infill_id_col_sql;
EXECUTE ss_quote_items_glass_infill_id_col_stmt;
DEALLOCATE PREPARE ss_quote_items_glass_infill_id_col_stmt;

SET @ss_quote_items_glass_infill_quantity_col_exists := (
  SELECT COUNT(*)
  FROM `INFORMATION_SCHEMA`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ss_quote_items'
    AND `COLUMN_NAME` = 'glassInfillQuantity'
);
SET @ss_quote_items_glass_infill_quantity_col_sql := IF(
  @ss_quote_items_glass_infill_quantity_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE `ss_quote_items` ADD COLUMN `glassInfillQuantity` decimal(10,2) NOT NULL DEFAULT ''1.00'' AFTER `glassInfillId`'
);
PREPARE ss_quote_items_glass_infill_quantity_col_stmt FROM @ss_quote_items_glass_infill_quantity_col_sql;
EXECUTE ss_quote_items_glass_infill_quantity_col_stmt;
DEALLOCATE PREPARE ss_quote_items_glass_infill_quantity_col_stmt;
