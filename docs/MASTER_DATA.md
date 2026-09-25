# Master and reference data

Status: implemented (BE-036). Source of truth: `src/modules/reference-data/data/*.ts`.
The tables below are generated from those files; if they disagree, the code wins.

MiNi Payment is a sandbox. Every bank, merchant, biller, operator and person in this file is either
a public reference value (currencies, IFSC bank codes) or invented. No real accounts exist.

## How the data gets into MongoDB

| Migration | What it writes | Environments |
|---|---|---|
| `0002-reference-data` | Collections and indexes for `permissions`, `roles`, `menus`, `master_data`, `entities`, then `syncReferenceData()` upserts every row from the data files | all |
| `0003-demo-accounts` | Demo users (`isDemo: true`) and their sandbox payment methods | consumer demos everywhere; staff demos only in `local`, `development`, `test` |
| `0004-usernames` | Unique `username` index; demo accounts get the usernames below; any other account without one gets its email name (made valid, with a number added if taken or reserved) | all |

Run them with `npm run migrate` locally (reads `.env`) or `npm run deploy:prepare` on Railway (runs automatically before each deploy).
Both pass `APP_ENV` and `JWT_SECRET` to the migrations: `APP_ENV` decides which demo accounts are created, and
`JWT_SECRET` is the key for bank-account fingerprints, so a seeded account and the same account linked through
the API are detected as duplicates.

`syncReferenceData()` is idempotent:

- Rows are upserted by key (`code`, `menuId`, or `type + code`), so running it again changes nothing.
- Roles, permissions and menus removed from the files are **deleted** (they are code-owned).
- Master data and entities removed from the files are **deactivated** (`active: false`), because payments may still reference them.

### Changing the data

1. Edit the relevant file in `src/modules/reference-data/data/`.
2. Add a new migration (never edit a merged one) that calls `syncReferenceData(db)`, and append it to `src/migrations/index.ts`.
3. If a collection gains an index, declare it in `reference-data.models.ts` **and** create it in the migration; `tests/integration/migrations.test.ts` fails if they differ.
4. Regenerate the tables in this file and update the mirror in the web app (`src/config/navigation.ts`) when menus change.

Platform settings in `master_data` mirror constants in code (`PAYMENT_LIMIT_CEILINGS`, `DEFAULT_PREFERENCES`,
`MAX_PAYMENT_METHODS`, `AVATAR_MAX_BYTES`). The code constants are what the API enforces; the rows exist so
clients and a future admin console can display them.

## Demo logins

Password for every demo account: **`MiniPay@2026`**. It is published on purpose.

Sign in with either the email or the username.

| Name | Email | Username | Password | Roles | Seeded in | Linked methods |
|---|---|---|---|---|---|---|
| Priya Sharma | `demo@example.com` | `priya.demo` | `MiniPay@2026` | USER | all environments | UPI `priya.demo@okhdfcbank`; HDFC0001234 savings •••• 6789 |
| Rahul Verma | `demo.friend@example.com` | `rahul.demo` | `MiniPay@2026` | USER | all environments | UPI `rahul.demo@oksbi` |
| Anita Admin | `admin.demo@example.com` | `admin.demo` | `MiniPay@2026` | USER, ADMIN | local, development, test | — |
| Sanjay Support | `support.demo@example.com` | `support.demo` | `MiniPay@2026` | USER, SUPPORT | local, development, test | — |
| Owen Operations | `operations.demo@example.com` | `operations.demo` | `MiniPay@2026` | USER, OPERATIONS | local, development, test | — |
| Aisha Auditor | `auditor.demo@example.com` | `auditor.demo` | `MiniPay@2026` | USER, AUDITOR | local, development, test | — |

Demo accounts are shared by everyone who uses them, so the API turns off anything that would let one visitor
lock others out or see their activity:

| Action | Demo behaviour |
|---|---|
| Change password, sign out everywhere, revoke a session | `403 DEMO_ACCOUNT_RESTRICTED` |
| Edit profile, upload or remove avatar | `403 DEMO_ACCOUNT_RESTRICTED` |
| Forgot password | Same `202` response as any address, but no reset token is created |
| List sessions | Only the caller's own session is returned |
| Login rate limit | Exempt from the per-account bucket (10 / 15 min), still subject to the per-IP bucket (50 / 15 min) |
| Preferences, linking and unlinking payment methods | Allowed (changes are visible to other demo visitors) |

If an address such as `demo@example.com` already belongs to a real registration when the migration runs, that
account is left untouched and is not treated as a demo.

Staff demo accounts hold privileged roles and are never created in `staging` or `production`. The staff console
itself is planned (FE-028); today these accounts see the ADMINISTRATION menu entries from `GET /menus`.

## Roles

`users.roles` holds role codes; the JWT carries them and `GET /menus` resolves them to permissions through the
`roles` collection. Enforcement of permissions on staff endpoints arrives with `requireRole` (BE-005).

| Code | Name | Description | Permissions |
|---|---|---|---|
| `USER` | Customer | Every registered account. Acts only on its own data. | all CONSUMER permissions |
| `SUPPORT` | Support agent | Helps customers: reads users and payments, cannot move money or change settings. | `users.read`, `payments.read.any`, `audit.read` |
| `OPERATIONS` | Operations | Runs day-to-day payment operations: refunds, billers, limits and reconciliation. | `users.read`, `payments.read.any`, `refunds.approve`, `billers.manage`, `limits.manage`, `reconciliation.read`, `reports.read` |
| `ADMIN` | Administrator | Manages users, roles and platform settings. Refund approval stays with Operations (separation of duties). | `users.read`, `users.manage`, `payments.read.any`, `billers.manage`, `limits.manage`, `roles.manage`, `settings.manage`, `audit.read`, `reports.read` |
| `AUDITOR` | Auditor | Read-only access to payments, reconciliation, reports and the audit log. | `payments.read.any`, `reconciliation.read`, `reports.read`, `audit.read` |

## Permissions

| Code | Scope | Module | Description | Roles |
|---|---|---|---|---|
| `profile.manage.own` | CONSUMER | users | View and edit own profile, avatar and preferences | USER |
| `security.manage.own` | CONSUMER | auth | Change own password and manage own sessions | USER |
| `wallet.read.own` | CONSUMER | wallets | View own sandbox wallet | USER |
| `payment-methods.manage.own` | CONSUMER | payment-methods | Link, unlink and choose default bank accounts and UPI IDs | USER |
| `payments.create` | CONSUMER | payments | Send sandbox payments | USER |
| `payments.read.own` | CONSUMER | transactions | View own payment history and receipts | USER |
| `requests.manage.own` | CONSUMER | payment-requests | Create, pay and cancel own money requests | USER |
| `contacts.manage.own` | CONSUMER | contacts | Manage own contacts and beneficiaries | USER |
| `bills.pay` | CONSUMER | bills | Pay sandbox bills and recharges | USER |
| `rewards.read.own` | CONSUMER | rewards | View own rewards | USER |
| `analytics.read.own` | CONSUMER | analytics | View own spending insights | USER |
| `notifications.read.own` | CONSUMER | notifications | View own notifications | USER |
| `users.read` | STAFF | users | Look up any user (masked personal data) | SUPPORT, OPERATIONS, ADMIN |
| `users.manage` | STAFF | users | Disable or re-enable user accounts | ADMIN |
| `payments.read.any` | STAFF | payments | View any payment and its lifecycle | SUPPORT, OPERATIONS, ADMIN, AUDITOR |
| `refunds.approve` | STAFF | payments | Approve refunds and reversals | OPERATIONS |
| `billers.manage` | STAFF | bills | Manage sandbox billers, merchants and operators | OPERATIONS, ADMIN |
| `limits.manage` | STAFF | risk | Change platform payment limits and risk rules | OPERATIONS, ADMIN |
| `reconciliation.read` | STAFF | ledger | View ledger reconciliation reports | OPERATIONS, AUDITOR |
| `roles.manage` | STAFF | access-control | Assign roles to users | ADMIN |
| `settings.manage` | STAFF | platform | Change platform settings and master data | ADMIN |
| `audit.read` | STAFF | audit | Read the audit log | SUPPORT, ADMIN, AUDITOR |
| `reports.read` | STAFF | reporting | View operational reports | OPERATIONS, ADMIN, AUDITOR |

## Menus

Consumer entries mirror the web app's `src/config/navigation.ts` (same ids, paths and task ids). `GET /menus`
returns the entries whose `permission` the caller's roles grant, ordered by group (PAYMENTS, ACCOUNT,
ADMINISTRATION) then `order`. Icons are [lucide](https://lucide.dev/icons) names.

| Id | Group | Order | Label | Path | Icon | Permission | Status | Task |
|---|---|---|---|---|---|---|---|---|
| `home` | PAYMENTS | 10 | Home | `/` | House | `wallet.read.own` | LIVE | — |
| `pay` | PAYMENTS | 20 | Pay | `/pay` | Send | `payments.create` | PLANNED | FE-008 |
| `scan` | PAYMENTS | 30 | Scan | `/scan` | ScanLine | `payments.create` | PLANNED | FE-010 |
| `contacts` | PAYMENTS | 40 | Contacts | `/contacts` | Users | `contacts.manage.own` | PLANNED | FE-007 |
| `transactions` | PAYMENTS | 50 | Transactions | `/transactions` | ReceiptText | `payments.read.own` | PLANNED | FE-009 |
| `wallets` | PAYMENTS | 60 | Wallets | `/wallets` | WalletCards | `payment-methods.manage.own` | LIVE | — |
| `bills` | PAYMENTS | 70 | Bills | `/bills` | Landmark | `bills.pay` | PLANNED | FE-012 |
| `recharge` | PAYMENTS | 80 | Recharge | `/recharge` | Smartphone | `bills.pay` | PLANNED | FE-012 |
| `rewards` | PAYMENTS | 90 | Rewards | `/rewards` | Gift | `rewards.read.own` | PLANNED | FE-013 |
| `analytics` | PAYMENTS | 100 | Analytics | `/analytics` | ChartPie | `analytics.read.own` | PLANNED | FE-014 |
| `notifications` | PAYMENTS | 110 | Notifications | `/notifications` | Bell | `notifications.read.own` | PLANNED | FE-011 |
| `profile` | ACCOUNT | 10 | Profile | `/profile` | UserRound | `profile.manage.own` | LIVE | — |
| `security` | ACCOUNT | 20 | Security | `/settings/security` | ShieldCheck | `security.manage.own` | LIVE | — |
| `settings` | ACCOUNT | 30 | Settings | `/settings` | Settings | `profile.manage.own` | LIVE | — |
| `admin-users` | ADMINISTRATION | 10 | Users | `/admin/users` | UsersRound | `users.read` | PLANNED | FE-028 |
| `admin-payments` | ADMINISTRATION | 20 | Payments | `/admin/payments` | ArrowLeftRight | `payments.read.any` | PLANNED | FE-028 |
| `admin-refunds` | ADMINISTRATION | 30 | Refunds | `/admin/refunds` | Undo2 | `refunds.approve` | PLANNED | FE-028 |
| `admin-billers` | ADMINISTRATION | 40 | Billers & merchants | `/admin/billers` | Store | `billers.manage` | PLANNED | FE-028 |
| `admin-limits` | ADMINISTRATION | 50 | Limits & risk | `/admin/limits` | Gauge | `limits.manage` | PLANNED | FE-028 |
| `admin-reconciliation` | ADMINISTRATION | 60 | Reconciliation | `/admin/reconciliation` | Scale | `reconciliation.read` | PLANNED | FE-028 |
| `admin-roles` | ADMINISTRATION | 70 | Roles | `/admin/roles` | KeyRound | `roles.manage` | PLANNED | FE-028 |
| `admin-settings` | ADMINISTRATION | 80 | Platform settings | `/admin/settings` | SlidersHorizontal | `settings.manage` | PLANNED | FE-028 |
| `admin-audit` | ADMINISTRATION | 90 | Audit log | `/admin/audit-logs` | ScrollText | `audit.read` | PLANNED | FE-028 |
| `admin-reports` | ADMINISTRATION | 100 | Reports | `/admin/reports` | FileBarChart | `reports.read` | PLANNED | FE-028 |

## Master data

Stored in `master_data` (unique `type + code`) and served publicly by `GET /masters?types=a,b`.

### `currency`

| Code | Label | Attributes |
|---|---|---|
| `INR` | Indian Rupee | symbol: "₹", minorUnits: 2, locale: "en-IN" |

### `country`

| Code | Label | Attributes |
|---|---|---|
| `IN` | India | dialCode: "+91", currency: "INR" |

### `bank`

| Code | Label | Attributes |
|---|---|---|
| `SBIN` | State Bank of India | ifscPrefix: "SBIN" |
| `HDFC` | HDFC Bank | ifscPrefix: "HDFC" |
| `ICIC` | ICICI Bank | ifscPrefix: "ICIC" |
| `UTIB` | Axis Bank | ifscPrefix: "UTIB" |
| `KKBK` | Kotak Mahindra Bank | ifscPrefix: "KKBK" |
| `PUNB` | Punjab National Bank | ifscPrefix: "PUNB" |
| `BARB` | Bank of Baroda | ifscPrefix: "BARB" |
| `CNRB` | Canara Bank | ifscPrefix: "CNRB" |
| `UBIN` | Union Bank of India | ifscPrefix: "UBIN" |
| `IDIB` | Indian Bank | ifscPrefix: "IDIB" |
| `YESB` | Yes Bank | ifscPrefix: "YESB" |
| `INDB` | IndusInd Bank | ifscPrefix: "INDB" |
| `IDFB` | IDFC FIRST Bank | ifscPrefix: "IDFB" |
| `FDRL` | Federal Bank | ifscPrefix: "FDRL" |

### `upi_handle`

| Code | Label | Attributes |
|---|---|---|
| `okhdfcbank` | @okhdfcbank | bank: "HDFC" |
| `okicici` | @okicici | bank: "ICIC" |
| `oksbi` | @oksbi | bank: "SBIN" |
| `okaxis` | @okaxis | bank: "UTIB" |
| `ybl` | @ybl | bank: "YESB" |
| `paytm` | @paytm | bank: null |
| `upi` | @upi | bank: null |
| `minipay` | @minipay | bank: null, sandboxOnly: true |

### `account_type`

| Code | Label | Attributes |
|---|---|---|
| `SAVINGS` | Savings account | — |
| `CURRENT` | Current account | — |

### `payment_method_type`

| Code | Label | Attributes |
|---|---|---|
| `BANK_ACCOUNT` | Bank account | — |
| `UPI_ID` | UPI ID | — |
| `WALLET` | MiNi wallet | — |

### `payment_status`

| Code | Label | Attributes |
|---|---|---|
| `CREATED` | Created | terminal: false |
| `AWAITING_AUTHORIZATION` | Awaiting authorization | terminal: false |
| `AUTHORIZED` | Authorized | terminal: false |
| `PROCESSING` | Processing | terminal: false |
| `SUCCESS` | Successful | terminal: true |
| `FAILED` | Failed | terminal: true |
| `REVERSED` | Reversed | terminal: true |
| `REFUND_PENDING` | Refund pending | terminal: false |
| `REFUNDED` | Refunded | terminal: true |
| `CANCELLED` | Cancelled | terminal: true |
| `EXPIRED` | Expired | terminal: true |

### `transaction_type`

| Code | Label | Attributes |
|---|---|---|
| `P2P_SEND` | Sent to a person | direction: "DEBIT" |
| `P2P_RECEIVE` | Received from a person | direction: "CREDIT" |
| `MERCHANT` | Merchant payment | direction: "DEBIT" |
| `BILL` | Bill payment | direction: "DEBIT" |
| `RECHARGE` | Mobile recharge | direction: "DEBIT" |
| `REFUND` | Refund | direction: "CREDIT" |
| `TOP_UP` | Sandbox top-up | direction: "CREDIT" |

### `request_status`

| Code | Label | Attributes |
|---|---|---|
| `PENDING` | Pending | — |
| `PAID` | Paid | — |
| `DECLINED` | Declined | — |
| `CANCELLED` | Cancelled | — |
| `EXPIRED` | Expired | — |

### `spending_category`

| Code | Label | Attributes |
|---|---|---|
| `FOOD` | Food & dining | icon: "UtensilsCrossed" |
| `GROCERIES` | Groceries | icon: "ShoppingBasket" |
| `SHOPPING` | Shopping | icon: "ShoppingBag" |
| `TRAVEL` | Travel | icon: "Plane" |
| `BILLS` | Bills & utilities | icon: "Landmark" |
| `ENTERTAINMENT` | Entertainment | icon: "Clapperboard" |
| `HEALTH` | Health | icon: "HeartPulse" |
| `EDUCATION` | Education | icon: "GraduationCap" |
| `TRANSFERS` | Transfers | icon: "ArrowLeftRight" |
| `OTHER` | Other | icon: "Shapes" |

### `bill_category`

| Code | Label | Attributes |
|---|---|---|
| `ELECTRICITY` | Electricity | icon: "Zap" |
| `WATER` | Water | icon: "Droplets" |
| `GAS` | Piped gas | icon: "Flame" |
| `BROADBAND` | Broadband | icon: "Wifi" |
| `DTH` | DTH | icon: "Tv" |
| `MOBILE_POSTPAID` | Mobile postpaid | icon: "Smartphone" |
| `MOBILE_PREPAID` | Mobile recharge | icon: "Smartphone" |
| `INSURANCE` | Insurance | icon: "ShieldCheck" |

### `notification_channel`

| Code | Label | Attributes |
|---|---|---|
| `push` | Push | default: false |
| `email` | Email | default: true |
| `sms` | SMS | default: false |

### `notification_event`

| Code | Label | Attributes |
|---|---|---|
| `payments` | Payments | default: true, mandatory: false |
| `requests` | Money requests | default: true, mandatory: false |
| `promotions` | Offers & rewards | default: false, mandatory: false |
| `security` | Security alerts | default: true, mandatory: true |

### `user_status`

| Code | Label | Attributes |
|---|---|---|
| `ACTIVE` | Active | — |
| `DISABLED` | Disabled | — |

### `platform_setting`

| Code | Label | Attributes |
|---|---|---|
| `PER_TRANSACTION_LIMIT_CEILING_MINOR` | Highest per-transaction limit a user may set | value: 10000000 |
| `DAILY_LIMIT_CEILING_MINOR` | Highest daily limit a user may set | value: 20000000 |
| `DEFAULT_PER_TRANSACTION_LIMIT_MINOR` | Default per-transaction limit | value: 1000000 |
| `DEFAULT_DAILY_LIMIT_MINOR` | Default daily limit | value: 2500000 |
| `MAX_PAYMENT_METHODS` | Linked bank accounts + UPI IDs per user | value: 10 |
| `AVATAR_MAX_BYTES` | Largest avatar upload | value: 524288 |

## Entities

Fictional counterparties in `entities` (unique `code`; unique `vpa` when present), served to signed-in users by
`GET /entities?type=`. Merchant `category` values are `spending_category` codes; biller and operator categories
are `bill_category` codes. Amounts are in paise.

| Code | Type | Name | Category | VPA | City | Attributes |
|---|---|---|---|---|---|---|
| `MER_CHAI_CORNER` | MERCHANT | Chai Corner | FOOD | `chaicorner@minipay` | Bengaluru | — |
| `MER_FRESH_BASKET` | MERCHANT | Fresh Basket Grocers | GROCERIES | `freshbasket@minipay` | Pune | — |
| `MER_PAGE_TURNER` | MERCHANT | Page Turner Books | EDUCATION | `pageturner@minipay` | Kolkata | — |
| `MER_CITY_CABS` | MERCHANT | City Cabs Demo | TRAVEL | `citycabs@minipay` | Mumbai | — |
| `MER_WELLNESS_PHARMA` | MERCHANT | Wellness Pharmacy | HEALTH | `wellness@minipay` | Hyderabad | — |
| `MER_STARLIGHT_CINEMA` | MERCHANT | Starlight Cinemas | ENTERTAINMENT | `starlight@minipay` | Chennai | — |
| `MER_THREADS_STUDIO` | MERCHANT | Threads Studio | SHOPPING | `threads@minipay` | Jaipur | — |
| `BIL_BRIGHTGRID_POWER` | BILLER | BrightGrid Power (Sandbox) | ELECTRICITY | — | — | customerIdLabel: "Consumer number", customerIdPattern: "^\\d{10}$", supportsBillFetch: true |
| `BIL_CLEARFLOW_WATER` | BILLER | ClearFlow Water Board (Sandbox) | WATER | — | — | customerIdLabel: "Connection ID", customerIdPattern: "^[A-Z]{2}\\d{8}$", supportsBillFetch: true |
| `BIL_BLUEFLAME_GAS` | BILLER | BlueFlame Piped Gas (Sandbox) | GAS | — | — | customerIdLabel: "BP number", customerIdPattern: "^\\d{12}$", supportsBillFetch: true |
| `BIL_SWIFTNET_FIBER` | BILLER | SwiftNet Fiber (Sandbox) | BROADBAND | — | — | customerIdLabel: "Account number", customerIdPattern: "^\\d{8,12}$", supportsBillFetch: true |
| `BIL_SKYVIEW_DTH` | BILLER | SkyView DTH (Sandbox) | DTH | — | — | customerIdLabel: "Subscriber ID", customerIdPattern: "^\\d{10}$", supportsBillFetch: false |
| `BIL_SURESHIELD_INSURE` | BILLER | SureShield Insurance (Sandbox) | INSURANCE | — | — | customerIdLabel: "Policy number", customerIdPattern: "^[A-Z0-9]{8,16}$", supportsBillFetch: true |
| `TEL_NOVA_MOBILE` | TELECOM_OPERATOR | Nova Mobile (Sandbox) | MOBILE_PREPAID | — | — | plansMinor: [19900,29900,66600], circles: ["ALL_INDIA"] |
| `TEL_ORBIT_TELECOM` | TELECOM_OPERATOR | Orbit Telecom (Sandbox) | MOBILE_PREPAID | — | — | plansMinor: [15500,23900,71900], circles: ["ALL_INDIA"] |
| `TEL_PULSE_CONNECT` | TELECOM_OPERATOR | Pulse Connect (Sandbox) | MOBILE_POSTPAID | — | — | customerIdLabel: "Mobile number", customerIdPattern: "^[6-9]\\d{9}$", supportsBillFetch: true |
