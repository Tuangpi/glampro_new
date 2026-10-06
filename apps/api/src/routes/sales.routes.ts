import { Router } from "express";
import {
  createSaleSchema,
  idParamSchema,
  saleItemSearchQuerySchema,
  type CreateSaleInput,
  type SaleItemSearchQuery,
} from "@glampro/shared";

import { auth, requireWritableTenant } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { unauthorized } from "../lib/http-error.js";
import { createSale, getSale, searchSaleItems } from "../services/sale.service.js";

/**
 * Sales — handoff screens 01–02, `/api/sales`.
 *
 * Three routes: the item search the cashier types into (5b.1), the write that rings the
 * cart up, and the receipt it returns (5b.2).
 *
 * The guard is `sales`, a **core** module, so it always passes for a tenant. It is
 * mounted deliberately: it is what enters the tenant scope with the same refusal shape
 * as every other mount, and `requireModule("sales")` is the honest statement that this
 * path is the sales feature. What these routes do **not** do is refuse for the add-ons
 * the kinds belong to — `/items` leaves an unentitled kind out of the list and names it
 * in `searchableKinds`, while `POST /` refuses it outright. `sale.service.ts` holds the
 * reasoning for that asymmetry.
 *
 * The write additionally carries `requireWritableTenant()`: a suspended salon may read
 * its history but may not take money, which is the same rule every other write here
 * follows.
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

/**
 * The receipt.
 *
 * Mounted **after** `/items` deliberately: the two paths are literals, but keeping the
 * static route first is what makes the intent obvious to the next reader rather than
 * leaving it to depend on segment names.
 */
salesRouter.get(
  "/:id",
  auth,
  requireModule("sales"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = validated<{ id: string }>(req, "params");
      res.status(200).json({ data: await getSale(id) });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * `201` with the receipt as the body.
 *
 * `201` because a sale is a resource that now exists and has a URL of its own, and the
 * body is that receipt rather than a bare id — the confirmation screen is the receipt
 * (`docs/roadmap.md` → Phase 5d), so a client that has to re-fetch it before drawing
 * anything is doing a round trip for no reason.
 *
 * The cashier who rang the sale up is the signed-in user when the body does not name
 * one: `Sale.staffId` is "who rang it up", and a till that defaulted it to nothing
 * would leave every sale with no author.
 */
salesRouter.post(
  "/",
  auth,
  requireModule("sales"),
  requireWritableTenant(),
  validate(createSaleSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();
      const input = validated<CreateSaleInput>(req, "body");
      const receipt = await createSale({ ...input, staffId: input.staffId ?? req.user.id });
      res.status(201).json({ data: receipt });
    } catch (error) {
      next(error);
    }
  },
);
