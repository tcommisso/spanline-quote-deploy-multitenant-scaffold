SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_defects' AND column_name = 'classification') = 0,
  'ALTER TABLE `portal_defects` ADD COLUMN `classification` varchar(32) NOT NULL DEFAULT ''unclassified'' AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_maintenance_requests' AND column_name = 'requestSource') = 0,
  'ALTER TABLE `portal_maintenance_requests` ADD COLUMN `requestSource` varchar(32) NOT NULL DEFAULT ''portal'' AFTER `portalAccessId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_maintenance_requests' AND column_name = 'classification') = 0,
  'ALTER TABLE `portal_maintenance_requests` ADD COLUMN `classification` varchar(32) NOT NULL DEFAULT ''unclassified'' AFTER `requestSource`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_maintenance_requests' AND column_name = 'reportedByName') = 0,
  'ALTER TABLE `portal_maintenance_requests` ADD COLUMN `reportedByName` varchar(255) NULL AFTER `classification`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'portal_maintenance_requests' AND column_name = 'reportedByContact') = 0,
  'ALTER TABLE `portal_maintenance_requests` ADD COLUMN `reportedByContact` varchar(255) NULL AFTER `reportedByName`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
