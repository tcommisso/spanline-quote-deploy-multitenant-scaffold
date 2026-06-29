CREATE TABLE IF NOT EXISTS `construction_holiday_calendar_days` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenantId` int DEFAULT NULL,
  `dateKey` varchar(10) NOT NULL,
  `name` varchar(255) NOT NULL,
  `jurisdiction` enum('NATIONAL','ACT','NSW','VIC','QLD','SA','WA','TAS','NT') NOT NULL DEFAULT 'NATIONAL',
  `year` int NOT NULL,
  `source` varchar(64) NOT NULL DEFAULT 'manual',
  `active` boolean NOT NULL DEFAULT true,
  `createdBy` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_construction_holiday_tenant_day_jurisdiction_name` (`tenantId`, `dateKey`, `jurisdiction`, `name`),
  KEY `idx_construction_holiday_tenant_date` (`tenantId`, `dateKey`),
  KEY `idx_construction_holiday_tenant_year` (`tenantId`, `year`),
  CONSTRAINT `construction_holiday_calendar_days_tenantId_tenants_id_fk`
    FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `construction_holiday_calendar_days_createdBy_users_id_fk`
    FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
);
