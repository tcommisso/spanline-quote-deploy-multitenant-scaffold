CREATE TABLE IF NOT EXISTS `user_activity_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `userId` int NULL,
  `userName` varchar(255) NULL,
  `userEmail` varchar(320) NULL,
  `impersonatorUserId` int NULL,
  `impersonatorName` varchar(255) NULL,
  `actorType` enum('user','client','trade','system') NOT NULL DEFAULT 'user',
  `action` varchar(64) NOT NULL,
  `eventName` varchar(180) NOT NULL,
  `entityType` varchar(80) NULL,
  `entityId` varchar(120) NULL,
  `status` enum('success','failure') NOT NULL DEFAULT 'success',
  `requestPath` varchar(255) NULL,
  `ipAddress` varchar(64) NULL,
  `userAgent` varchar(512) NULL,
  `metadata` json NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_user_activity_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_activity_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_activity_impersonator` FOREIGN KEY (`impersonatorUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_activity_log' AND index_name = 'idx_user_activity_tenant_created') = 0,
  'CREATE INDEX `idx_user_activity_tenant_created` ON `user_activity_log` (`tenantId`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_activity_log' AND index_name = 'idx_user_activity_tenant_user_created') = 0,
  'CREATE INDEX `idx_user_activity_tenant_user_created` ON `user_activity_log` (`tenantId`, `userId`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_activity_log' AND index_name = 'idx_user_activity_tenant_action_created') = 0,
  'CREATE INDEX `idx_user_activity_tenant_action_created` ON `user_activity_log` (`tenantId`, `action`, `createdAt`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @migration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'user_activity_log' AND index_name = 'idx_user_activity_tenant_entity') = 0,
  'CREATE INDEX `idx_user_activity_tenant_entity` ON `user_activity_log` (`tenantId`, `entityType`, `entityId`)',
  'SELECT 1'
);
PREPARE stmt FROM @migration_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
