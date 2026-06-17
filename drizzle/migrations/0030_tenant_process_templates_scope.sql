SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  WHERE `status` = 'active'
  ORDER BY `id` ASC
  LIMIT 1
);

SET @tenant_backfill_id := COALESCE(@tenant_backfill_id, (
  SELECT `id`
  FROM `tenants`
  ORDER BY `id` ASC
  LIMIT 1
));

ALTER TABLE `order_templates`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_order_templates_tenant` (`tenantId`),
  ADD KEY `idx_order_templates_tenant_active` (`tenantId`, `isActive`),
  ADD CONSTRAINT `fk_order_templates_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

ALTER TABLE `construction_kanban_templates`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_construction_kanban_templates_tenant` (`tenantId`),
  ADD KEY `idx_construction_kanban_templates_tenant_active` (`tenantId`, `active`),
  ADD CONSTRAINT `fk_construction_kanban_templates_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`);

UPDATE `order_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;

UPDATE `construction_kanban_templates`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL
  AND @tenant_backfill_id IS NOT NULL;
