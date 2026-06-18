CREATE TABLE IF NOT EXISTS `inbox_tickets` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NULL,
  `threadId` varchar(128) NOT NULL,
  `subject` varchar(1000) NULL,
  `requesterEmail` varchar(320) NULL,
  `requesterName` varchar(255) NULL,
  `receivedByAddress` varchar(320) NULL,
  `channel` enum('email','phone','web','portal','manual') NOT NULL DEFAULT 'email',
  `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status` enum('new','open','waiting_customer','customer_replied','closed','spam') NOT NULL DEFAULT 'new',
  `assignedToId` int NULL,
  `assignedToName` varchar(100) NULL,
  `assignedAt` timestamp NULL DEFAULT NULL,
  `matchedJobId` int NULL,
  `matchedLeadId` int NULL,
  `matchedClientEmail` varchar(320) NULL,
  `firstMessageId` int NULL,
  `latestMessageId` int NULL,
  `latestDirection` enum('inbound','outbound') NULL,
  `messageCount` int NOT NULL DEFAULT 0,
  `unreadCount` int NOT NULL DEFAULT 0,
  `isStarred` tinyint(1) NOT NULL DEFAULT 0,
  `lastInboundAt` timestamp NULL DEFAULT NULL,
  `lastOutboundAt` timestamp NULL DEFAULT NULL,
  `lastMessageAt` timestamp NULL DEFAULT NULL,
  `slaWarningAt` timestamp NULL DEFAULT NULL,
  `slaDueAt` timestamp NULL DEFAULT NULL,
  `slaBreachedAt` timestamp NULL DEFAULT NULL,
  `resolvedAt` timestamp NULL DEFAULT NULL,
  `resolvedBy` int NULL,
  `resolvedByName` varchar(100) NULL,
  `resolutionNotes` text NULL,
  `closedReason` varchar(100) NULL,
  `createdBy` int NULL,
  `createdByName` varchar(100) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_inbox_tickets_tenant_thread` (`tenantId`, `threadId`),
  KEY `idx_inbox_tickets_tenant` (`tenantId`),
  KEY `idx_inbox_tickets_tenant_status` (`tenantId`, `status`),
  KEY `idx_inbox_tickets_tenant_assignee` (`tenantId`, `assignedToId`),
  KEY `idx_inbox_tickets_tenant_last_message` (`tenantId`, `lastMessageAt`)
);

CREATE TABLE IF NOT EXISTS `inbox_ticket_tags` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `ticketId` int NOT NULL,
  `tagId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_inbox_ticket_tags_ticket_tag` (`ticketId`, `tagId`),
  KEY `idx_inbox_ticket_tags_ticket` (`ticketId`),
  KEY `idx_inbox_ticket_tags_tag` (`tagId`)
);

INSERT INTO `inbox_tickets` (
  `tenantId`,
  `threadId`,
  `subject`,
  `requesterEmail`,
  `requesterName`,
  `receivedByAddress`,
  `channel`,
  `priority`,
  `status`,
  `assignedToId`,
  `assignedToName`,
  `assignedAt`,
  `matchedJobId`,
  `matchedLeadId`,
  `matchedClientEmail`,
  `firstMessageId`,
  `latestMessageId`,
  `latestDirection`,
  `messageCount`,
  `unreadCount`,
  `isStarred`,
  `lastInboundAt`,
  `lastOutboundAt`,
  `lastMessageAt`,
  `resolvedAt`,
  `createdBy`,
  `createdByName`,
  `createdAt`,
  `updatedAt`
)
SELECT
  grouped.`tenantId`,
  grouped.`threadId`,
  latest.`subject`,
  COALESCE(first_inbound.`fromAddress`, latest.`fromAddress`) AS `requesterEmail`,
  COALESCE(first_inbound.`fromName`, latest.`fromName`) AS `requesterName`,
  COALESCE(latest.`receivedByAddress`, first_inbound.`receivedByAddress`) AS `receivedByAddress`,
  'email' AS `channel`,
  'normal' AS `priority`,
  CASE
    WHEN latest.`status` = 'spam' THEN 'spam'
    WHEN latest.`status` = 'closed' THEN 'closed'
    WHEN latest.`direction` = 'outbound' THEN 'waiting_customer'
    WHEN grouped.`lastOutboundAt` IS NOT NULL
      AND grouped.`lastInboundAt` IS NOT NULL
      AND grouped.`lastInboundAt` > grouped.`lastOutboundAt` THEN 'customer_replied'
    WHEN grouped.`unreadCount` > 0 OR latest.`status` = 'new' THEN 'new'
    ELSE 'open'
  END AS `status`,
  latest.`assignedToId`,
  latest.`assignedToName`,
  latest.`assignedAt`,
  latest.`matchedJobId`,
  latest.`matchedLeadId`,
  latest.`matchedClientEmail`,
  grouped.`firstMessageId`,
  grouped.`latestMessageId`,
  latest.`direction` AS `latestDirection`,
  grouped.`messageCount`,
  grouped.`unreadCount`,
  grouped.`isStarred`,
  grouped.`lastInboundAt`,
  grouped.`lastOutboundAt`,
  grouped.`lastMessageAt`,
  CASE WHEN latest.`status` = 'closed' THEN latest.`updatedAt` ELSE NULL END AS `resolvedAt`,
  latest.`createdBy`,
  latest.`createdByName`,
  grouped.`createdAt`,
  grouped.`lastMessageAt`
FROM (
  SELECT
    `tenantId`,
    `threadId`,
    MIN(`id`) AS `firstMessageId`,
    MAX(`id`) AS `latestMessageId`,
    COUNT(*) AS `messageCount`,
    SUM(CASE WHEN `direction` = 'inbound' AND `isRead` = 0 THEN 1 ELSE 0 END) AS `unreadCount`,
    MAX(CASE WHEN `isStarred` = 1 THEN 1 ELSE 0 END) AS `isStarred`,
    MAX(CASE WHEN `direction` = 'inbound' THEN `createdAt` ELSE NULL END) AS `lastInboundAt`,
    MAX(CASE WHEN `direction` = 'outbound' THEN `createdAt` ELSE NULL END) AS `lastOutboundAt`,
    MAX(`createdAt`) AS `lastMessageAt`,
    MIN(`createdAt`) AS `createdAt`
  FROM `inbox_messages`
  GROUP BY `tenantId`, `threadId`
) grouped
JOIN `inbox_messages` latest
  ON latest.`id` = grouped.`latestMessageId`
LEFT JOIN (
  SELECT m.*
  FROM `inbox_messages` m
  JOIN (
    SELECT
      `tenantId`,
      `threadId`,
      MIN(`id`) AS `firstInboundMessageId`
    FROM `inbox_messages`
    WHERE `direction` = 'inbound'
    GROUP BY `tenantId`, `threadId`
  ) first_ids
    ON first_ids.`firstInboundMessageId` = m.`id`
) first_inbound
  ON first_inbound.`threadId` = grouped.`threadId`
  AND (first_inbound.`tenantId` <=> grouped.`tenantId`)
ON DUPLICATE KEY UPDATE
  `subject` = VALUES(`subject`),
  `requesterEmail` = COALESCE(`inbox_tickets`.`requesterEmail`, VALUES(`requesterEmail`)),
  `requesterName` = COALESCE(`inbox_tickets`.`requesterName`, VALUES(`requesterName`)),
  `receivedByAddress` = COALESCE(VALUES(`receivedByAddress`), `inbox_tickets`.`receivedByAddress`),
  `assignedToId` = VALUES(`assignedToId`),
  `assignedToName` = VALUES(`assignedToName`),
  `assignedAt` = VALUES(`assignedAt`),
  `matchedJobId` = VALUES(`matchedJobId`),
  `matchedLeadId` = VALUES(`matchedLeadId`),
  `matchedClientEmail` = VALUES(`matchedClientEmail`),
  `firstMessageId` = VALUES(`firstMessageId`),
  `latestMessageId` = VALUES(`latestMessageId`),
  `latestDirection` = VALUES(`latestDirection`),
  `messageCount` = VALUES(`messageCount`),
  `unreadCount` = VALUES(`unreadCount`),
  `isStarred` = VALUES(`isStarred`),
  `lastInboundAt` = VALUES(`lastInboundAt`),
  `lastOutboundAt` = VALUES(`lastOutboundAt`),
  `lastMessageAt` = VALUES(`lastMessageAt`),
  `updatedAt` = VALUES(`updatedAt`);

INSERT IGNORE INTO `inbox_ticket_tags` (`ticketId`, `tagId`, `createdAt`)
SELECT
  t.`id`,
  mt.`tagId`,
  MIN(mt.`createdAt`)
FROM `inbox_message_tags` mt
JOIN `inbox_messages` m
  ON m.`id` = mt.`messageId`
JOIN `inbox_tickets` t
  ON t.`threadId` = m.`threadId`
  AND (t.`tenantId` <=> m.`tenantId`)
GROUP BY t.`id`, mt.`tagId`;
