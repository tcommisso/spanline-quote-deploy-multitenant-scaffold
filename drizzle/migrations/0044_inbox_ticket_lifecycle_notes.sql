ALTER TABLE `inbox_tickets`
  MODIFY COLUMN `status` enum('new','open','waiting_customer','waiting_internal','customer_replied','resolved','closed','spam') NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS `queue` varchar(50) NULL AFTER `receivedByAddress`,
  ADD COLUMN IF NOT EXISTS `waitingOn` enum('customer','internal','staff','none') NOT NULL DEFAULT 'staff' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `lastResponderName` varchar(255) NULL AFTER `assignedAt`,
  ADD COLUMN IF NOT EXISTS `lastResponderEmail` varchar(320) NULL AFTER `lastResponderName`;

CREATE TABLE IF NOT EXISTS `inbox_ticket_notes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tenantId` int NULL,
  `ticketId` int NOT NULL,
  `body` text NOT NULL,
  `createdBy` int NULL,
  `createdByName` varchar(100) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_inbox_ticket_notes_tenant_ticket` (`tenantId`, `ticketId`),
  KEY `idx_inbox_ticket_notes_ticket` (`ticketId`)
);
