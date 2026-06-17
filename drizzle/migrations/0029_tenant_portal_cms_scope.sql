ALTER TABLE `portal_news`
  ADD COLUMN `tenantId` int NULL;

ALTER TABLE `portal_products`
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

UPDATE `portal_news`
SET `tenantId` = @fallbackTenantId
WHERE `tenantId` IS NULL;

UPDATE `portal_products`
SET `tenantId` = @fallbackTenantId
WHERE `tenantId` IS NULL;

CREATE INDEX `idx_portal_news_tenant` ON `portal_news` (`tenantId`);
CREATE INDEX `idx_portal_news_tenant_type` ON `portal_news` (`tenantId`, `portalType`);
CREATE INDEX `idx_portal_products_tenant` ON `portal_products` (`tenantId`);
CREATE INDEX `idx_portal_products_tenant_active` ON `portal_products` (`tenantId`, `isActive`);
