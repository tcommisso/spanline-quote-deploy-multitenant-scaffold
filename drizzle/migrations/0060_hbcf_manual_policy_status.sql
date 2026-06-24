ALTER TABLE `hbcf_certificates`
  ADD COLUMN `policyStatusGroup` varchar(32) NULL AFTER `status`,
  ADD KEY `idx_hbcf_certificates_policy_status_group` (`policyStatusGroup`);
