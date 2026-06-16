SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY (`status` = 'active') DESC, `id` ASC
  LIMIT 1
);

ALTER TABLE `branches`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_branches_tenant` (`tenantId`),
  ADD CONSTRAINT `fk_branches_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `crm_dropdown_options`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_crm_dropdown_options_tenant` (`tenantId`),
  ADD KEY `idx_crm_dropdown_options_tenant_category` (`tenantId`, `category`),
  ADD CONSTRAINT `fk_crm_dropdown_options_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `notification_log`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_notification_log_tenant` (`tenantId`),
  ADD KEY `idx_notification_log_tenant_created` (`tenantId`, `created_at`),
  ADD CONSTRAINT `fk_notification_log_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `support_submissions`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_support_submissions_tenant` (`tenantId`),
  ADD KEY `idx_support_submissions_tenant_status` (`tenantId`, `status`),
  ADD CONSTRAINT `fk_support_submissions_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `rain_days`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_rain_days_tenant` (`tenantId`),
  ADD KEY `idx_rain_days_tenant_date` (`tenantId`, `date`),
  ADD CONSTRAINT `fk_rain_days_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `rain_day_job_impacts`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_rain_day_job_impacts_tenant` (`tenantId`),
  ADD KEY `idx_rain_day_job_impacts_tenant_rain_day` (`tenantId`, `rainDayId`),
  ADD CONSTRAINT `fk_rain_day_job_impacts_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `extension_of_time_records`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_extension_of_time_records_tenant` (`tenantId`),
  ADD KEY `idx_extension_of_time_records_tenant_job` (`tenantId`, `jobId`),
  ADD CONSTRAINT `fk_extension_of_time_records_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

UPDATE `branches`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `crm_dropdown_options`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `notification_log`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `support_submissions`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `rain_days`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `rain_day_job_impacts` impacts
INNER JOIN `rain_days` days ON days.`id` = impacts.`rainDayId`
SET impacts.`tenantId` = days.`tenantId`
WHERE impacts.`tenantId` IS NULL;

UPDATE `rain_day_job_impacts`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `extension_of_time_records` eot
INNER JOIN `construction_jobs` jobs ON jobs.`id` = eot.`jobId`
SET eot.`tenantId` = jobs.`tenantId`
WHERE eot.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `extension_of_time_records`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;
