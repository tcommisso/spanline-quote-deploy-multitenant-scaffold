SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'responseType') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `responseType` varchar(64) NOT NULL DEFAULT ''check'' AFTER `sortOrder`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'responseOptions') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `responseOptions` json NULL AFTER `responseType`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'responseRequired') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `responseRequired` boolean NOT NULL DEFAULT false AFTER `responseOptions`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'responseHelpText') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `responseHelpText` text NULL AFTER `responseRequired`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'construction_job_instructions' AND column_name = 'responseValue') = 0,
  'ALTER TABLE `construction_job_instructions` ADD COLUMN `responseValue` json NULL AFTER `responseHelpText`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
