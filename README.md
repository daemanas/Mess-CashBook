# Mess CashBook

**Mess CashBook** is a web-based mess and shared-house accounting application built with **Node.js, Express, MongoDB, Mongoose, and EJS**. It helps a mess administrator and group members keep track of member deposits, shared expenses, daily meal counts, meal costs, transactions, and end-of-period settlements.

The application uses server-rendered EJS pages and Express sessions. Records are scoped to a shared group using a `groupId`, allowing multiple members of a mess to contribute to the same accounting workspace.

> **Project status:** The repository contains a substantial working implementation of the core accounting flows, but it should be treated as an actively developed project rather than a fully production-hardened financial system. Some pages are report/UI scaffolds, some routes are not consistently protected by authentication middleware, and the current OTP/password-reset and session configuration need security improvements before public deployment.

---

## Contents

- [Overview](#overview)
- [Key features](#key-features)
- [User roles and group model](#user-roles-and-group-model)
- [How the accounting works](#how-the-accounting-works)
- [Technology stack](#technology-stack)
- [Application architecture](#application-architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Run locally](#run-locally)
- [Application routes](#application-routes)
- [Database models](#database-models)
- [Authentication and authorization](#authentication-and-authorization)
- [Progressive Web App support](#progressive-web-app-support)
- [Testing and code quality](#testing-and-code-quality)
- [Important implementation notes](#important-implementation-notes)
- [Security checklist](#security-checklist)
- [Deployment](#deployment)
- [Suggested roadmap](#suggested-roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

Mess CashBook is designed to digitize the everyday bookkeeping of a shared mess, hostel, or group household.

Instead of maintaining separate notebooks or spreadsheets, group members can use a shared workspace to record:

- Money deposited by members.
- Shared purchases and expenses (including vegetable/food expenses).
- Daily meal counts for each member.
- Monthly income and expense summaries.
- Per-meal cost calculations.
- Member-wise dues, receivables, and final settlement balances.
- Historical financial summaries by month and year.

The project also supports a personal account type in the user schema, while the primary implemented accounting workflow is based on a group created by an administrator and joined by members using a group ID.

## Key features

### 1. Account registration and login

- Generate an email verification OTP.
- Register using a verified email address.
- Create a new mess group as an administrator.
- Join an existing mess group using its group ID as a member.
- Log in using email and password.
- Hash account passwords with `bcryptjs`.
- Maintain a server-side login session.
- Log out and destroy the current session.
- Forgot-password and OTP-based password-reset pages.

### 2. Group management

- Generate a unique-looking group code with the `CB-` prefix when a group administrator registers.
- Allow a new member to register against an existing group ID.
- Keep money, expense, and meal records associated with a `groupId`.
- Display group member information.
- Promote a member to administrator.
- Remove a member from the group.

The group ID is the central boundary used by the accounting queries. It is not a substitute for robust authorization: every route that reads or changes group data must verify the current session and group membership.

### 3. Member money / deposits

- Record money received from a member.
- Store the member name/title, amount, date, group ID, and user who entered the record.
- View money-added records.
- Group deposits by member/title in the money dashboard.
- Delete a member's grouped deposit records or an individual deposit record.

### 4. Shared expense management

- Add one or more expense entries from the expense form.
- Record an expense date, item/category name, amount, group ID, and submitting user.
- View expenses grouped by date.
- View expense totals for the selected month.
- Delete expenses by date or delete an individual expense record.

The current expense model is named `VagetableExpense` in Mongoose and the schema file is `models/moneyExpenses.js`; the UI commonly describes these as vegetable or mess expenses.

### 5. Daily meal tracking

- Select a member from the names available in the group's money/deposit records.
- Record that member's meal count for the current day.
- Store meal entries as an array inside a `MealUser` document.
- Avoid adding a second meal entry for the same member on the same calendar day.
- View member-wise meal counts for a selected month.
- View total meals across the group.
- Delete a member's meal record or an individual meal entry (subject to the route/controller permission checks).

### 6. Meal billing

The meal billing workflow combines group expenses and meal counts to calculate the cost per meal.

At a high level:

```text
Per-meal cost = Total shared expense / Total meals
```

A member's meal charge is then:

```text
Member meal charge = Member's meal count × Per-meal cost
```

The billing page is intended to show member-wise meal usage and the calculated meal cost. The final settlement page compares each member's recorded deposits/payments with their calculated meal charge.

### 7. Final settlement

The settlement workflow calculates:

- Total shared expense.
- Total meal count.
- Cost per meal.
- Member-wise meal count.
- Member-wise amount paid/deposited.
- Member-wise payable amount.
- Final balance and settlement status.

The status logic in the controller is:

| Balance | Status | Meaning |
|---|---|---|
| Positive | `RECEIVE` | Member has paid more than the calculated payable amount. |
| Negative | `DUE` | Member still owes money. |
| Zero | `CLEAR` | Member's payment and payable amount match. |

**Accounting note:** The current implementation matches recorded payments to meal users by normalized name/title. Names are not reliable unique identifiers. A future version should link payments and meal records to a stable member/user ID.

### 8. Transactions and financial history

- Combined income and expense transaction view.
- Month/year query parameters.
- Date range, type, and search filter UI.
- Pagination in the transaction view.
- Member money-added history.
- Expense history.
- Yearly income/expense totals.
- Month-wise details for a selected year.
- Year balance calculation (`income - expense`).

### 9. Reports and settings

The repository includes EJS pages for:

- Reports and monthly summary presentation.
- Settings and profile information.
- Group member management.
- Error/404 display.

Some report and settings elements are presentation-oriented and should be checked against their controller implementation before being treated as fully functional.

### 10. PWA foundation

The public directory includes:

- `manifest.json` with the app name, display mode, theme, and icon declarations.
- `sw.js` with basic service-worker install/fetch event listeners.
- 192px and 512px app icon assets.
- A shared PWA partial.

This is only a basic PWA foundation. The current service worker does not implement offline caching, update handling, or meaningful fetch strategies.

---

## User roles and group model

The `User` model defines these roles:

| Role | Intended purpose |
|---|---|
| `admin` | Creates/manages a mess group and performs group administration. |
| `member` | Joins an existing group and participates in shared accounting. |
| `personal` | Reserved account type in the schema; a complete separate personal-account workflow is not evident in the current route implementation. |

### Group creation and joining

1. A user requests an OTP for their email address.
2. The user submits registration details and the OTP.
3. If `accountType` is `admin`, the application generates a new group ID.
4. If `accountType` is `member`, the user must supply a valid group ID belonging to an existing admin.
5. The account is saved with its role and group ID.
6. Group records are queried using that group ID.

Example group ID format:

```text
CB-A1B2C3
```

The actual suffix is randomly generated; the example above is illustrative.

---

## How the accounting works

### Income / member deposits

Each deposit is stored as a `MoneyAdd` record:

- `entry_title` — member name or deposit title.
- `entry_amount` — deposited amount.
- `entry_date` — transaction date.
- `groupId` — shared group identifier.
- `user` — account that created the record.

The dashboard aggregates deposit amounts for the selected month.

### Shared expenses

Each expense is stored as a `VagetableExpense` record:

- `entry_date` — date of expense.
- `vag_name` — expense item/title.
- `entry_amount` — amount spent.
- `groupId` — shared group identifier.
- `user` — account that created the record.

The dashboard calculates available balance as:

```text
Available balance = Total deposits − Total shared expenses
```

### Meal records

A `MealUser` document represents one mess member and contains a `meals` array. Each meal item stores:

- `date`
- `food_count`

The meal dashboard filters these entries by month and calculates each member's total.

### Meal cost and settlement

The intended calculation is:

```text
Total meal count = Sum of all members' meal counts
Per-meal cost = Total shared expense / Total meal count
Member payable = Member meal count × Per-meal cost
Member balance = Member deposits − Member payable
```

A zero-meal period must be handled explicitly to avoid division by zero. The controller includes a zero-total guard for the per-meal calculation.

**Important accounting limitation:** The settlement logic currently uses the member's name as the key to associate deposit totals with meal records. Duplicate names, spelling differences, or inconsistent capitalization can produce incorrect settlement results. Use a stable member reference in a future schema migration.

---

## Technology stack

| Technology | Purpose |
|---|---|
| Node.js 20 | JavaScript runtime |
| Express 5 | Web server and routing |
| MongoDB | Persistent document database |
| Mongoose 9 | MongoDB schemas, queries, and aggregation |
| EJS | Server-side HTML templating |
| `express-session` | Session-based authentication |
| `connect-mongo` | Persist sessions in MongoDB |
| `bcryptjs` | Password hashing and comparison |
| `dotenv` | Environment variable loading |
| Nodemailer | Email/OTP delivery |
| HTML5 / CSS3 / JavaScript | Frontend UI and interactions |
| Service Worker / Web App Manifest | Basic PWA installation support |

The UI is rendered with EJS templates and regular CSS. This repository does not use React or a client-side SPA framework.

---

## Application architecture

```text
                 User's browser
                       |
                       v
              Express static assets
                       |
                       v
              Express + EJS views
                       |
             Authentication session
                       |
              Router / Controller
                       |
              Mongoose data models
                       |
                       v
                    MongoDB
                       |
               Mongo session store

        External email delivery (SMTP)
```

### Request lifecycle

1. The browser requests a page or submits a form.
2. Express parses the URL-encoded or JSON request body.
3. Session middleware loads the session from MongoDB.
4. Router middleware checks authentication where configured.
5. A controller reads/writes MongoDB records using Mongoose.
6. The controller renders an EJS view or redirects to another route.
7. Express returns the rendered HTML response.

### Main application files

- `server.js` — loads environment variables, configures Express/EJS/static assets/session middleware, mounts routers, handles 404/errors, connects MongoDB, and starts the server.
- `router/authRouter.js` — authentication and account routes.
- `router/userRouter.js` — dashboard, accounting, history, and group-management routes.
- `controller/authController.js` — OTP, registration, login, logout, and password reset logic.
- `controller/userController.js` — accounting workflows, queries, calculations, and page rendering.
- `middleware/isAuth.js` — checks the session login flag.
- `middleware/isAdmin.js` — checks the session user's admin role.

---

## Project structure

```text
Mess-CashBook/
│
├── controller/
│   ├── authController.js
│   └── userController.js
│
├── middleware/
│   ├── isAdmin.js
│   └── isAuth.js
│
├── models/
│   ├── User.js
│   ├── member.js
│   ├── mealUser.js
│   ├── moneyAdd.js
│   └── moneyExpenses.js
│
├── router/
│   ├── authRouter.js
│   └── userRouter.js
│
├── util/
│   ├── generateGroupId.js
│   ├── generateOtp.js
│   ├── pathUtil.js
│   └── sendEmail.js
│
├── views/
│   ├── auth/
│   │   ├── create-otp.ejs
│   │   ├── forgot-password.ejs
│   │   ├── generateOTP.ejs
│   │   ├── login.ejs
│   │   ├── register.ejs
│   │   └── reset-password.ejs
│   │
│   ├── host/
│   │   ├── Add-Entry.ejs
│   │   ├── AddExpense.ejs
│   │   ├── AddMeal.ejs
│   │   ├── AddedExpention.ejs
│   │   ├── AddedMeal.ejs
│   │   ├── FinalSettlement.ejs
│   │   ├── MealBilling.ejs
│   │   ├── Reports.ejs
│   │   ├── Settings.ejs
│   │   ├── Transactions.ejs
│   │   ├── YearDetails.ejs
│   │   ├── YearHistory.ejs
│   │   ├── groupMembers.ejs
│   │   ├── index.ejs
│   │   ├── moneyAdded.ejs
│   │   └── error.ejs
│   │
│   └── partials/
│       ├── header.ejs
│       ├── loader.ejs
│       ├── monthFilter.ejs
│       └── pwa.ejs
│
├── public/
│   ├── icons/
│   ├── manifest.json
│   ├── style.css
│   └── sw.js
│
├── util/
├── server.js
├── package.json
├── package-lock.json
├── nodemon.json
└── .gitignore
```

---

## Getting started

### Prerequisites

Install:

- Node.js **20.x** (the project declares `20.x` in `package.json`).
- npm.
- MongoDB Community Server or a MongoDB Atlas cluster.
- Git (optional).
- A code editor such as Visual Studio Code.

Verify your installation:

```bash
node --version
npm --version
```

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd Mess-CashBook-main
```

If you downloaded the ZIP, extract it and open a terminal in the extracted project directory.

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Create a `.env` file in the project root. The repository's `.gitignore` already excludes `.env`.

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/mess_cashbook
SESSION_SECRET=replace_with_a_long_random_secret

SMTP_HOST=smtp-relay.brevo.com
SMTP_USER=your_smtp_login
SMTP_PASS=your_smtp_password
MAIL_FROM=Mess CashBook <your-verified-sender@example.com>
```

Use SMTP credentials from your email provider. The OTP controller currently uses `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`; it connects on port `2525` with TLS required. Change the port/configuration in the controller if your provider requires another supported SMTP setup.

### 4. Start MongoDB

For local development, make sure the MongoDB service is running and that `MONGO_URI` points to the correct database.

For MongoDB Atlas, use the connection string provided by Atlas and URL-encode any special characters in the database credentials.

### 5. Start the application

```bash
npm start
```

The server defaults to:

```text
http://localhost:3000
```

The application connects to MongoDB before starting the HTTP listener. If the database connection fails, check the URI, network access, credentials, and MongoDB service status.

---

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `PORT` | HTTP server port; defaults to `3000` | No |
| `MONGO_URI` | MongoDB connection URI | Yes |
| `SESSION_SECRET` | Signs Express session cookies | Yes |
| `SMTP_HOST` | SMTP server hostname | For email OTP |
| `SMTP_USER` | SMTP username/login | For email OTP |
| `SMTP_PASS` | SMTP password/API credential | For email OTP |
| `MAIL_FROM` | Verified sender address/name | For email OTP |

Never commit real `.env` credentials. Use a strong random `SESSION_SECRET` and rotate any secret that has been exposed.

---

## Run locally

### Start the server

```bash
npm start
```

### Development mode

The repository includes a `nodemon.json` configuration, but `package.json` does not define a `dev` script. You can run Nodemon directly if installed:

```bash
npx nodemon server.js
```

For a cleaner developer experience, add a script to `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

### Open the application

Visit:

```text
http://localhost:3000
```

The root dashboard route requires an authenticated session and redirects unauthenticated users to `/login`.

---

## Application routes

The application uses traditional server-rendered routes rather than a JSON REST API. The route names below are taken from `router/authRouter.js` and `router/userRouter.js`.

### Authentication routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/generateOTP` | Render email OTP request page |
| POST | `/generateOTP` | Generate and send verification OTP |
| GET | `/register` | Render registration page |
| POST | `/register` | Verify OTP and create account |
| GET | `/login` | Render login page |
| POST | `/login` | Authenticate user and create session |
| GET | `/logout` | Destroy current session |
| GET | `/forgot-password` | Render password recovery page |
| POST | `/forgot-password` | Generate password reset OTP |
| GET | `/reset-password` | Render password reset page |
| POST | `/reset-password` | Validate OTP and update password |

### Dashboard and accounting routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Group dashboard and monthly overview |
| GET | `/add-entry` | Render member money-entry form |
| POST | `/add-entry` | Save member deposit(s) |
| GET | `/add-expense` | Render shared expense form |
| POST | `/add-expense` | Save shared expense entries |
| GET | `/add-Meal` | Render meal entry form |
| POST | `/add-Meal` | Save daily meal count |
| GET | `/setting` | Settings page |
| GET | `/reports` | Reports page |
| GET | `/transactions` | Combined transaction history |
| GET | `/moneyAdded` | Member deposit records |
| GET | `/expentionAdded` | Shared expense records |
| GET | `/AddedMeal` | Meal records |
| GET | `/meal-billing` | Meal billing summary |
| GET | `/final-settlement` | Member-wise final settlement |
| GET | `/year-history` | Yearly accounting summary |
| GET | `/year-history/:year` | Month-wise details for a year |

### Group management and deletion routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/settings/members` | List group members |
| POST | `/settings/members/:id/make-admin` | Promote a group member |
| POST | `/settings/members/:id/remove` | Remove a group member |
| POST | `/money-delete-group/:title` | Delete matching deposit group |
| POST | `/expense-delete-date/:date` | Delete expenses for a date |
| POST | `/meal-delete-user/:id` | Delete a meal-user record |
| POST | `/expense-delete-single/:id` | Delete one expense |
| POST | `/meal-delete-single/:userId/:mealId` | Delete one meal entry |
| POST | `/money-delete-single/:id` | Delete one deposit |

**Authorization warning:** Not every route in `userRouter.js` currently has `isAuth` attached. Several list, report, and delete routes are declared without route-level authentication middleware. Some controller functions perform their own role checks, but this is inconsistent. Protect every private read and write route before deploying the application.

---

## Database models

The application uses Mongoose models.

### `User` — `models/User.js`

Stores account and group information.

| Field | Type | Purpose |
|---|---|---|
| `name` | String | User's name |
| `email` | String | Unique email address |
| `password` | String | Hashed password |
| `otp` | String | Verification/reset OTP |
| `otpExpires` | Date | OTP expiry |
| `role` | String | `personal`, `admin`, or `member` |
| `groupId` | String | Shared group identifier |
| `isVerified` | Boolean | Email/account verification state |

### `Member` — `models/member.js`

Stores a member name and a reference to a `User`. The current main controller primarily uses `User` records for group membership; this model is present but is not central to the observed workflows.

### `MoneyAdd` — `models/moneyAdd.js`

Stores deposits or money received from a member:

- `entry_title`
- `entry_amount`
- `entry_date`
- `groupId`
- `user`
- Mongoose timestamps (`createdAt`, `updatedAt`)

### `VagetableExpense` — `models/moneyExpenses.js`

Stores shared expense records:

- `entry_date`
- `vag_name`
- `entry_amount`
- `groupId`
- `user`
- Mongoose timestamps

### `MealUser` — `models/mealUser.js`

Stores one member's meal history:

- `name`
- `meals[]` — embedded entries containing `date` and `food_count`
- `groupId`
- `user`
- Mongoose timestamps

The meal schema uses an array of subdocuments, so each member's daily meal entries are stored inside one `MealUser` document.

---

## Authentication and authorization

### Session-based authentication

The server uses:

- `express-session` for session management.
- `connect-mongo` for storing sessions in MongoDB.
- `isAuth` middleware to check `req.session.isLoggedIn`.
- `isAdmin` middleware to check `req.session.user.role`.

The login controller stores a limited user object in the session:

- User ID
- Name
- Email
- Role
- Group ID

### Password security

Passwords are hashed with `bcryptjs` using a work factor of `10` before storage. Login uses `bcrypt.compare()` to verify a submitted password.

### OTP flow

The registration flow:

1. Accepts an email address.
2. Generates a six-digit OTP.
3. Stores the OTP and a five-minute expiry on the user record.
4. Sends the OTP through the configured SMTP transport.
5. Validates the OTP during registration.
6. Hashes the password and marks the account as verified.

### Important authentication limitations

The current code should be hardened before deployment:

- OTPs are stored as plain text.
- OTP generation uses `Math.random()` rather than a cryptographically secure random generator.
- The password-reset controller renders the OTP in the reset page (`otpShown`), which defeats email-based verification.
- OTP endpoints do not have visible rate limiting or attempt limits.
- The session cookie does not explicitly set `httpOnly`, `secure`, and `sameSite` options in the current configuration.
- Session secret configuration should be validated at startup.
- The `isAdmin` middleware assumes `req.session.user` exists; it should handle missing sessions safely.
- Use POST for logout rather than a state-changing GET request.
- Add CSRF protection for form submissions and sensitive state-changing actions.

---

## Progressive Web App support

The repository includes a basic PWA setup:

- `public/manifest.json` declares `Mess CashBook` as the application name.
- Display mode is `standalone`.
- The manifest declares 192px and 512px icons.
- `public/sw.js` registers install and fetch listeners.
- `views/partials/pwa.ejs` provides a reusable PWA partial.

To make the PWA production-ready:

- Register the service worker from the page.
- Implement an intentional caching strategy for static assets.
- Add offline fallback behavior.
- Handle service worker updates.
- Confirm manifest icon MIME types match the actual image files.
- Test installation and standalone behavior on supported browsers.
- Serve the application over HTTPS (except localhost development).

The current service worker is a placeholder and does not provide offline functionality.

---

## Testing and code quality

The current `package.json` contains:

```bash
npm test
```

However, the configured test script only prints `Error: no test specified` and exits with status `1`. No automated test suite is included in the repository snapshot.

Recommended tests:

- OTP generation, expiry, and invalid-attempt handling.
- Registration as group admin and group member.
- Login, logout, and session expiry.
- Group isolation: a user must never access another group's records.
- Money entry validation and aggregation.
- Expense entry validation and monthly totals.
- Duplicate meal-entry prevention.
- Meal billing with zero meals and zero expenses.
- Final settlement calculations and name/identity matching.
- Admin-only role changes and destructive operations.
- Date range filters, year history, and pagination.

For accounting correctness, test calculation functions independently with known input/output examples.

---

## Important implementation notes

The following are concrete observations from the inspected source code.

1. **Group-scoped data:** Most core accounting queries use `groupId` to separate groups. Continue applying this filter to every read, update, and delete operation.
2. **Name-based settlement matching:** Deposits are aggregated by `entry_title` and compared to meal-user names. This can mismatch people. Prefer a `memberId` reference.
3. **Inconsistent route protection:** Some routes that access session/group data are not protected by `isAuth` at the router level. Add consistent authentication middleware.
4. **Admin middleware is not consistently applied:** Some controller methods check `role` directly, while `isAdmin.js` exists separately. Centralize role checks.
5. **OTP reset disclosure:** The forgot-password controller sends the OTP to the reset template as `otpShown`. Remove this behavior and require the user to enter the OTP received through email.
6. **SMTP configuration:** `util/sendEmail.js` contains hard-coded placeholder Gmail credentials, while the active OTP controller configures Nodemailer using environment variables. Standardize email delivery through one environment-driven service and remove unused hard-coded credentials.
7. **PWA is incomplete:** The service worker currently logs installation and does not cache assets or provide offline support.
8. **Reports implementation:** The reports page renders a view, but the controller does not calculate report datasets in the observed implementation. Treat the page as a UI/report scaffold until calculations are connected.
9. **No automated tests:** The package test script is a placeholder.
10. **Session hardening:** Configure secure cookie flags, session expiry, and production proxy settings as appropriate for the hosting platform.

---

## Security checklist

Before using the application with real financial records:

- [ ] Add `isAuth` to every private page and mutation route.
- [ ] Add `isAdmin` or a centralized role authorization layer to admin-only actions.
- [ ] Verify group ownership/membership for every database operation.
- [ ] Add CSRF protection to form submissions.
- [ ] Add rate limiting to login, registration, OTP, and password reset.
- [ ] Use `crypto.randomInt()` or an equivalent secure generator for OTPs.
- [ ] Hash OTPs at rest and invalidate them after successful use.
- [ ] Never render or log password-reset OTPs.
- [ ] Validate email, amounts, dates, and all submitted fields on the server.
- [ ] Reject negative, non-finite, and malformed monetary values.
- [ ] Use stable member IDs for settlement calculations.
- [ ] Set session cookie `httpOnly`, `secure` in production, and appropriate `sameSite`.
- [ ] Use a strong `SESSION_SECRET`.
- [ ] Use HTTPS in production.
- [ ] Add audit logs for destructive financial actions.
- [ ] Back up MongoDB and test database restoration.
- [ ] Remove hard-coded email credentials and rotate exposed secrets.

---

## Deployment

The app can be deployed to a Node.js hosting provider with a reachable MongoDB database.

### Production configuration

Set these environment variables in the hosting platform:

```env
NODE_ENV=production
PORT=3000
MONGO_URI=<production-mongodb-connection-string>
SESSION_SECRET=<strong-random-secret>

SMTP_HOST=<smtp-host>
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password>
MAIL_FROM=<verified-sender>
```

The hosting platform may inject `PORT` automatically; the server already reads `process.env.PORT`.

### Deployment checklist

- Use Node.js 20.x as declared in the package manifest.
- Install dependencies with `npm ci` when using the committed lockfile.
- Start the app with `npm start`.
- Configure MongoDB network access and credentials.
- Set a strong session secret.
- Configure SMTP sender/domain verification.
- Enable HTTPS.
- Configure secure session cookies and proxy trust if TLS terminates at the hosting proxy.
- Confirm persistent MongoDB session storage.
- Add health checks, monitoring, logs, and database backups.
- Test registration, login, deposits, expenses, meals, and settlement in a staging environment.
- Do not use real financial data until the authorization and accounting issues are addressed.

---

## Suggested roadmap

### Phase 1 — Security and reliability

- Standardize authentication middleware across all private routes.
- Add role and group ownership checks to every controller action.
- Replace insecure OTP generation/storage and remove OTP disclosure.
- Add CSRF protection and rate limiting.
- Harden session cookie settings.
- Validate all money and date inputs.

### Phase 2 — Accounting accuracy

- Replace member-name matching with stable member IDs.
- Add a dedicated member model or reference users consistently.
- Add settlement calculation unit tests.
- Define how refunds, corrections, carry-forward balances, and deleted members affect historical accounts.
- Use decimal-safe money handling (for example, store integer paise/cents rather than binary floating-point currency values).

### Phase 3 — Product improvements

- Complete the Reports page with real monthly/yearly data.
- Improve transaction search and pagination.
- Add export to CSV/PDF.
- Add audit history for edited/deleted entries.
- Add member invitation and group joining guidance.
- Add useful validation/error messages in forms.
- Complete PWA caching and offline behavior.

### Phase 4 — Production operations

- Add automated tests and CI.
- Add structured logging and error monitoring.
- Add scheduled database backups.
- Add restore testing and operational documentation.
- Perform a security review before public launch.

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Keep routes, controllers, models, middleware, and utility logic separated by responsibility.
4. Apply group scoping and authorization to every data operation.
5. Add tests for accounting calculations and permission boundaries.
6. Run the application locally and verify the affected EJS flows.
7. Do not commit `.env` files, credentials, database dumps, or real user financial data.

## License

The `package.json` declares the **ISC** license. If this is the intended license for the entire repository, include a root-level `LICENSE` file containing the ISC license text so that GitHub and downstream users can identify the usage terms clearly.
