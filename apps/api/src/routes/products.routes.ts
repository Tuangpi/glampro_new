import { Router } from "express";
import {
  catalogueListQuerySchema,
  createProductSchema,
  idParamSchema,
  updateProductSchema,
  type CatalogueListQuery,
  type CreateProductInput,
  type UpdateProductInput,
} from "@glampro/shared";

import { auth, requireWritableTenant } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { unauthorized } from "../lib/http-error.js";
import {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../services/catalogue.service.js";

/**
 * Products — handoff screen 08, its first tab.
 *
 * Reads are open to every signed-in member of the salon; writes additionally
 * require a writable tenant, because a `SUSPENDED` salon may look at its stock but
 * must not change it (`docs/saas/TENANCY.md` §6).
 *
 * `requireModule("catalogue")` is the entitlement boundary — hiding the rail entry
 * is a convenience, this is the rule. `catalogue` is a core module, so a tenant that
 * exists passes it.
 *
 * `?lowStock=true` is served here rather than on a route of its own: the rail badge
 * and the Products table ask the same question with different `pageSize`, and this
 * keeps one definition of "low" — the tenant's own threshold.
 */
export const productsRouter = Router();

productsRouter.get(
  "/",
  auth,
  requireModule("catalogue"),
  validate(catalogueListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<CatalogueListQuery>(req, "query");
      res.status(200).json({ data: await listProducts(query) });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.get(
  "/:id",
  auth,
  requireModule("catalogue"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = validated<{ id: string }>(req, "params");
      res.status(200).json({ data: await getProduct(id) });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.post(
  "/",
  auth,
  requireModule("catalogue"),
  requireWritableTenant(),
  validate(createProductSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const input = validated<CreateProductInput>(req, "body");
      res.status(201).json({ data: await createProduct(input) });
    } catch (error) {
      next(error);
    }
  },
);

productsRouter.patch(
  "/:id",
  auth,
  requireModule("catalogue"),
  requireWritableTenant(),
  validate(idParamSchema, "params"),
  validate(updateProductSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const { id } = validated<{ id: string }>(req, "params");
      const input = validated<UpdateProductInput>(req, "body");
      res.status(200).json({ data: await updateProduct(id, input) });
    } catch (error) {
      next(error);
    }
  },
);
