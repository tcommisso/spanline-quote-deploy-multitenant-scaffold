ALTER TABLE `trade_invoices`
  ADD COLUMN `approvedAmount` decimal(12,2) NULL AFTER `totalWithGst`,
  ADD COLUMN `approvedGstAmount` decimal(12,2) NULL AFTER `approvedAmount`,
  ADD COLUMN `approvedTotalWithGst` decimal(12,2) NULL AFTER `approvedGstAmount`,
  ADD COLUMN `approvalAdjustmentReason` text NULL AFTER `notes`;

ALTER TABLE `trade_invoice_lines`
  ADD COLUMN `approvedAmount` decimal(12,2) NULL AFTER `gstAmount`,
  ADD COLUMN `approvedGstAmount` decimal(12,2) NULL AFTER `approvedAmount`,
  ADD COLUMN `approvalAdjustmentReason` text NULL AFTER `rejectionReason`;
