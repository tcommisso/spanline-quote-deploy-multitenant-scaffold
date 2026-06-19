ALTER TABLE `stocktake_lines`
  ADD COLUMN `condition_indicator` enum('new','damaged','off_cut') NOT NULL DEFAULT 'new' AFTER `stock_item_id`,
  ADD COLUMN `colour` varchar(100) NULL AFTER `condition_indicator`,
  ADD COLUMN `actual_size` decimal(12,2) NULL AFTER `colour`,
  ADD COLUMN `source_full_length` decimal(12,2) NULL AFTER `actual_size`;
