ALTER TABLE `crm_appointments`
  ADD COLUMN IF NOT EXISTS `participants` json NULL,
  ADD COLUMN IF NOT EXISTS `calendarSyncStatus` varchar(32) NOT NULL DEFAULT 'not_synced',
  ADD COLUMN IF NOT EXISTS `calendarSyncError` text NULL,
  ADD COLUMN IF NOT EXISTS `calendarSyncedAt` timestamp NULL;

UPDATE `crm_appointments`
SET `calendarSyncStatus` = CASE
  WHEN `nylasEventId` IS NOT NULL AND `nylasEventId` != '' THEN 'synced'
  ELSE 'not_synced'
END;
