-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
