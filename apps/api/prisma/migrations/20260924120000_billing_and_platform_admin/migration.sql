-- Stripe webhooks are recorded by event id so retries are safe and auditable.
CREATE TABLE `StripeWebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(255) NOT NULL,
    `type` VARCHAR(120) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StripeWebhookEvent_eventId_key`(`eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
