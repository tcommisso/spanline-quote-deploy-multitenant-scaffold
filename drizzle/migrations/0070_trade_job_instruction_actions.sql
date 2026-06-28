CREATE TABLE IF NOT EXISTS `trade_job_instruction_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int NULL,
  `jobId` int NOT NULL,
  `installerId` int NOT NULL,
  `sourceType` enum('manual','approval_inspection','subcontract_inspection') NOT NULL,
  `sourceId` int NOT NULL,
  `sourceKey` varchar(128) NOT NULL DEFAULT '',
  `actionStatus` enum('acknowledged','completed') NOT NULL DEFAULT 'acknowledged',
  `notes` text NULL,
  `evidenceFiles` json NULL,
  `acknowledgedAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trade_job_instruction_action_source` (`tenantId`, `jobId`, `installerId`, `sourceType`, `sourceId`, `sourceKey`),
  KEY `idx_trade_job_instruction_actions_tenant` (`tenantId`),
  KEY `idx_trade_job_instruction_actions_job_installer` (`tenantId`, `jobId`, `installerId`),
  CONSTRAINT `fk_trade_job_instruction_actions_tenant`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_trade_job_instruction_actions_job`
    FOREIGN KEY (`jobId`) REFERENCES `construction_jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_trade_job_instruction_actions_installer`
    FOREIGN KEY (`installerId`) REFERENCES `construction_installers` (`id`) ON DELETE CASCADE
);
