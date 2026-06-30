ALTER TABLE `project_subcontracts`
  MODIFY COLUMN `status` enum('draft','sent','signed','cancelled','declined','on_file') NOT NULL DEFAULT 'draft',
  ADD COLUMN `contractSource` enum('generated','manual_on_file') NOT NULL DEFAULT 'generated' AFTER `status`,
  ADD COLUMN `onFileAt` timestamp NULL AFTER `contractSource`,
  ADD COLUMN `onFileNotes` text NULL AFTER `onFileAt`;
