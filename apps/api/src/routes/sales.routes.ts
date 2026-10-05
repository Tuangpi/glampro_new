import { Router } from "express";
import { saleItemSearchQuerySchema, type SaleItemSearchQuery } from "@glampro/shared";

import { auth } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { searchSaleItems } from "../services/sale.service.js";

/**
 * Sales — handoff screens 01–02, `GET /api/sales/items`.
 *
 * Phase 5b.1 mounts the item search only; the cart write and the receipt number arrive
 * in 5b.2, so this router is one route today.
 *
 * The guard is `sales`, a **core** module, so it always passes for a tenant. It is
 * mounted deliberately: it is what enters the tenant scope with the same refusal shape
 * as every other mount, and `requireModule("sales")` is the honest statement that this
 * path is the sales feature. What `/items` does **not** do is refuse for the add-ons
 * its kinds belong to — an unentitled kind is left out of the list and named as
 * missing (`searchableKinds`), rather than turning into a 403 for a cashier who is only
 * trying to sell a shampoo. `sale.service.ts` holds the reasoning.
 */
export const salesRouter = Router();

salesRouter.get(
  "/items",
  auth,
  requireModule("sales"),
  validate(saleItemSearchQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<SaleItemSearchQuery>(req, "query");
      res.status(200).json({ data: await searchSaleItems(query) });
    } catch (error) {
      next(error);
    }
  },
);
