import { Router } from "express";
import {
  catalogueListQuerySchema,
  createGiftCardSchema,
  idParamSchema,
  updateGiftCardSchema,
  type CatalogueListQuery,
  type CreateGiftCardInput,
  type UpdateGiftCardInput,
} from "@glampro/shared";

import { auth, requireWritableTenant } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { unauthorized } from "../lib/http-error.js";
import {
  createGiftCard,
  getGiftCard,
  listGiftCards,
  updateGiftCard,
} from "../services/gift-card.service.js";

/**
 * Gift cards — the fourth tab of handoff screen 08.
 *
 * The same shape as `packages.routes.ts` and for the same reason: `giftCards` is an
 * add-on module, so the tab is a mount rather than a filter on `/products`, and a
 * salon without the add-on is refused (403 `MODULE_NOT_ENTITLED`) rather than shown
 * an empty list. Nothing here is behind `requireRole`: a gift card is catalogue data,
 * like a product, and describing the shelf is not an admin act.
 */
export const giftCardsRouter = Router();

giftCardsRouter.get(
  "/",
  auth,
  requireModule("giftCards"),
  validate(catalogueListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<CatalogueListQuery>(req, "query");
      res.status(200).json({ data: await listGiftCards(query) });
    } catch (error) {
      next(error);
    }
  },
);

giftCardsRouter.get(
  "/:id",
  auth,
  requireModule("giftCards"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = validated<{ id: string }>(req, "params");
      res.status(200).json({ data: await getGiftCard(id) });
    } catch (error) {
      next(error);
    }
  },
);

giftCardsRouter.post(
  "/",
  auth,
  requireModule("giftCards"),
  requireWritableTenant(),
  validate(createGiftCardSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const input = validated<CreateGiftCardInput>(req, "body");
      res.status(201).json({ data: await createGiftCard(input) });
    } catch (error) {
      next(error);
    }
  },
);

giftCardsRouter.patch(
  "/:id",
  auth,
  requireModule("giftCards"),
  requireWritableTenant(),
  validate(idParamSchema, "params"),
  validate(updateGiftCardSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const { id } = validated<{ id: string }>(req, "params");
      const input = validated<UpdateGiftCardInput>(req, "body");
      res.status(200).json({ data: await updateGiftCard(id, input) });
    } catch (error) {
      next(error);
    }
  },
);
