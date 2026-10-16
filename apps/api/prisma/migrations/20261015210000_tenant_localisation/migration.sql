-- Additive defaults preserve existing tenant data and initialise salon preferences.
ALTER TABLE "tenants"
ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Asia/Singapore',
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-SG';