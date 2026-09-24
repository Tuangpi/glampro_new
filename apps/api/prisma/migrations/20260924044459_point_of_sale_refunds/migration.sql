-- AlterTable
ALTER TABLE `SaleLine` ADD COLUMN `inventoryTracked` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `SaleRefundLine` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `refundId` VARCHAR(191) NOT NULL,
    `saleLineId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleRefundLine_organizationId_saleLineId_idx`(`organizationId`, `saleLineId`),
    UNIQUE INDEX `SaleRefundLine_refundId_saleLineId_key`(`refundId`, `saleLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SaleRefundLine` ADD CONSTRAINT `SaleRefundLine_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleRefundLine` ADD CONSTRAINT `SaleRefundLine_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `SaleRefund`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleRefundLine` ADD CONSTRAINT `SaleRefundLine_saleLineId_fkey` FOREIGN KEY (`saleLineId`) REFERENCES `SaleLine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
