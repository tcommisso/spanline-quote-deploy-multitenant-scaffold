ALTER TABLE `cpc_plans`
  ADD COLUMN `tenantId` int NULL;

ALTER TABLE `cpc_subscriptions`
  ADD COLUMN `tenantId` int NULL;

ALTER TABLE `cpc_service_history`
  ADD COLUMN `tenantId` int NULL;

SET @activeTenantId := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id`
  LIMIT 1
);

SET @fallbackTenantId := COALESCE(@activeTenantId, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id`
  LIMIT 1
));

UPDATE `cpc_plans`
SET `tenantId` = @fallbackTenantId
WHERE `tenantId` IS NULL;

UPDATE `cpc_subscriptions` cs
LEFT JOIN `portal_access` pa ON pa.`id` = cs.`portalAccessId`
LEFT JOIN `construction_jobs` cj ON cj.`id` = cs.`constructionJobId`
SET cs.`tenantId` = COALESCE(pa.`tenantId`, cj.`tenantId`, @fallbackTenantId)
WHERE cs.`tenantId` IS NULL;

UPDATE `cpc_service_history` csh
LEFT JOIN `cpc_subscriptions` cs ON cs.`id` = csh.`subscriptionId`
SET csh.`tenantId` = COALESCE(cs.`tenantId`, @fallbackTenantId)
WHERE csh.`tenantId` IS NULL;

CREATE INDEX `idx_cpc_plans_tenant` ON `cpc_plans` (`tenantId`);
CREATE INDEX `idx_cpc_plans_tenant_active` ON `cpc_plans` (`tenantId`, `isActive`);

CREATE INDEX `idx_cpc_subscriptions_tenant` ON `cpc_subscriptions` (`tenantId`);
CREATE INDEX `idx_cpc_subscriptions_tenant_portal` ON `cpc_subscriptions` (`tenantId`, `portalAccessId`);
CREATE INDEX `idx_cpc_subscriptions_tenant_job` ON `cpc_subscriptions` (`tenantId`, `constructionJobId`);

CREATE INDEX `idx_cpc_service_history_tenant` ON `cpc_service_history` (`tenantId`);
CREATE INDEX `idx_cpc_service_history_tenant_subscription` ON `cpc_service_history` (`tenantId`, `subscriptionId`);
