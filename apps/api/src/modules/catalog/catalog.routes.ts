import { Router } from 'express';
import { z } from 'zod';
import {
  createInventoryMovementRequestSchema,
  createProductRequestSchema,
  createServiceRequestSchema,
  inventoryLevelQuerySchema,
  inventoryMovementQuerySchema,
  productCategoryRequestSchema,
  productQuerySchema,
  serviceCategoryRequestSchema,
  serviceQuerySchema,
  updateProductCategoryRequestSchema,
  updateProductRequestSchema,
  updateServiceCategoryRequestSchema,
  updateServiceRequestSchema,
} from '@glampro/contracts';
import type {
  InventoryLevelQuery,
  InventoryMovementQuery,
  InventoryMovementRequest,
  ProductCategoryRequest,
  ProductQuery,
  ProductRequest,
  ServiceCategoryRequest,
  ServiceQuery,
  ServiceRequest,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateServiceCategoryRequest,
  UpdateServiceRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  createProduct,
  createProductCategory,
  createService,
  createServiceCategory,
  listProductCategories,
  listProducts,
  listServiceCategories,
  listServices,
  productDetailOf,
  serviceDetailOf,
  updateProduct,
  updateProductCategory,
  updateService,
  updateServiceCategory,
} from './catalog.service.js';
import {
  createInventoryMovement,
  listInventoryLevels,
  listInventoryMovements,
} from './inventory.service.js';

export const serviceCategoriesRouter = Router();
export const servicesRouter = Router();
export const productCategoriesRouter = Router();
export const productsRouter = Router();
export const inventoryRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

type IdParams = { id: string };

/** Service categories: read is open to anyone who can read services. */
serviceCategoriesRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('services.read'),
  async (request, response) => {
    respondSuccess(request, response, {
      serviceCategories: await listServiceCategories(tenantOf(request).organizationId),
    });
  },
);

serviceCategoriesRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('services.manage'),
  requireCsrf,
  validate({ body: serviceCategoryRequestSchema }),
  async (request, response) => {
    const serviceCategory = await createServiceCategory(
      tenantOf(request).organizationId,
      validatedBody<ServiceCategoryRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { serviceCategory }, 201);
  },
);

serviceCategoriesRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('services.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateServiceCategoryRequestSchema }),
  async (request, response) => {
    const serviceCategory = await updateServiceCategory(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateServiceCategoryRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { serviceCategory });
  },
);

/** Services. */

servicesRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('services.read'),
  validate({ query: serviceQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      services: await listServices(
        tenantOf(request).organizationId,
        validatedQuery<ServiceQuery>(request).serviceCategoryId,
      ),
    });
  },
);

servicesRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('services.manage'),
  requireCsrf,
  validate({ body: createServiceRequestSchema }),
  async (request, response) => {
    const service = await createService(
      tenantOf(request).organizationId,
      validatedBody<ServiceRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { service }, 201);
  },
);

servicesRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('services.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const service = await serviceDetailOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { service });
  },
);

servicesRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('services.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateServiceRequestSchema }),
  async (request, response) => {
    const service = await updateService(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateServiceRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { service });
  },
);

/** Product categories. */

productCategoriesRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('products.read'),
  async (request, response) => {
    respondSuccess(request, response, {
      productCategories: await listProductCategories(tenantOf(request).organizationId),
    });
  },
);

productCategoriesRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('products.manage'),
  requireCsrf,
  validate({ body: productCategoryRequestSchema }),
  async (request, response) => {
    const productCategory = await createProductCategory(
      tenantOf(request).organizationId,
      validatedBody<ProductCategoryRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { productCategory }, 201);
  },
);

productCategoriesRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('products.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateProductCategoryRequestSchema }),
  async (request, response) => {
    const productCategory = await updateProductCategory(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateProductCategoryRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { productCategory });
  },
);

/** Products. */

productsRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('products.read'),
  validate({ query: productQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      products: await listProducts(
        tenantOf(request).organizationId,
        validatedQuery<ProductQuery>(request).productCategoryId,
      ),
    });
  },
);

productsRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('products.manage'),
  requireCsrf,
  validate({ body: createProductRequestSchema }),
  async (request, response) => {
    const product = await createProduct(
      tenantOf(request).organizationId,
      validatedBody<ProductRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { product }, 201);
  },
);

productsRouter.get(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('products.read'),
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const product = await productDetailOf(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
    );

    respondSuccess(request, response, { product });
  },
);

productsRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('products.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: updateProductRequestSchema }),
  async (request, response) => {
    const product = await updateProduct(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<UpdateProductRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { product });
  },
);

/** Inventory: levels are read-only here, stock changes go through movements. */

inventoryRouter.get(
  '/levels',
  authenticate,
  withTenant,
  requirePermission('inventory.read'),
  validate({ query: inventoryLevelQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      inventoryLevels: await listInventoryLevels(
        tenantOf(request).organizationId,
        validatedQuery<InventoryLevelQuery>(request).locationId,
      ),
    });
  },
);

inventoryRouter.get(
  '/movements',
  authenticate,
  withTenant,
  requirePermission('inventory.read'),
  validate({ query: inventoryMovementQuerySchema }),
  async (request, response) => {
    respondSuccess(request, response, {
      inventoryMovements: await listInventoryMovements(
        tenantOf(request).organizationId,
        validatedQuery<InventoryMovementQuery>(request).productId,
      ),
    });
  },
);

inventoryRouter.post(
  '/movements',
  authenticate,
  withTenant,
  requirePermission('inventory.adjust'),
  requireCsrf,
  validate({ body: createInventoryMovementRequestSchema }),
  async (request, response) => {
    const inventoryMovement = await createInventoryMovement(
      tenantOf(request).organizationId,
      validatedBody<InventoryMovementRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { inventoryMovement }, 201);
  },
);
