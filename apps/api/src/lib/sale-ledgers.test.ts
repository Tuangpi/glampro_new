/**
 * The POS and the customer ledgers, against the real database.
 *
 * Two things here are not covered by the general isolation suite and are easy to
 * get wrong:
 *
 * - **`SaleLine.itemId` has no foreign key**, deliberately, because it is
 *   polymorphic across five catalogues. That is a real hole in referential
 *   integrity, so it is asserted here as a *consequence* — a receipt must still
 *   read after the catalogue row is gone — rather than left as a surprise.
 * - **The ledgers hang off the customer as well as the sale**, so each carries
 *   its own `tenantId`. A redemption queried per customer must still be scoped,
 *   which is why every model here is in `TENANT_SCOPED_MODELS`.
 *
 * Skipped with a clear message when `DATABASE_URL` is absent.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { runAsPlatform, runAsTenant } from "./tenant-context.js";
import { prisma } from "./prisma.js";

const databaseUrl = process.env["DATABASE_URL"];

const TENANT_A = "sale-test-a";
const TENANT_B = "sale-test-b";

async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    const ids = [TENANT_A, TENANT_B];
    // Children first. Most of these cascade, but `purge` must work even when a
    // previous run left a partial tree behind.
    await prisma.customerOutstandingPayment.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerOutstanding.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerRedemption.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerPoint.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerPackageHolding.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerValuePackageHolding.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customerGiftCardHolding.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.employeePerformance.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.employeeLeave.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.employeeCommission.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.saleLine.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.sale.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.giftCard.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.package.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.valuePackage.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@sale.test" } } });
  });
}

async function seed(): Promise<void> {
  await purge();

  await runAsPlatform(async () => {
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({ data: { id, name: `Salon ${id}`, slug: `salon-${id}` } });

      const staff = await prisma.user.create({
        data: {
          tenantId: id,
          email: `owner-${id}@sale.test`,
          name: `Owner ${id}`,
          passwordHash: "not-a-real-hash",
        },
      });
      await prisma.tenant.update({ where: { id }, data: { ownerUserId: staff.id } });

      const customer = await prisma.customer.create({
        data: { tenantId: id, name: `Customer ${id}`, email: `${id}@customer.sale.test` },
      });

      const pack = await prisma.package.create({
        data: {
          tenantId: id,
          name: `Package ${id}`,
          memberPrice: "80.00",
          nonmemberPrice: "90.00",
        },
      });
      const valuePack = await prisma.valuePackage.create({
        data: { tenantId: id, name: `Value pack ${id}`, price: "100.00", credit: "100.00" },
      });
      const card = await prisma.giftCard.create({
        data: { tenantId: id, name: `Card ${id}`, value: "50.00" },
      });

      const sale = await prisma.sale.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          staffId: staff.id,
          status: "COMPLETED",
          totalQuantity: 3,
          totalAmount: "230.00",
          paidAmount: "230.00",
          paymentMethod: "CARD",
          paymentStatus: "PAID",
          soldAt: new Date("2026-04-01T11:00:00Z"),
        },
      });

      const packageLine = await prisma.saleLine.create({
        data: {
          tenantId: id,
          saleId: sale.id,
          itemType: "PACKAGE",
          itemId: pack.id,
          itemName: `Package ${id}`,
          quantity: 1,
          unitPrice: "80.00",
          lineTotal: "80.00",
          staffId: staff.id,
        },
      });

      await prisma.saleLine.create({
        data: {
          tenantId: id,
          saleId: sale.id,
          itemType: "GIFT_CARD",
          itemId: card.id,
          itemName: `Card ${id}`,
          quantity: 2,
          unitPrice: "50.00",
          lineTotal: "100.00",
        },
      });

      // Every holding, ledger and redemption kind, so one assertion covers them.
      await prisma.customerPackageHolding.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          packageId: pack.id,
          saleLineId: packageLine.id,
          quantity: 6,
          quantityRemaining: 4,
        },
      });
      await prisma.customerValuePackageHolding.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          valuePackageId: valuePack.id,
          saleLineId: packageLine.id,
          amount: "100.00",
          amountRemaining: "40.00",
        },
      });
      await prisma.customerGiftCardHolding.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          giftCardId: card.id,
          value: "50.00",
          valueRemaining: "50.00",
          reference: `QR-${id}`,
        },
      });

      await prisma.customerRedemption.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          saleId: sale.id,
          itemType: "PACKAGE",
          itemId: pack.id,
          quantity: 2,
          usedAt: new Date("2026-04-02T09:00:00Z"),
        },
      });
      await prisma.customerPoint.create({
        data: { tenantId: id, customerId: customer.id, saleId: sale.id, point: 23 },
      });

      const outstanding = await prisma.customerOutstanding.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          saleId: sale.id,
          unpaidAmount: "30.00",
        },
      });
      await prisma.customerOutstandingPayment.create({
        data: {
          tenantId: id,
          customerId: customer.id,
          outstandingId: outstanding.id,
          saleId: sale.id,
          paidAmount: "10.00",
          paidAt: new Date("2026-04-03T09:00:00Z"),
        },
      });

      await prisma.employeePerformance.create({
        data: {
          tenantId: id,
          userId: staff.id,
          saleId: sale.id,
          itemType: "PACKAGE",
          itemId: pack.id,
          amount: "80.00",
        },
      });
      await prisma.employeeLeave.create({
        data: {
          tenantId: id,
          userId: staff.id,
          fromDate: new Date("2026-05-01"),
          toDate: new Date("2026-05-02"),
          halfDay: "AM",
          status: "APPROVED",
          grantedBy: `Manager ${id}`,
        },
      });
      await prisma.employeeCommission.create({
        data: { tenantId: id, userId: staff.id, saleId: sale.id, rate: "15.00", amount: "12.00" },
      });
    }
  });
}

describe(
  "sale and customer ledgers",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    before(seed);

    after(async () => {
      await purge();
      await prisma.$disconnect();
    });

    it("scopes every new model to the calling tenant", async () => {
      const seen = await runAsTenant(TENANT_A, async () => ({
        sales: await prisma.sale.findMany({ select: { tenantId: true } }),
        saleLines: await prisma.saleLine.findMany({ select: { tenantId: true } }),
        packageHoldings: await prisma.customerPackageHolding.findMany({
          select: { tenantId: true },
        }),
        valuePackageHoldings: await prisma.customerValuePackageHolding.findMany({
          select: { tenantId: true },
        }),
        giftCardHoldings: await prisma.customerGiftCardHolding.findMany({
          select: { tenantId: true },
        }),
        points: await prisma.customerPoint.findMany({ select: { tenantId: true } }),
        outstandings: await prisma.customerOutstanding.findMany({ select: { tenantId: true } }),
        payments: await prisma.customerOutstandingPayment.findMany({ select: { tenantId: true } }),
        redemptions: await prisma.customerRedemption.findMany({ select: { tenantId: true } }),
        performances: await prisma.employeePerformance.findMany({ select: { tenantId: true } }),
        leaves: await prisma.employeeLeave.findMany({ select: { tenantId: true } }),
      }));

      for (const [model, rows] of Object.entries(seen)) {
        assert.ok(rows.length > 0, `${model} should have seeded rows`);
        assert.deepEqual(
          [...new Set(rows.map((row) => row.tenantId))],
          [TENANT_A],
          `${model} leaked another tenant's rows`,
        );
      }
    });

    it("stamps the caller's tenant on create, so a handler cannot forge one", async () => {
      const created = await runAsTenant(TENANT_A, () =>
        prisma.sale.create({
          data: {
            tenantId: TENANT_B,
            totalQuantity: 1,
            totalAmount: "5.00",
            paidAmount: "5.00",
            soldAt: new Date("2026-06-01T10:00:00Z"),
          },
        }),
      );

      assert.equal(created.tenantId, TENANT_A);

      await runAsPlatform(() => prisma.sale.delete({ where: { id: created.id } }));
    });

    it("cannot reach another tenant's sale by primary key", async () => {
      const other = await runAsPlatform(() =>
        prisma.sale.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
      );

      const seenFromA = await runAsTenant(TENANT_A, () =>
        prisma.sale.findUnique({ where: { id: other.id } }),
      );

      assert.equal(seenFromA, null);
    });

    it("deletes a sale's lines with it, so a cart cannot outlive its sale", async () => {
      const sale = await runAsPlatform(() =>
        prisma.sale.findFirstOrThrow({ where: { tenantId: TENANT_A } }),
      );

      const linesBefore = await runAsPlatform(() =>
        prisma.saleLine.count({ where: { saleId: sale.id } }),
      );
      assert.equal(linesBefore, 2);

      await runAsPlatform(() => prisma.sale.delete({ where: { id: sale.id } }));

      const linesAfter = await runAsPlatform(() =>
        prisma.saleLine.count({ where: { saleId: sale.id } }),
      );
      assert.equal(linesAfter, 0, "sale_lines must cascade from the sale");
    });

    it("keeps a receipt readable after its catalogue row is gone", async () => {
      // `SaleLine.itemId` is deliberately unconstrained. A salon that archives a
      // service must not lose the history of what it sold, and `itemName` is the
      // snapshot that survives.
      const sale = await runAsTenant(TENANT_B, () =>
        prisma.sale.create({
          data: {
            // Passed for the type; the extension overwrites it with the caller's
            // tenant, which is the whole point of the scoping test.
            tenantId: TENANT_A,
            totalQuantity: 1,
            totalAmount: "40.00",
            paidAmount: "40.00",
            soldAt: new Date("2026-06-02T10:00:00Z"),
          },
        }),
      );

      const line = await runAsTenant(TENANT_B, () =>
        prisma.saleLine.create({
          data: {
            tenantId: TENANT_B,
            saleId: sale.id,
            itemType: "SERVICE",
            itemId: "no-such-service-row",
            itemName: "Archived Service",
            quantity: 1,
            unitPrice: "40.00",
            lineTotal: "40.00",
          },
        }),
      );

      assert.equal(line.itemId, "no-such-service-row");
      assert.equal(line.itemName, "Archived Service");

      await runAsPlatform(() => prisma.sale.delete({ where: { id: sale.id } }));
    });

    it("holds the signed points ledger, so a balance is a sum and never an edit", async () => {
      const customer = await runAsPlatform(() =>
        prisma.customer.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
      );

      await runAsTenant(TENANT_B, () =>
        prisma.customerPoint.create({
          data: { tenantId: TENANT_B, customerId: customer.id, point: -3 },
        }),
      );

      const rows = await runAsTenant(TENANT_B, () =>
        prisma.customerPoint.findMany({ where: { customerId: customer.id } }),
      );

      assert.equal(rows.length, 2, "a correction is a new row, not a replacement");
      assert.equal(
        rows.reduce((sum, row) => sum + row.point, 0),
        20,
      );
    });

    it("refuses a second outstanding balance against one sale", async () => {
      const sale = await runAsPlatform(() =>
        prisma.sale.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
      );
      const customer = await runAsPlatform(() =>
        prisma.customer.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
      );

      await assert.rejects(() =>
        runAsPlatform(() =>
          prisma.customerOutstanding.create({
            data: {
              tenantId: TENANT_B,
              customerId: customer.id,
              saleId: sale.id,
              unpaidAmount: "1.00",
            },
          }),
        ),
      );
    });
  },
);
