CREATE TABLE IF NOT EXISTS `construction_job_instructions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `jobId` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `category` enum('general','inspection','hold_point','site_access','safety','completion_evidence','contract_reminder','other') NOT NULL DEFAULT 'general',
  `status` enum('open','acknowledged','done','blocked','not_applicable') NOT NULL DEFAULT 'open',
  `priority` enum('normal','important','urgent') NOT NULL DEFAULT 'normal',
  `visibleToTrade` boolean NOT NULL DEFAULT true,
  `assignedInstallerId` int NULL,
  `isBlocking` boolean NOT NULL DEFAULT false,
  `dueAt` timestamp NULL DEFAULT NULL,
  `triggerLabel` varchar(255) NULL,
  `sourceType` varchar(64) NOT NULL DEFAULT 'manual',
  `sourceId` int NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdByUserId` int NULL,
  `createdByName` varchar(255) NULL,
  `updatedByUserId` int NULL,
  `updatedByName` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_construction_job_instructions_tenant` (`tenantId`),
  KEY `idx_construction_job_instructions_tenant_job` (`tenantId`, `jobId`),
  KEY `idx_construction_job_instructions_trade` (`tenantId`, `jobId`, `visibleToTrade`, `assignedInstallerId`),
  CONSTRAINT `fk_construction_job_instructions_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_construction_job_instructions_job`
    FOREIGN KEY (`jobId`) REFERENCES `construction_jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_construction_job_instructions_installer`
    FOREIGN KEY (`assignedInstallerId`) REFERENCES `construction_installers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_construction_job_instructions_created_by`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_construction_job_instructions_updated_by`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
