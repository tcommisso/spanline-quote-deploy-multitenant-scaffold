CREATE TABLE IF NOT EXISTS `smartshop_order_drafts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `jobNumber` varchar(128) DEFAULT NULL,
  `payload` json NOT NULL,
  `lineCount` int NOT NULL DEFAULT 0,
  `totalExGst` decimal(12,2) DEFAULT '0.00',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_smartshop_order_drafts_tenant_user` (`tenantId`, `userId`),
  KEY `idx_smartshop_order_drafts_tenant_updated` (`tenantId`, `updatedAt`),
  KEY `idx_smartshop_order_drafts_tenant_job` (`tenantId`, `jobNumber`),
  CONSTRAINT `fk_smartshop_order_drafts_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smartshop_order_drafts_user`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
