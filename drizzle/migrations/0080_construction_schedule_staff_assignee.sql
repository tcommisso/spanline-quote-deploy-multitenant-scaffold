SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'construction_schedule_events'
    AND column_name = 'assignedUserId'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `construction_schedule_events` ADD COLUMN `assignedUserId` int NULL AFTER `assignedInstallerId`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'construction_schedule_events'
    AND index_name = 'idx_construction_schedule_events_assigned_user'
);

SET @ddl := IF(
  @index_exists = 0,
  'ALTER TABLE `construction_schedule_events` ADD KEY `idx_construction_schedule_events_assigned_user` (`tenantId`, `assignedUserId`)',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'construction_schedule_events'
    AND constraint_name = 'fk_sched_event_assigned_user'
);

SET @ddl := IF(
  @fk_exists = 0,
  'ALTER TABLE `construction_schedule_events` ADD CONSTRAINT `fk_sched_event_assigned_user` FOREIGN KEY (`assignedUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
