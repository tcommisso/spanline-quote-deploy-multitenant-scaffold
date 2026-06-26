ALTER TABLE `inventory_stock_items`
  ADD COLUMN `actual_width` decimal(12,2) NULL AFTER `actual_size`,
  ADD COLUMN `actual_height` decimal(12,2) NULL AFTER `actual_width`,
  ADD COLUMN `source_full_width` decimal(12,2) NULL AFTER `source_full_length`,
  ADD COLUMN `source_full_height` decimal(12,2) NULL AFTER `source_full_width`;

ALTER TABLE `stocktake_lines`
  ADD COLUMN `actual_width` decimal(12,2) NULL AFTER `actual_size`,
  ADD COLUMN `actual_height` decimal(12,2) NULL AFTER `actual_width`,
  ADD COLUMN `source_full_width` decimal(12,2) NULL AFTER `source_full_length`,
  ADD COLUMN `source_full_height` decimal(12,2) NULL AFTER `source_full_width`;
