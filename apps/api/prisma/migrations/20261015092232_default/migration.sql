-- CreateEnum
CREATE TYPE "ShiftKind" AS ENUM ('WORK', 'BREAK');

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startsAtMinute" INTEGER NOT NULL,
    "endsAtMinute" INTEGER NOT NULL,
    "kind" "ShiftKind" NOT NULL DEFAULT 'WORK',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_shifts_tenantId_userId_dayOfWeek_startsAtMinute_idx" ON "staff_shifts"("tenantId", "userId", "dayOfWeek", "startsAtMinute");

-- CreateIndex
CREATE INDEX "staff_shifts_tenantId_dayOfWeek_idx" ON "staff_shifts"("tenantId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
