ALTER TABLE `user_notification_preferences`
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

UPDATE `user_notification_preferences`
SET `tenantId` = @fallbackTenantId
WHERE `tenantId` IS NULL;

DELETE p1
FROM `user_notification_preferences` p1
JOIN `user_notification_preferences` p2
  ON COALESCE(p1.`tenantId`, 0) = COALESCE(p2.`tenantId`, 0)
  AND p1.`userId` = p2.`userId`
  AND p1.`eventType` = p2.`eventType`
  AND p1.`id` < p2.`id`;

CREATE INDEX `idx_user_notification_preferences_tenant` ON `user_notification_preferences` (`tenantId`);
CREATE INDEX `idx_user_notification_preferences_user_tenant` ON `user_notification_preferences` (`tenantId`, `userId`);
CREATE INDEX `idx_user_notification_preferences_tenant_event` ON `user_notification_preferences` (`tenantId`, `eventType`);
