-- Add the salon's tenant-wide operating hours, one row per salon.
CREATE TABLE "tenant_operating_hours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sundayOpen" TEXT,
    "sundayClose" TEXT,
    "mondayOpen" TEXT,
    "mondayClose" TEXT,
    "tuesdayOpen" TEXT,
    "tuesdayClose" TEXT,
    "wednesdayOpen" TEXT,
    "wednesdayClose" TEXT,
    "thursdayOpen" TEXT,
    "thursdayClose" TEXT,
    "fridayOpen" TEXT,
    "fridayClose" TEXT,
    "saturdayOpen" TEXT,
    "saturdayClose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_operating_hours_tenantId_key" ON "tenant_operating_hours"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_operating_hours" ADD CONSTRAINT "tenant_operating_hours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
