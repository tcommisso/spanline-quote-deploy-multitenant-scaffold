SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'visibleToClient') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `visibleToClient` boolean NOT NULL DEFAULT false AFTER `visibleToTrade`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'sendToUserId') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `sendToUserId` int NULL AFTER `assignedInstallerId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND index_name = 'idx_construction_job_instructions_client') = 0,
  'ALTER TABLE `construction_job_instructions` ADD INDEX `idx_construction_job_instructions_client` (`tenantId`, `jobId`, `visibleToClient`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @constraint_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND constraint_name = 'fk_construction_job_instructions_send_to_user') = 0,
  'ALTER TABLE `construction_job_instructions` ADD CONSTRAINT `fk_construction_job_instructions_send_to_user` FOREIGN KEY (`sendToUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
