-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NULL,
    `email` VARCHAR(254) NULL,
    `phone` VARCHAR(40) NULL,
    `dateOfBirth` DATE NULL,
    `gender` ENUM('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED') NULL,
    `addressLine1` VARCHAR(200) NULL,
    `addressLine2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `postalCode` VARCHAR(30) NULL,
    `countryCode` CHAR(2) NOT NULL DEFAULT 'SG',
    `memberNumber` VARCHAR(40) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_organizationId_isActive_idx`(`organizationId`, `isActive`),
    INDEX `Customer_organizationId_lastName_firstName_idx`(`organizationId`, `lastName`, `firstName`),
    UNIQUE INDEX `Customer_organizationId_email_key`(`organizationId`, `email`),
    UNIQUE INDEX `Customer_organizationId_phone_key`(`organizationId`, `phone`),
    UNIQUE INDEX `Customer_organizationId_memberNumber_key`(`organizationId`, `memberNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerNote` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `authorUserId` VARCHAR(191) NULL,
    `body` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerNote_organizationId_customerId_createdAt_idx`(`organizationId`, `customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffProfile` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `membershipId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(160) NULL,
    `jobTitle` VARCHAR(120) NULL,
    `bio` VARCHAR(500) NULL,
    `color` CHAR(7) NULL,
    `isBookable` BOOLEAN NOT NULL DEFAULT true,
    `hireDate` DATE NULL,
    `endDate` DATE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffProfile_membershipId_key`(`membershipId`),
    INDEX `StaffProfile_organizationId_isActive_idx`(`organizationId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffServiceAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `staffProfileId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StaffServiceAssignment_organizationId_serviceId_idx`(`organizationId`, `serviceId`),
    UNIQUE INDEX `StaffServiceAssignment_organizationId_staffProfileId_service_key`(`organizationId`, `staffProfileId`, `serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `staffProfileId` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `startsAt` CHAR(5) NULL,
    `endsAt` CHAR(5) NULL,
    `isWorking` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffSchedule_organizationId_staffProfileId_dayOfWeek_key`(`organizationId`, `staffProfileId`, `dayOfWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffTimeOff` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `staffProfileId` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffTimeOff_organizationId_staffProfileId_startsAt_idx`(`organizationId`, `staffProfileId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNote` ADD CONSTRAINT `CustomerNote_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNote` ADD CONSTRAINT `CustomerNote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerNote` ADD CONSTRAINT `CustomerNote_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffProfile` ADD CONSTRAINT `StaffProfile_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffProfile` ADD CONSTRAINT `StaffProfile_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `OrganizationMembership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffServiceAssignment` ADD CONSTRAINT `StaffServiceAssignment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffServiceAssignment` ADD CONSTRAINT `StaffServiceAssignment_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffServiceAssignment` ADD CONSTRAINT `StaffServiceAssignment_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `Service`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSchedule` ADD CONSTRAINT `StaffSchedule_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffSchedule` ADD CONSTRAINT `StaffSchedule_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffTimeOff` ADD CONSTRAINT `StaffTimeOff_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffTimeOff` ADD CONSTRAINT `StaffTimeOff_staffProfileId_fkey` FOREIGN KEY (`staffProfileId`) REFERENCES `StaffProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StaffTimeOff` ADD CONSTRAINT `StaffTimeOff_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
