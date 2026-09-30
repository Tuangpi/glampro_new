# Legacy API inventory

The complete HTTP surface of the legacy application, transcribed from
`routes/api.php` (279 lines, **154 route registrations, 3 commented out → 151 live
routes**) and `routes/web.php`.

Read alongside [`reference/legacy-schema.md`](reference/legacy-schema.md) and
[`LEGACY-MAP.md`](LEGACY-MAP.md).

---

## 1. How routes are registered

`RouteServiceProvider` registers `routes/api.php` with middleware `api` and the
prefix **`api`** — and nothing else:

```php
Route::middleware('api')
    ->prefix('api')
    ->group(base_path('routes/api.php'));
```

So the real URLs are `/api/dashboard`, `/api/system-admin/login`,
`/api/mobile/login`. **There is no version segment in the URL.** The `v1` in
`App\Http\Controllers\Api\v1\…` is a PHP namespace only — a fact worth internalising
before searching the legacy code for `api/v1`, which will find nothing.

`RateLimiter::for('api')` is `Limit::perMinute(60)->by($request->user()?->id ?: $request->ip())`
— 60 requests per minute per authenticated user, falling back to IP. An
unauthenticated burst shares one bucket per IP, which is the only protection the
public endpoints have.

Controllers live in four namespaces, **43 classes total**; models number 32.

```
app/Http/Controllers/Api/v1/
├── AIController.php
├── GoogleCalendarController.php
├── Admin/     (5)   AdminAuthController, AdminDashboardController,
│                    AdminSettingController, ManageUsersController,
│                    ManagePaymentController
├── User/      (24)  auth, dashboard, appointments, customers, employees,
│                    departments, catalogue, sales, reports, account
└── Mobile/    (12)  customer-facing + Staff/ for staff-facing
```

---

## 2. Realms and middleware

Three separate route groups, each with its own auth guard, and **no shared
middleware beyond `api`**:

| Group        | Prefix              | Middleware                              | Guard          |
| ------------ | ------------------- | --------------------------------------- | -------------- |
| System admin | `/api/system-admin` | `auth:sanctum` + `system-admin`         | `system-admin` |
| Salon user   | `/api` (root)       | `auth:sanctum`                          | `web`/users    |
| Mobile       | `/api/mobile`       | `auth:sanctum` (after the public block) | `web`/users    |
| Public       | `/api`, `/webhook`  | none                                    | —              |

There are exactly three public entry points: the two login routes
(`/api/login`, `/api/system-admin/login` plus `/api/mobile/login` and
`/api/mobile/staff/login`), the password-reset trio under `/api/mobile`, and
`POST /webhook`.

Every protected group uses the **same Sanctum guard**. The `system-admin`
middleware is the only thing separating a platform admin from a salon user, and it
is an alias registered on the `system-admin` guard — this is the mechanism the
rebuild replaces with a `realm` claim.

Mobile has a second dimension that the web app does not: **staff and customers
authenticate against the same `/api/mobile/login`-shaped flows but land in
different endpoint families** (`/api/mobile/staffs/*` vs `/api/mobile/*`), without
any middleware distinguishing them beyond Sanctum.

### Public endpoints

| Method | Path                                 | Controller                                     |
| ------ | ------------------------------------ | ---------------------------------------------- |
| GET    | `/api/get`                           | `AdminAuthController@login`                    |
| GET    | `/api/system-admin/login`            | `AdminAuthController@login`                    |
| POST   | `/api/system-admin/login`            | `AdminAuthController@login_post`               |
| GET    | `/api/login`                         | `UserAuthController@login`                     |
| POST   | `/api/login`                         | `UserAuthController@login_post`                |
| POST   | `/api/mobile/staff/login`            | `MobileStaffAuthController@login_post`         |
| GET    | `/api/mobile/login`                  | `MobileAuthController@login`                   |
| POST   | `/api/mobile/login`                  | `MobileAuthController@login_post`              |
| POST   | `/api/mobile/request-reset-password` | `MobileAuthController@send_reset_password_otp` |
| POST   | `/api/mobile/verify-otp`             | `MobileAuthController@verify_otp`              |
| POST   | `/api/mobile/reset-password`         | `MobileAuthController@reset_password`          |
| GET    | `/api/google-calendar/callback`      | `GoogleCalendarController@callback`            |
| GET    | `/webhook`                           | `WebHookController@webhookSetup`               |
| POST   | `/webhook`                           | `WebHookController@webhookHandler`             |

Three oddities:

- **`GET /api/get`** (line 57) is a duplicate of the system-admin login handler,
  registered at the API root with the route name `system-login`, which the _other_
  login route also claims. A leftover.
- **The `GET` variants of `login`** are almost certainly scaffolding, but they are
  registered and therefore reachable.
- **`POST /webhook`** is registered with `withoutMiddleware('web')` on the web
  route file, i.e. unauthenticated and CSRF-exempt. Whatever provider calls it,
  nothing in the code verifies where the request came from.

---

## 3. Salon user realm — `/api/*`

All authenticated by `auth:sanctum`. Every one of these resolves the tenant with
`company_id` internally.

### Dashboard and session

| Method | Path             | Handler                             |
| ------ | ---------------- | ----------------------------------- |
| GET    | `/api/dashboard` | `UserDashboardController@dashboard` |
| POST   | `/api/logout`    | `UserAuthController@logout`         |

### Appointments

| Method | Path                            | Handler                                   | Rebuild module |
| ------ | ------------------------------- | ----------------------------------------- | -------------- |
| GET    | `/api/appointment`              | `AppointmentController@index`             | `appointments` |
| GET    | `/api/appointment/event`        | `AppointmentController@event`             | `appointments` |
| POST   | `/api/appointment/create`       | `AppointmentController@create`            | `appointments` |
| PUT    | `/api/appointment/update/{id}`  | `AppointmentController@update`            | `appointments` |
| PUT    | `/api/appointment/start/{id}`   | `AppointmentController@appointmentStart`  | `appointments` |
| PUT    | `/api/appointment/finish/{id}`  | `AppointmentController@appointmentFinish` | `appointments` |
| DELETE | `/api/appointment/destroy/{id}` | `AppointmentController@destroy`           | `appointments` |

`event` feeds the calendar (`react-big-calendar`); `start` / `finish` are state
transitions that have nowhere to be recorded beyond the boolean `status`.

### Customers

| Method | Path                         | Handler                      |
| ------ | ---------------------------- | ---------------------------- |
| GET    | `/api/customer`              | `CustomerController@index`   |
| POST   | `/api/customer/create`       | `CustomerController@create`  |
| GET    | `/api/customer/detail/{id}`  | `CustomerController@detail`  |
| POST   | `/api/customer/update/{id}`  | `CustomerController@update`  |
| DELETE | `/api/customer/destroy/{id}` | `CustomerController@destroy` |

The verbs are inconsistent: `customer` uses POST for update and DELETE for destroy,
while `service` uses PUT for update and the sale group uses POST everywhere. The
rebuild normalises on PATCH/PUT for updates and DELETE for removal across every
resource.

### Employees, leaves, departments

| Method | Path                               | Handler                                     |
| ------ | ---------------------------------- | ------------------------------------------- |
| GET    | `/api/employee`                    | `EmployeeController@index`                  |
| POST   | `/api/employee/leave/{id}`         | `EmployeeController@employee_leave`         |
| PUT    | `/api/employee/leave/approve/{id}` | `EmployeeController@employee_leave_approve` |
| PUT    | `/api/employee/leave/reject/{id}`  | `EmployeeController@employee_leave_reject`  |
| POST   | `/api/employee/create`             | `EmployeeController@create`                 |
| GET    | `/api/employee/detail/{id}`        | `EmployeeController@detail`                 |
| POST   | `/api/employee/update/{id}`        | `EmployeeController@update`                 |
| DELETE | `/api/employee/destroy/{id}`       | `EmployeeController@destroy`                |
| GET    | `/api/department`                  | `DepartmentController@index`                |
| POST   | `/api/department/create`           | `DepartmentController@create`               |
| POST   | `/api/department/update/{id}`      | `DepartmentController@update`               |
| DELETE | `/api/department/destroy/{id}`     | `DepartmentController@destroy`              |
| PUT    | `/api/my-account/update_password`  | `MyAccountController@update_password`       |
| PUT    | `/api/my-account/update_user_info` | `MyAccountController@update_user_info`      |

`leave/{id}` takes the **employee** id, not a leave id — there is no way to fetch a
single leave, and approve/reject act on that same id while the table has no status
column to write to (see `LEGACY-MAP.md` §5, item 10).

Two more routes belong to this group but are **commented out** in the file
(lines 204–205) and reference a `MigrationController` that is no longer imported:

```php
// Route::get('/migration', [MigrationController::class, 'index']);
// Route::post('/migration/create', [MigrationController::class, 'create']);
```

That is the legacy data-import tool for onboarding a salon's existing records.
It has no implementation in the current tree, so the rebuild must supply tenant
onboarding from scratch rather than porting it.

### Catalogue — five resources with the same shape

| Resource       | List                     | Create                           | Update                                | Destroy                                  |
| -------------- | ------------------------ | -------------------------------- | ------------------------------------- | ---------------------------------------- |
| Products       | GET `/api/product`       | POST `/api/product/create`       | POST `/api/product/update/{id}`       | DELETE `/api/product/destroy/{id}`       |
| Services       | GET `/api/service`       | POST `/api/service/create`       | PUT `/api/service/update/{id}`        | DELETE `/api/service/destroy/{id}`       |
| Packages       | GET `/api/package`       | POST `/api/package/create`       | POST `/api/package/update/{id}`       | DELETE `/api/package/destroy/{id}`       |
| Value packages | GET `/api/value-package` | POST `/api/value-package/create` | POST `/api/value-package/update/{id}` | DELETE `/api/value-package/destroy/{id}` |
| Gift cards     | GET `/api/gift-card`     | POST `/api/gift-card/create`     | POST `/api/gift-card/update/{id}`     | DELETE `/api/gift-card/destroy/{id}`     |

Five resources, three different update verbs between them; only `service` uses PUT.
Note there is no `GET /api/{resource}/{id}` for any of them — the list endpoint
returns everything, and the UI filters client-side.

### Sales and the till

| Method | Path                                        | Handler                               |
| ------ | ------------------------------------------- | ------------------------------------- |
| GET    | `/api/today-sale`                           | `TodaySaleController@index`           |
| GET    | `/api/sale/edit/{sale_id}`                  | `TodaySaleController@edit`            |
| DELETE | `/api/sale/delete/{sale_id}`                | `TodaySaleController@destroy`         |
| GET    | `/api/print/to-day-sale/{sale_id}`          | `TodaySaleController@todaySalePrint`  |
| GET    | `/api/sale/{customer_id}`                   | `SaleController@index`                |
| GET    | `/api/get-customers`                        | `SaleController@getCustomers`         |
| POST   | `/api/sale/pay-by-cash`                     | `SaleController@payByCash`            |
| POST   | `/api/sale/pay-by-card`                     | `SaleController@payByCard`            |
| POST   | `/api/sale/split-pay`                       | `SaleController@splitPay`             |
| POST   | `/api/sale/success-online-payment`          | `SaleController@successOnlinePayment` |
| POST   | `/api/sale/update/{sale_id}`                | `SaleController@update`               |
| GET    | `/api/sale/qr/{customer_gift_card_id}`      | `SaleController@getGiftCardForQrCode` |
| GET    | `/api/print/receipt/{sale_id}`              | `SaleController@receiptPrintPDF`      |
| GET    | `/api/transfer-item/customer/{customer_id}` | `TransferItemController@index`        |
| POST   | `/api/transfer-item/customer`               | `TransferItemController@transferItem` |

Four properties of this group that the rebuild must either preserve or improve:

1. **`GET /api/sale/{customer_id}` is the checkout screen.** The customer id is a
   path segment on a GET, so the cart is server-side session state keyed by
   customer, not a client payload. The redesign's cart is client-side and will post
   the whole sale in one request — decide which wins when the sales phase is built.
2. **Payment is three endpoints, not one.** `pay-by-cash`, `pay-by-card`,
   `split-pay`. A single `POST /api/sales` carrying a `payments[]` array collapses
   all three, and split payment falls out for free.
3. **Printing is a server-side `GET` returning dompdf output.** Because they are
   GETs, a cache, a prefetch or a link scanner can trigger a PDF render as a side
   effect. The rebuild serves these as authenticated, explicitly-named endpoints.
4. **There is no idempotency key anywhere.** `pay-by-cash` posts a payment; a
   retried request charges twice. The rebuild needs an idempotency key on sale
   creation.

`transfer-item` moves a customer's package or value-package balance to another
customer — an unusual feature that a salon would use to fix a mis-assigned
purchase. It reads and writes across two customers in one call, so it is exactly
the kind of endpoint that must be reviewed for tenant scoping. Keep it out of the
first sales phase.

---

## 4. Reports and exports

Every report has a matching `/export/*` endpoint that returns an XLSX via
`maatwebsite/excel`. **15 report endpoints, 14 exports** — `customer_report` is the
only one without an export.

| Report               | Read endpoint                          | Export endpoint                         | Module                |
| -------------------- | -------------------------------------- | --------------------------------------- | --------------------- |
| Sales                | GET `/api/report/sale`                 | POST `/api/export/sale`                 | `reports`             |
| Customers            | GET `/api/report/customer`             | _(none)_                                | `reports`             |
| Customer birthdays   | GET `/api/report/customer-birthday`    | POST `/api/export/customer-birthday`    | `reports`             |
| Customer purchases   | GET `/api/report/customer-buy`         | POST `/api/export/customer-buy`         | `reports`             |
| Employee performance | GET `/api/report/employee-performance` | POST `/api/export/employee-performance` | `employeePerformance` |
| Employee commission  | GET `/api/report/employee-commission`  | POST `/api/export/employee-commission`  | `employeeCommission`  |
| Products             | GET `/api/report/product`              | POST `/api/export/product`              | `reports`             |
| Product sales        | GET `/api/report/product/sale`         | POST `/api/export/product/sale`         | `reports`             |
| Package sales        | GET `/api/report/package/sale`         | POST `/api/export/package/sale`         | `reports`             |
| Package usage        | GET `/api/report/package/use`          | POST `/api/export/package/use`          | `reports`             |
| Value package sales  | GET `/api/report/value-package/sale`   | POST `/api/export/value-package/sale`   | `reports`             |
| Value package usage  | GET `/api/report/value-package/use`    | POST `/api/export/value-package/use`    | `reports`             |
| Service sales        | GET `/api/report/service/sale`         | POST `/api/export/service/sale`         | `reports`             |
| Gift card sales      | GET `/api/report/gift-card/sale`       | POST `/api/export/gift-card/sale`       | `reports`             |
| Gift card usage      | GET `/api/report/gift-card/use`        | POST `/api/export/gift-card/use`        | `reports`             |

Notes for the reporting phase:

- The asymmetries are real and unexplained: `customer_report` has no export, and
  `product` and `sale` each have both a summary and a per-transaction variant while
  `service` has only the per-transaction one.
- **Exports are `POST`, reads are `GET`** — an inconsistent choice, but it means the
  export endpoints at least require a body, so they cannot be triggered by a link
  scanner. Keep them POST in the rebuild.
- Every one of these is a date-range aggregate. In the rebuild they belong behind
  `requireModule("reports")` plus the specific add-on module where one applies
  (`employeeCommission`, `employeePerformance`).

### Google Calendar

| Method | Path                              | Handler                               |
| ------ | --------------------------------- | ------------------------------------- |
| GET    | `/api/google-calendar/connect`    | `GoogleCalendarController@connect`    |
| POST   | `/api/google-calendar/disconnect` | `GoogleCalendarController@disconnect` |
| GET    | `/api/google-calendar/callback`   | `GoogleCalendarController@callback`   |

`callback` is public (outside the auth group) and is the OAuth redirect target. It
is the only endpoint outside `/api/mobile` that a browser reaches without a token,
which means the `state` parameter is the only thing tying the callback to a user —
verify that before re-implementing.

### AI

| Method | Path                | Handler               | Auth           |
| ------ | ------------------- | --------------------- | -------------- |
| POST   | `/api/ai-chat`      | `AIController@index`  | **none**       |
| POST   | `/api/ai-chat-mail` | `AIController@aiMail` | `auth:sanctum` |

**`POST /api/ai-chat` is registered outside any auth group** — line 276, before the
`Route::group(['middleware' => ['auth:sanctum']])` on line 277 that wraps only
`ai-chat-mail`. An unauthenticated, un-rate-limited-looking LLM endpoint that costs
money per call. Whether or not the AI module survives the rebuild, this must not be
reproduced as-is.

---

## 5. System admin realm — `/api/system-admin/*`

The whole platform console: **13 endpoints**, guarded by `auth:sanctum` +
`system-admin`.

| Method | Path                                                | Handler                                  |
| ------ | --------------------------------------------------- | ---------------------------------------- |
| POST   | `/api/system-admin/logout`                          | `AdminAuthController@logout`             |
| GET    | `/api/system-admin/dashboard`                       | `AdminDashboardController@dashboard`     |
| GET    | `/api/system-admin/user-lists`                      | `ManageUsersController@users`            |
| POST   | `/api/system-admin/user-lists/create`               | `ManageUsersController@create_user`      |
| GET    | `/api/system-admin/user-lists/detail/{id}`          | `ManageUsersController@user_detail`      |
| GET    | `/api/system-admin/user-lists/edit/{id}`            | `ManageUsersController@edit_user`        |
| POST   | `/api/system-admin/user-lists/update/{id}`          | `ManageUsersController@update_user`      |
| DELETE | `/api/system-admin/user-lists/destroy/{id}`         | `ManageUsersController@destroy_user`     |
| POST   | `/api/system-admin/payment/create`                  | `ManagePaymentController@create`         |
| PUT    | `/api/system-admin/payment/update/{id}`             | `ManagePaymentController@update`         |
| DELETE | `/api/system-admin/payment/destroy/{id}`            | `ManagePaymentController@destroy`        |
| GET    | `/api/system-admin/account-setting`                 | `AdminSettingController@index`           |
| PUT    | `/api/system-admin/account-setting/update-password` | `AdminSettingController@update_password` |

What this reveals about the legacy console: it manages **tenants** (called
`user-lists`), their **payments**, and a dashboard. There is no endpoint for
modules, entitlements, subscription periods or suspension — all of those were
edited directly on the `users` row through `user-lists/update`. That is precisely
why the rebuild's console needs real surfaces for them.

| Legacy console concept | Rebuild equivalent                          |
| ---------------------- | ------------------------------------------- |
| `user-lists`           | `Tenant` (the salon business)               |
| `payment`              | `Payment` + `Subscription` periods          |
| `dashboard`            | Platform KPIs (tenants, MRR, expiring soon) |
| `account-setting`      | `PlatformAdmin` profile                     |
| _(missing)_            | `Module` + `TenantModule` management        |
| _(missing)_            | Suspend / reinstate a tenant                |
| _(missing)_            | `AuditLog` viewer                           |

---

## 6. Mobile realm — `/api/mobile/*`

The shipped client's contract, **frozen**: it must keep working byte-for-byte while
the web app is rebuilt around it. **36 live endpoints** (6 public, 30
authenticated), plus one commented out.

### Auth and password reset (public)

| Method | Path                                 | Handler                                        |
| ------ | ------------------------------------ | ---------------------------------------------- |
| POST   | `/api/mobile/staff/login`            | `MobileStaffAuthController@login_post`         |
| GET    | `/api/mobile/login`                  | `MobileAuthController@login`                   |
| POST   | `/api/mobile/login`                  | `MobileAuthController@login_post`              |
| POST   | `/api/mobile/request-reset-password` | `MobileAuthController@send_reset_password_otp` |
| POST   | `/api/mobile/verify-otp`             | `MobileAuthController@verify_otp`              |
| POST   | `/api/mobile/reset-password`         | `MobileAuthController@reset_password`          |

`staff/login` has **no** `GET` sibling and no named route, unlike the customer
`login`, which has both. Customer reset uses an OTP against the `customers.otp` /
`customers.otp_expire_at` columns.

### Staff (authenticated) — `/api/mobile/staffs/*`

| Method | Path                                                | Handler                                              |
| ------ | --------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/mobile/staffs/get_customers_employees`        | `MobileDashboardController@get_customers_employees`  |
| GET    | `/api/mobile/staffs/dashboard/weekly_sales`         | `MobileDashboardController@weekly_sales`             |
| GET    | `/api/mobile/staffs/dashboard/weekly_total_income`  | `MobileDashboardController@weekly_total_income`      |
| GET    | `/api/mobile/staffs/dashboard/monthly_total_income` | `MobileDashboardController@monthly_total_income`     |
| GET    | `/api/mobile/staffs/dashboard/total_income`         | `MobileDashboardController@get_total_income`         |
| GET    | `/api/mobile/staffs/reports/package_sales`          | `MobileStaffReportController@get_package_sales`      |
| GET    | `/api/mobile/staffs/reports/product_sales`          | `MobileStaffReportController@get_product_sale`       |
| GET    | `/api/mobile/staffs/reports/services`               | `MobileStaffReportController@get_service_sales`      |
| GET    | `/api/mobile/staffs/reports/value_package_sales`    | `MobileStaffReportController@get_valuepackage_sales` |
| GET    | `/api/mobile/staffs/reports/total_your_sales`       | `MobileStaffReportController@get_your_total_sales`   |
| GET    | `/api/mobile/staffs/reports/total_sale`             | `MobileStaffReportController@fetchSalesComparison`   |
| GET    | `/api/mobile/staffs/customers`                      | `MobileStaffCustomerController@get_customers`        |
| GET    | `/api/mobile/staffs/employees`                      | `MobileStaffCustomerController@get_employees`        |
| POST   | `/api/mobile/staffs/profile/update`                 | `MobileStaffAuthController@update_staff_profile`     |
| POST   | `/api/mobile/staffs/profile_image/update`           | `MobileStaffAuthController@update_profile_image`     |
| POST   | `/api/mobile/staffs/delete_account`                 | `MobileStaffAuthController@delete_staff_account`     |

The naming is mixed: `snake_case` path segments (`get_customers_employees`) sit
beside `kebab-case` elsewhere (`request-reset-password`). Keep as-is for
compatibility.

### Customer (authenticated)

| Method | Path                               | Handler                                                |
| ------ | ---------------------------------- | ------------------------------------------------------ |
| GET    | `/api/mobile/services`             | `MobileServiceController@index`                        |
| GET    | `/api/mobile/packages`             | `MobilePackagesController@index`                       |
| GET    | `/api/mobile/value-packages`       | `MobileServiceController@index` ← same handler         |
| GET    | `/api/mobile/products`             | `MobileProductController@index`                        |
| GET    | `/api/mobile/employees`            | `MobileEmployeeController@index`                       |
| POST   | `/api/mobile/make-appointment`     | `MobileAppointmentController@create`                   |
| GET    | `/api/mobile/appointments`         | `MobileAppointmentController@get_user_appointments`    |
| GET    | `/api/mobile/products/history`     | `MobileSaleHistoryController@get_product_sale_history` |
| GET    | `/api/mobile/packages/history`     | `MobileSaleHistoryController@get_package_sale_history` |
| GET    | `/api/mobile/services/history`     | `MobileSaleHistoryController@get_service_sale_history` |
| POST   | `/api/mobile/profile/update`       | `MobileAuthController@update_customer_profile`         |
| POST   | `/api/mobile/profile_image/update` | `MobileAuthController@update_customer_profile_image`   |
| POST   | `/api/mobile/delete-account`       | `MobileAuthController@delete_account`                  |
| POST   | `/api/mobile/logout`               | `MobileAuthController@logout`                          |
| —      | `/api/mobile/appointments/history` | **commented out** (`get_user_appointments_history`)    |

`GET /api/mobile/value-packages` routes to `MobileServiceController@index` — the
same handler as `/api/mobile/services`. Either a copy-paste bug in the route file
or the handler branches on the request path. Confirm before mirroring it.

### What the freeze means for the rebuild

The mobile client is not being rewritten, so the tenant plane must expose these
paths and payload shapes unchanged while everything else moves to a cleaner design.
That is a compatibility layer, and the honest way to build it is to keep
`/api/mobile/*` as an explicit adapter over the same services the web app calls —
not to fork the domain logic. Build it in the phase that stabilises the tenant API,
and treat `value-packages` → `services` and the commented-out history route as bugs
to confirm, not contracts to preserve.

---

## 7. Legacy → rebuild route mapping

The rebuild replaces verb-soup and session-state endpoints with REST resources. This
table is the agreed transformation, not a mechanical mirror of the old URLs.

| Legacy                                                     | Rebuild                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `POST /api/sale/pay-by-cash` / `pay-by-card` / `split-pay` | `POST /api/v1/sales` with `payments[]`                   |
| `GET /api/sale/{customer_id}` (checkout screen)            | `GET /api/v1/customers/{id}/cart` + `POST /api/v1/sales` |
| `GET /api/print/receipt/{sale_id}`                         | `GET /api/v1/sales/{id}/receipt.pdf`                     |
| `GET /api/print/to-day-sale/{sale_id}`                     | `GET /api/v1/reports/daily/{date}.xlsx`                  |
| `POST /api/export/*`                                       | `GET /api/v1/reports/{name}.xlsx?from=&to=`              |
| `POST /api/{r}/create`, `POST /api/{r}/update/{id}`        | `POST /api/v1/{r}s`, `PATCH /api/v1/{r}s/{id}`           |
| `GET /api/{r}`, `GET /api/{r}/detail/{id}`                 | `GET /api/v1/{r}s`, `GET /api/v1/{r}s/{id}`              |
| `DELETE /api/{r}/destroy/{id}`                             | `DELETE /api/v1/{r}s/{id}`                               |
| `POST /api/employee/leave/{id}`                            | `POST /api/v1/employees/{id}/leaves`                     |
| `PUT /api/employee/leave/approve/{id}`                     | `PATCH /api/v1/leaves/{id}` `{status}`                   |
| `GET /api/appointment/event`                               | `GET /api/v1/appointments?from=&to=&view=calendar`       |
| `PUT /api/appointment/start/{id}`                          | `POST /api/v1/appointments/{id}/transitions/start`       |
| `GET /api/system-admin/user-lists`                         | `GET /api/v1/platform/tenants`                           |
| `POST /api/system-admin/payment/create`                    | `POST /api/v1/platform/tenants/{id}/payments`            |
| `/api/mobile/**`                                           | `/api/mobile/**` — unchanged adapter layer               |

### Deliberately dropped

| Dropped                                     | Why                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/ai-chat` (unauthenticated)       | Paid LLM endpoint with no auth; re-add only behind the `ai` module + auth |
| `POST /api/transfer-item/customer`          | Cross-customer balance move; needs its own audit design first             |
| `GET /api/mobile/appointments/history`      | Commented out in legacy; port only if the app actually calls it           |
| `/api/google-calendar/callback` as _public_ | Becomes a `state`-validated endpoint                                      |

### Deliberately added

| New surface                                       | Why                                                        |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/v1/auth/refresh`                       | Sanctum tokens never expired in legacy                     |
| `GET/PUT /api/v1/platform/tenants/{id}/modules`   | Module editing had no API at all                           |
| `POST /api/v1/platform/tenants/{id}/subscription` | Periods were inferred from one timestamp column on `users` |
| `GET /api/v1/audit-logs`                          | No trail existed for entitlement changes                   |
| Idempotency keys on `POST /api/v1/sales`          | Retried payments charged twice                             |

---

## 8. Summary

The file declares 154 route registrations; **3 are commented out** (`/migration`,
`/migration/create`, `/mobile/appointments/history`), leaving **151 live routes**.

| Realm                            | Live    | Public | Protected | Guard                                 |
| -------------------------------- | ------- | ------ | --------- | ------------------------------------- |
| Root leftover (`GET /api/get`)   | 1       | 1      | —         | none                                  |
| System admin `/api/system-admin` | 15      | 2      | 13        | `auth:sanctum` + `system-admin`       |
| Salon user `/api/*`              | 96      | 2      | 94        | `auth:sanctum`                        |
| Google Calendar callback         | 1       | 1      | —         | none                                  |
| Mobile `/api/mobile/*`           | 36      | 6      | 30        | `auth:sanctum` after the public block |
| AI (`/api/ai-chat*`)             | 2       | 1      | 1         | none / `auth:sanctum`                 |
| **Total**                        | **151** | **13** | **138**   |                                       |

Commented out: `/migration`, `/migration/create` (no controller), and
`/mobile/appointments/history`.

Rebuild treatment by realm:

| Realm         | Treatment                                                           |
| ------------- | ------------------------------------------------------------------- |
| Root leftover | Dropped — a duplicate of the admin login                            |
| System admin  | Rebuilt as `/api/v1/platform/*` behind a `platform` realm claim     |
| Salon user    | Rebuilt as REST resources under `/api/v1/*` behind a `tenant` claim |
| Mobile        | **Frozen**, served by an explicit adapter over the same services    |
| AI            | `ai-chat` requires auth + the `ai` module before it returns at all  |
