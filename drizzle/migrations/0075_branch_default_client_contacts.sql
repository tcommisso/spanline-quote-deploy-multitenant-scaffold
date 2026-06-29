SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'branches' AND column_name = 'defaultBranchAdminStaffId') = 0,
  'ALTER TABLE `branches` ADD COLUMN `defaultBranchAdminStaffId` int NULL AFTER `managerEmail`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'branches' AND column_name = 'defaultConstructionManagerStaffId') = 0,
  'ALTER TABLE `branches` ADD COLUMN `defaultConstructionManagerStaffId` int NULL AFTER `defaultBranchAdminStaffId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'branches' AND column_name = 'defaultFinanceStaffId') = 0,
  'ALTER TABLE `branches` ADD COLUMN `defaultFinanceStaffId` int NULL AFTER `defaultConstructionManagerStaffId`',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
