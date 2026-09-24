-- AlterTable
ALTER TABLE `InventoryMovement` ADD COLUMN `saleId` VARCHAR(191) NULL,
    ADD COLUMN `saleLineId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Sale` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `receiptNumber` INTEGER NOT NULL,
    `receiptCode` VARCHAR(40) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `appointmentId` VARCHAR(191) NULL,
    `status` ENUM('COMPLETED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
    `subtotalInCents` INTEGER NOT NULL,
    `discountInCents` INTEGER NOT NULL DEFAULT 0,
    `taxInCents` INTEGER NOT NULL DEFAULT 0,
    `totalInCents` INTEGER NOT NULL,
    `paidInCents` INTEGER NOT NULL,
    `refundedInCents` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `createdById` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(255) NULL,
    `voidedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Sale_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `Sale_locationId_createdAt_idx`(`locationId`, `createdAt`),
    INDEX `Sale_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `Sale_status_idx`(`status`),
    UNIQUE INDEX `Sale_organizationId_locationId_receiptNumber_key`(`organizationId`, `locationId`, `receiptNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleLine` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `type` ENUM('SERVICE', 'PRODUCT') NOT NULL,
    `serviceId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `staffProfileId` VARCHAR(191) NULL,
    `name` VARCHAR(160) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPriceInCents` INTEGER NOT NULL,
    `discountInCents` INTEGER NOT NULL DEFAULT 0,
    `taxInCents` INTEGER NOT NULL DEFAULT 0,
    `totalInCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleLine_organizationId_saleId_idx`(`organizationId`, `saleId`),
    INDEX `SaleLine_serviceId_idx`(`serviceId`),
    INDEX `SaleLine_productId_idx`(`productId`),
    INDEX `SaleLine_staffProfileId_idx`(`staffProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalePayment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `method` ENUM('CASH', 'PAYNOW', 'CARD', 'OTHER') NOT NULL,
    `amountInCents` INTEGER NOT NULL,
    `reference` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalePayment_organizationId_saleId_idx`(`organizationId`, `saleId`),
    INDEX `SalePayment_method_idx`(`method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleRefund` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `amountInCents` INTEGER NOT NULL,
    `method` ENUM('CASH', 'PAYNOW', 'CARD', 'OTHER') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `reference` VARCHAR(120) NULL,
    `processedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleRefund_organizationId_saleId_idx`(`organizationId`, `saleId`),
    INDEX `SaleRefund_saleId_createdAt_idx`(`saleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_saleLineId_fkey` FOREIGN KEY (`saleLineId`) REFERENCES `SaleLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `Appointment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Sale` ADD CONSTRAINT `Sale_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleLine` ADD CONSTRAINT `SaleLine_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalePayment` ADD CONSTRAINT `SalePayment_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleRefund` ADD CONSTRAINT `SaleRefund_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleRefund` ADD CONSTRAINT `SaleRefund_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `Sale`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleRefund` ADD CONSTRAINT `SaleRefund_processedById_fkey` FOREIGN KEY (`processedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
