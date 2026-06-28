CREATE TABLE IF NOT EXISTS `checklist_default_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `section` varchar(64) NOT NULL,
  `label` varchar(255) NOT NULL,
  `unit` varchar(20) NOT NULL DEFAULT 'ea',
  `responsibility` varchar(32) NOT NULL DEFAULT '',
  `productMatch` varchar(255) NOT NULL DEFAULT '',
  `notes` varchar(500) NOT NULL DEFAULT '',
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_checklist_default_items_tenant` (`tenantId`),
  KEY `idx_checklist_default_items_tenant_section` (`tenantId`, `section`),
  CONSTRAINT `fk_checklist_default_items_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);
