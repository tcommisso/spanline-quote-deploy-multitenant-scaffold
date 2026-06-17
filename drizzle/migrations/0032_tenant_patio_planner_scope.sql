-- Add tenant ownership to patio planner projects and backfill existing records.
ALTER TABLE `patio_planner`
  ADD COLUMN IF NOT EXISTS `tenantId` int NULL;

CREATE INDEX `idx_patio_planner_tenant` ON `patio_planner` (`tenantId`);
CREATE INDEX `idx_patio_planner_tenant_user` ON `patio_planner` (`tenantId`, `userId`);
CREATE INDEX `idx_patio_planner_tenant_quote` ON `patio_planner` (`tenantId`, `quoteId`);

SET @fallback_tenant_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY CASE WHEN `slug` = 'default' THEN 0 ELSE 1 END, `id`
  LIMIT 1
);

UPDATE `patio_planner` planner
LEFT JOIN `quotes` quote
  ON quote.`id` = planner.`quoteId`
  AND quote.`tenantId` IS NOT NULL
SET planner.`tenantId` = COALESCE(quote.`tenantId`, @fallback_tenant_id)
WHERE planner.`tenantId` IS NULL;
