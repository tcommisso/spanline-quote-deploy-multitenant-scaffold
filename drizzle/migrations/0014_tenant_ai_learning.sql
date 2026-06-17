SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY (`status` = 'active') DESC, `id` ASC
  LIMIT 1
);

ALTER TABLE `ai_prompts`
  DROP INDEX `ai_prompts_key_unique`,
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_ai_prompts_tenant` (`tenantId`),
  ADD UNIQUE KEY `uq_ai_prompts_tenant_key` (`tenantId`, `key`),
  ADD CONSTRAINT `fk_ai_prompts_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

ALTER TABLE `ai_knowledge_chunks`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_ai_knowledge_tenant` (`tenantId`),
  ADD KEY `idx_ai_knowledge_tenant_active` (`tenantId`, `is_active`),
  ADD CONSTRAINT `fk_ai_knowledge_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

ALTER TABLE `ai_feedback`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_ai_feedback_tenant` (`tenantId`),
  ADD CONSTRAINT `fk_ai_feedback_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

ALTER TABLE `ai_few_shot_examples`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_ai_fewshot_tenant` (`tenantId`),
  ADD CONSTRAINT `fk_ai_fewshot_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

ALTER TABLE `ai_corrections`
  ADD COLUMN `tenantId` int NULL,
  ADD KEY `idx_ai_correction_tenant` (`tenantId`),
  ADD CONSTRAINT `fk_ai_correction_tenant` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE;

UPDATE `ai_prompts`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `ai_knowledge_chunks`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `ai_feedback`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `ai_few_shot_examples`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;

UPDATE `ai_corrections`
SET `tenantId` = @tenant_backfill_id
WHERE `tenantId` IS NULL;
