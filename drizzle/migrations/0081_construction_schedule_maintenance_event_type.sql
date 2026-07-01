SET @event_type_has_maintenance := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'construction_schedule_events'
    AND column_name = 'eventType'
    AND column_type LIKE '%maintenance%'
);

SET @ddl := IF(
  @event_type_has_maintenance = 0,
  'ALTER TABLE `construction_schedule_events` MODIFY COLUMN `eventType` enum(''installation'',''inspection'',''meeting'',''delivery'',''maintenance'',''other'') NOT NULL DEFAULT ''installation''',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
