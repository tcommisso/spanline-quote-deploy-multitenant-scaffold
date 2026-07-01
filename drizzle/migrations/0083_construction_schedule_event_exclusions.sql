CREATE TABLE IF NOT EXISTS `construction_schedule_event_exclusions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int DEFAULT NULL,
  `eventId` int NOT NULL,
  `dateKey` varchar(10) NOT NULL,
  `reason` varchar(255) DEFAULT 'removed_day',
  `createdBy` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_construction_schedule_event_exclusion_day` (`tenantId`, `eventId`, `dateKey`),
  KEY `idx_construction_schedule_event_exclusions_tenant_event` (`tenantId`, `eventId`),
  KEY `idx_construction_schedule_event_exclusions_tenant_date` (`tenantId`, `dateKey`),
  CONSTRAINT `construction_schedule_event_exclusions_tenantId_tenants_id_fk`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_sched_event_exclusion_event`
    FOREIGN KEY (`eventId`) REFERENCES `construction_schedule_events` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `construction_schedule_event_exclusions_createdBy_users_id_fk`
    FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
