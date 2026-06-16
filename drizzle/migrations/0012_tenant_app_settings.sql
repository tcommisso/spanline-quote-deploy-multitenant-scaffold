SET @tenant_backfill_id := (
  SELECT `id`
  FROM `tenants`
  ORDER BY (`status` = 'active') DESC, `id` ASC
  LIMIT 1
);

ALTER TABLE `tenant_settings`
  ADD COLUMN `appSettings` json NULL AFTER `featureFlags`;

INSERT INTO `tenant_settings` (`tenantId`, `companyDetails`, `branding`, `featureFlags`, `appSettings`)
SELECT
  @tenant_backfill_id,
  NULL,
  NULL,
  JSON_OBJECT(),
  (SELECT COALESCE(JSON_OBJECTAGG(`settingKey`, `value`), JSON_OBJECT()) FROM `global_settings`)
WHERE @tenant_backfill_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  `appSettings` = COALESCE(`tenant_settings`.`appSettings`, VALUES(`appSettings`));

UPDATE `tenant_settings`
SET `appSettings` = (SELECT COALESCE(JSON_OBJECTAGG(`settingKey`, `value`), JSON_OBJECT()) FROM `global_settings`)
WHERE `tenantId` = @tenant_backfill_id
  AND `appSettings` IS NULL;
