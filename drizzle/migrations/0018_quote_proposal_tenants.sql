ALTER TABLE `deck_quotes` ADD COLUMN `tenantId` int NULL;
ALTER TABLE `deck_quotes` ADD INDEX `idx_deck_quotes_tenant` (`tenantId`);

ALTER TABLE `eclipse_quotes` ADD COLUMN `tenantId` int NULL;
ALTER TABLE `eclipse_quotes` ADD INDEX `idx_eclipse_quotes_tenant` (`tenantId`);

ALTER TABLE `proposals` ADD COLUMN `tenantId` int NULL;
ALTER TABLE `proposals` ADD INDEX `idx_proposals_tenant` (`tenantId`);

UPDATE `deck_quotes` dq
LEFT JOIN `crm_leads` l ON l.`id` = dq.`clientId`
SET dq.`tenantId` = l.`tenantId`
WHERE dq.`tenantId` IS NULL
  AND l.`tenantId` IS NOT NULL;

UPDATE `eclipse_quotes` eq
LEFT JOIN `crm_leads` l ON l.`id` = eq.`clientId`
SET eq.`tenantId` = l.`tenantId`
WHERE eq.`tenantId` IS NULL
  AND l.`tenantId` IS NOT NULL;

UPDATE `proposals` p
LEFT JOIN `crm_leads` l ON l.`id` = p.`clientId`
SET p.`tenantId` = l.`tenantId`
WHERE p.`tenantId` IS NULL
  AND l.`tenantId` IS NOT NULL;

UPDATE `deck_quotes`
SET `tenantId` = (SELECT `id` FROM `tenants` ORDER BY `id` LIMIT 1)
WHERE `tenantId` IS NULL;

UPDATE `eclipse_quotes`
SET `tenantId` = (SELECT `id` FROM `tenants` ORDER BY `id` LIMIT 1)
WHERE `tenantId` IS NULL;

UPDATE `proposals`
SET `tenantId` = (SELECT `id` FROM `tenants` ORDER BY `id` LIMIT 1)
WHERE `tenantId` IS NULL;
