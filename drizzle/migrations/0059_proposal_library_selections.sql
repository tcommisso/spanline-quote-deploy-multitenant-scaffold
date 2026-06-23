ALTER TABLE `proposals`
  ADD COLUMN `proposalLibraryItemIds` JSON NULL AFTER `progressPayments`;
