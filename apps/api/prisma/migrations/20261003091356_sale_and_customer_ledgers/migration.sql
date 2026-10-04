-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('HELD', 'COMPLETED', 'VOID');

-- CreateEnum
CREATE TYPE "SaleLineItemType" AS ENUM ('SERVICE', 'PRODUCT', 'PACKAGE', 'VALUE_PACKAGE', 'GIFT_CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "staffId" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'HELD',
    "totalQuantity" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "sessionId" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "soldAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemType" "SaleLineItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_package_holdings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "saleLineId" TEXT,
    "quantity" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_package_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_value_package_holdings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "valuePackageId" TEXT NOT NULL,
    "saleLineId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "amountRemaining" DECIMAL(12,2) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_value_package_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_gift_card_holdings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "saleLineId" TEXT,
    "value" DECIMAL(12,2) NOT NULL,
    "valueRemaining" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_gift_card_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_points" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "point" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_outstandings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "unpaidAmount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_outstandings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_outstanding_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "outstandingId" TEXT NOT NULL,
    "saleId" TEXT,
    "paidAmount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_outstanding_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_redemptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemType" "SaleLineItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2),
    "usedAt" TIMESTAMP(3) NOT NULL,
    "revertedAt" TIMESTAMP(3),
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_performances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemType" "SaleLineItemType" NOT NULL,
    "itemId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_performances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_leaves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "halfDay" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "grantedBy" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_tenantId_soldAt_idx" ON "sales"("tenantId", "soldAt");

-- CreateIndex
CREATE INDEX "sales_tenantId_status_idx" ON "sales"("tenantId", "status");

-- CreateIndex
CREATE INDEX "sales_customerId_soldAt_idx" ON "sales"("customerId", "soldAt");

-- CreateIndex
CREATE INDEX "sale_lines_tenantId_idx" ON "sale_lines"("tenantId");

-- CreateIndex
CREATE INDEX "sale_lines_saleId_idx" ON "sale_lines"("saleId");

-- CreateIndex
CREATE INDEX "sale_lines_tenantId_itemType_idx" ON "sale_lines"("tenantId", "itemType");

-- CreateIndex
CREATE INDEX "customer_package_holdings_tenantId_idx" ON "customer_package_holdings"("tenantId");

-- CreateIndex
CREATE INDEX "customer_package_holdings_customerId_idx" ON "customer_package_holdings"("customerId");

-- CreateIndex
CREATE INDEX "customer_value_package_holdings_tenantId_idx" ON "customer_value_package_holdings"("tenantId");

-- CreateIndex
CREATE INDEX "customer_value_package_holdings_customerId_idx" ON "customer_value_package_holdings"("customerId");

-- CreateIndex
CREATE INDEX "customer_gift_card_holdings_tenantId_idx" ON "customer_gift_card_holdings"("tenantId");

-- CreateIndex
CREATE INDEX "customer_gift_card_holdings_customerId_idx" ON "customer_gift_card_holdings"("customerId");

-- CreateIndex
CREATE INDEX "customer_points_tenantId_customerId_idx" ON "customer_points"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_outstandings_saleId_key" ON "customer_outstandings"("saleId");

-- CreateIndex
CREATE INDEX "customer_outstandings_tenantId_idx" ON "customer_outstandings"("tenantId");

-- CreateIndex
CREATE INDEX "customer_outstandings_customerId_idx" ON "customer_outstandings"("customerId");

-- CreateIndex
CREATE INDEX "customer_outstanding_payments_tenantId_customerId_idx" ON "customer_outstanding_payments"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_outstanding_payments_outstandingId_idx" ON "customer_outstanding_payments"("outstandingId");

-- CreateIndex
CREATE INDEX "customer_redemptions_tenantId_customerId_idx" ON "customer_redemptions"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_redemptions_tenantId_itemType_itemId_idx" ON "customer_redemptions"("tenantId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "employee_performances_tenantId_userId_idx" ON "employee_performances"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "employee_performances_saleId_idx" ON "employee_performances"("saleId");

-- CreateIndex
CREATE INDEX "employee_leaves_tenantId_userId_idx" ON "employee_leaves"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "employee_leaves_tenantId_fromDate_idx" ON "employee_leaves"("tenantId", "fromDate");

-- AddForeignKey
ALTER TABLE "employee_commissions" ADD CONSTRAINT "employee_commissions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_package_holdings" ADD CONSTRAINT "customer_package_holdings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_package_holdings" ADD CONSTRAINT "customer_package_holdings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_package_holdings" ADD CONSTRAINT "customer_package_holdings_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_package_holdings" ADD CONSTRAINT "customer_package_holdings_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_value_package_holdings" ADD CONSTRAINT "customer_value_package_holdings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_value_package_holdings" ADD CONSTRAINT "customer_value_package_holdings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_value_package_holdings" ADD CONSTRAINT "customer_value_package_holdings_valuePackageId_fkey" FOREIGN KEY ("valuePackageId") REFERENCES "value_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_value_package_holdings" ADD CONSTRAINT "customer_value_package_holdings_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_gift_card_holdings" ADD CONSTRAINT "customer_gift_card_holdings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_gift_card_holdings" ADD CONSTRAINT "customer_gift_card_holdings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_gift_card_holdings" ADD CONSTRAINT "customer_gift_card_holdings_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "gift_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_gift_card_holdings" ADD CONSTRAINT "customer_gift_card_holdings_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points" ADD CONSTRAINT "customer_points_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points" ADD CONSTRAINT "customer_points_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points" ADD CONSTRAINT "customer_points_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstandings" ADD CONSTRAINT "customer_outstandings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstandings" ADD CONSTRAINT "customer_outstandings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstandings" ADD CONSTRAINT "customer_outstandings_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstanding_payments" ADD CONSTRAINT "customer_outstanding_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstanding_payments" ADD CONSTRAINT "customer_outstanding_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstanding_payments" ADD CONSTRAINT "customer_outstanding_payments_outstandingId_fkey" FOREIGN KEY ("outstandingId") REFERENCES "customer_outstandings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_outstanding_payments" ADD CONSTRAINT "customer_outstanding_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_redemptions" ADD CONSTRAINT "customer_redemptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_redemptions" ADD CONSTRAINT "customer_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_redemptions" ADD CONSTRAINT "customer_redemptions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_performances" ADD CONSTRAINT "employee_performances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_performances" ADD CONSTRAINT "employee_performances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_performances" ADD CONSTRAINT "employee_performances_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leaves" ADD CONSTRAINT "employee_leaves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
