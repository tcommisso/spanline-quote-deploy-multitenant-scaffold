SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

ALTER TABLE `climbo_accounts`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

ALTER TABLE `google_reviews`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

UPDATE `climbo_accounts`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `google_reviews` reviews
INNER JOIN `climbo_accounts` accounts ON accounts.`id` = reviews.`climboAccountId`
SET reviews.`tenantId` = accounts.`tenantId`
WHERE reviews.`tenantId` IS NULL
  AND accounts.`tenantId` IS NOT NULL;

UPDATE `google_reviews`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

CREATE INDEX `idx_climbo_accounts_tenant` ON `climbo_accounts` (`tenantId`);
CREATE INDEX `idx_google_reviews_tenant` ON `google_reviews` (`tenantId`);
CREATE INDEX `idx_google_reviews_tenant_lead` ON `google_reviews` (`tenantId`, `leadId`);
CREATE INDEX `idx_google_reviews_tenant_google_id` ON `google_reviews` (`tenantId`, `googleReviewId`);
