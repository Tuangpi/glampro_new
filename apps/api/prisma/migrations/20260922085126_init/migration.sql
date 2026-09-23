-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `firstName` VARCHAR(80) NOT NULL,
    `lastName` VARCHAR(80) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `avatarUrl` VARCHAR(500) NULL,
    `platformRole` ENUM('USER', 'PLATFORM_ADMIN') NOT NULL DEFAULT 'USER',
    `emailVerifiedAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_emailVerifiedAt_idx`(`emailVerifiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCredential` (
    `userId` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenFamilyId` VARCHAR(64) NOT NULL,
    `refreshTokenHash` VARCHAR(255) NOT NULL,
    `userAgent` VARCHAR(500) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `rotatedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AuthSession_refreshTokenHash_key`(`refreshTokenHash`),
    INDEX `AuthSession_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `AuthSession_tokenFamilyId_idx`(`tokenFamilyId`),
    INDEX `AuthSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
    INDEX `PasswordResetToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'TRIAL',
    `legalName` VARCHAR(200) NULL,
    `registrationNumber` VARCHAR(80) NULL,
    `gstRegistrationNumber` VARCHAR(80) NULL,
    `defaultCurrency` CHAR(3) NOT NULL DEFAULT 'SGD',
    `defaultTimezone` VARCHAR(100) NOT NULL DEFAULT 'Asia/Singapore',
    `logoUrl` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Organization_slug_key`(`slug`),
    INDEX `Organization_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationMembership` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('ORG_OWNER', 'ORG_ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF') NOT NULL,
    `status` ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrganizationMembership_userId_status_idx`(`userId`, `status`),
    INDEX `OrganizationMembership_organizationId_role_status_idx`(`organizationId`, `role`, `status`),
    UNIQUE INDEX `OrganizationMembership_organizationId_userId_key`(`organizationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrganizationInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `role` ENUM('ORG_OWNER', 'ORG_ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF') NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `tokenHash` VARCHAR(255) NOT NULL,
    `invitedById` VARCHAR(191) NOT NULL,
    `acceptedById` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrganizationInvitation_tokenHash_key`(`tokenHash`),
    INDEX `OrganizationInvitation_organizationId_email_status_idx`(`organizationId`, `email`, `status`),
    INDEX `OrganizationInvitation_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(254) NULL,
    `addressLine1` VARCHAR(200) NULL,
    `addressLine2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `postalCode` VARCHAR(30) NULL,
    `countryCode` CHAR(2) NOT NULL DEFAULT 'SG',
    `timezone` VARCHAR(100) NOT NULL DEFAULT 'Asia/Singapore',
    `currency` CHAR(3) NOT NULL DEFAULT 'SGD',
    `pricesIncludeTax` BOOLEAN NOT NULL DEFAULT true,
    `receiptPrefix` VARCHAR(20) NOT NULL DEFAULT 'SALE',
    `nextReceiptNumber` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Location_organizationId_isActive_idx`(`organizationId`, `isActive`),
    UNIQUE INDEX `Location_organizationId_code_key`(`organizationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessHour` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `opensAt` CHAR(5) NULL,
    `closesAt` CHAR(5) NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BusinessHour_locationId_dayOfWeek_key`(`locationId`, `dayOfWeek`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(30) NOT NULL DEFAULT 'stripe',
    `providerCustomerId` VARCHAR(120) NULL,
    `providerSubscriptionId` VARCHAR(120) NULL,
    `planCode` VARCHAR(60) NOT NULL,
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'INCOMPLETE') NOT NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `currentPeriodStartsAt` DATETIME(3) NULL,
    `currentPeriodEndsAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_providerCustomerId_key`(`providerCustomerId`),
    UNIQUE INDEX `Subscription_providerSubscriptionId_key`(`providerSubscriptionId`),
    INDEX `Subscription_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorType` ENUM('USER', 'PLATFORM_ADMIN', 'SYSTEM', 'WEBHOOK') NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `entityType` VARCHAR(100) NULL,
    `entityId` VARCHAR(100) NULL,
    `requestId` VARCHAR(100) NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserCredential` ADD CONSTRAINT `UserCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationMembership` ADD CONSTRAINT `OrganizationMembership_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationMembership` ADD CONSTRAINT `OrganizationMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationInvitation` ADD CONSTRAINT `OrganizationInvitation_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationInvitation` ADD CONSTRAINT `OrganizationInvitation_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrganizationInvitation` ADD CONSTRAINT `OrganizationInvitation_acceptedById_fkey` FOREIGN KEY (`acceptedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BusinessHour` ADD CONSTRAINT `BusinessHour_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
