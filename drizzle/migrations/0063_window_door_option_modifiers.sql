CREATE TABLE IF NOT EXISTS `window_door_option_modifiers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int,
  `productType` enum('window','door') NOT NULL,
  `optionGroup` enum('glass_type','tint','obscurity','etched','screen','pet_door','other') NOT NULL,
  `optionValue` varchar(128) NOT NULL,
  `adjustmentType` enum('percent','fixed') NOT NULL DEFAULT 'percent',
  `costAdjustmentValue` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sellAdjustmentValue` decimal(10,2) NOT NULL DEFAULT '0.00',
  `appliesTo` varchar(32) NOT NULL DEFAULT 'base_line',
  `label` varchar(255),
  `notes` text,
  `sortOrder` int DEFAULT 0,
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wd_option_modifiers_tenant` (`tenantId`),
  KEY `idx_wd_option_modifiers_lookup` (`tenantId`, `productType`, `optionGroup`, `active`),
  CONSTRAINT `window_door_option_modifiers_tenantId_tenants_id_fk`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
);
