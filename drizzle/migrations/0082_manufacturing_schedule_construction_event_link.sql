SET @has_column := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'manufacturing_schedule'
    AND column_name = 'constructionScheduleEventId'
);

SET @ddl := IF(
  @has_column = 0,
  'ALTER TABLE `manufacturing_schedule` ADD COLUMN `constructionScheduleEventId` int NULL AFTER `orderId`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_unique := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'manufacturing_schedule'
    AND index_name = 'uniq_manufacturing_schedule_construction_event'
);

SET @ddl := IF(
  @has_unique = 0,
  'CREATE UNIQUE INDEX `uniq_manufacturing_schedule_construction_event` ON `manufacturing_schedule` (`constructionScheduleEventId`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
