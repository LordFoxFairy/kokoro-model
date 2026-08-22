ALTER TABLE `model_labels`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `deletedBy` VARCHAR(191) NULL,
  ADD COLUMN `deleteReason` VARCHAR(191) NULL;

ALTER TABLE `model_site_policies`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `deletedBy` VARCHAR(191) NULL,
  ADD COLUMN `deleteReason` VARCHAR(191) NULL;

CREATE INDEX `model_labels_featureKey_status_deletedAt_idx`
  ON `model_labels`(`featureKey`, `status`, `deletedAt`);
CREATE INDEX `model_site_policies_siteId_deletedAt_idx`
  ON `model_site_policies`(`siteId`, `deletedAt`);
