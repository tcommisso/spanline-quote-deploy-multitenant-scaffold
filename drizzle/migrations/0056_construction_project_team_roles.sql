ALTER TABLE `construction_job_financials`
  ADD COLUMN `technicalDesignerId` INT NULL AFTER `constructionManagerName`,
  ADD COLUMN `technicalDesignerName` VARCHAR(255) NULL AFTER `technicalDesignerId`;
