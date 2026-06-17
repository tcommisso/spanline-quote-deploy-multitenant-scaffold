SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `da_commissions`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `da_invoices`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `da_personal_details`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

UPDATE `da_commissions` commissions
INNER JOIN `construction_jobs` jobs ON jobs.`id` = commissions.`constructionJobId`
SET commissions.`tenantId` = jobs.`tenantId`
WHERE commissions.`tenantId` IS NULL
  AND jobs.`tenantId` IS NOT NULL;

UPDATE `da_commissions`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `da_invoices` invoices
INNER JOIN `da_commissions` commissions ON commissions.`id` = invoices.`commissionId`
SET invoices.`tenantId` = commissions.`tenantId`
WHERE invoices.`tenantId` IS NULL
  AND commissions.`tenantId` IS NOT NULL;

UPDATE `da_invoices`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `da_personal_details`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

CREATE INDEX `idx_da_commissions_tenant`
  ON `da_commissions` (`tenantId`);

CREATE INDEX `idx_da_commissions_tenant_user`
  ON `da_commissions` (`tenantId`, `daUserId`);

CREATE INDEX `idx_da_commissions_tenant_job`
  ON `da_commissions` (`tenantId`, `constructionJobId`);

CREATE INDEX `idx_da_invoices_tenant`
  ON `da_invoices` (`tenantId`);

CREATE INDEX `idx_da_invoices_tenant_user`
  ON `da_invoices` (`tenantId`, `daUserId`);

CREATE INDEX `idx_da_invoices_tenant_commission`
  ON `da_invoices` (`tenantId`, `commissionId`);

CREATE INDEX `idx_da_personal_details_tenant`
  ON `da_personal_details` (`tenantId`);

CREATE INDEX `idx_da_personal_details_tenant_user`
  ON `da_personal_details` (`tenantId`, `userId`);
