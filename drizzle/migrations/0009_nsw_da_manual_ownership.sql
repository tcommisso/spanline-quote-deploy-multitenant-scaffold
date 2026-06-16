ALTER TABLE `nsw_da_applications`
  ADD COLUMN `is_ours` boolean NOT NULL DEFAULT false,
  ADD KEY `idx_nsw_da_is_ours` (`is_ours`);
