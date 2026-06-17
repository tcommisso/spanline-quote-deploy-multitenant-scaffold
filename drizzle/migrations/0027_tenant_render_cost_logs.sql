ALTER TABLE `render_cost_logs`
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

UPDATE `render_cost_logs`
SET `tenantId` = @fallbackTenantId
WHERE `tenantId` IS NULL;

CREATE INDEX `idx_render_cost_logs_tenant` ON `render_cost_logs` (`tenantId`);
CREATE INDEX `idx_render_cost_logs_tenant_created` ON `render_cost_logs` (`tenantId`, `createdAt`);
CREATE INDEX `idx_render_cost_logs_tenant_user` ON `render_cost_logs` (`tenantId`, `userId`);
