CREATE TABLE `xero_routing_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `appTenantId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `moduleKey` enum('global','crm','construction','manufacturing','approvals','trade_portal','portal','scheduled_sync') NOT NULL,
  `targetXeroConnectionId` int NOT NULL,
  `priority` int NOT NULL DEFAULT 100,
  `isActive` boolean NOT NULL DEFAULT true,
  `conditions` json,
  `notes` text,
  `createdBy` int,
  `updatedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `xero_routing_rules_id` PRIMARY KEY(`id`),
  CONSTRAINT `xero_routing_rules_appTenantId_tenants_id_fk` FOREIGN KEY (`appTenantId`) REFERENCES `tenants`(`id`) ON DELETE cascade,
  CONSTRAINT `xero_routing_rules_targetXeroConnectionId_xero_connections_id_fk` FOREIGN KEY (`targetXeroConnectionId`) REFERENCES `xero_connections`(`id`) ON DELETE cascade,
  CONSTRAINT `xero_routing_rules_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`),
  CONSTRAINT `xero_routing_rules_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`)
);
CREATE INDEX `idx_xero_routing_rules_tenant` ON `xero_routing_rules` (`appTenantId`);
CREATE INDEX `idx_xero_routing_rules_module` ON `xero_routing_rules` (`appTenantId`,`moduleKey`);
CREATE INDEX `idx_xero_routing_rules_target` ON `xero_routing_rules` (`targetXeroConnectionId`);
