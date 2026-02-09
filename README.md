# Solar Systems API

This is a REST API service for managing solar energy systems.

## Project Structure

```
solar-systems-api/
├── migrations/            # Database migration files
├── seeders/               # Database seed files
└── src/                   # Source code
    ├── common/            # Common utilities and middlewares
    │   ├── errors/        # Error handling
    │   ├── middlewares/   # Express middlewares
    │   └── utils/         # Utility functions
    ├── config/            # Configuration files
    ├── models/            # Sequelize models
    ├── modules/           # Feature modules
    │   ├── auth/          # Authentication module
    │   └── user/          # User management module
    ├── routes/            # API routes
    └── server.js          # startup file




```

## Prerequisites

- Node.js (v20 or higher)
- PostgreSQL database
- npm package manager

## Setup Instructions

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory (see `.env.example` for reference). For **production/cloud** (e.g. Render, Railway, Aiven):

   - Set **`DB_SSL_CA`** in your host’s environment variables with the full CA certificate PEM content. Use literal `\n` for newlines (e.g. `-----BEGIN CERTIFICATE-----\nMIIE...\n-----END CERTIFICATE-----`). Do not commit the PEM file; the repo uses env-only for SSL CA in production.

## Running the Application

To start the development server:

```bash
npm run dev
```

To start in production mode:

```bash
npm start
```

## Deployment

The API supports two deployment modes:

- **Single-tenant (dedicated):** One API instance and one database. Leave `TENANT_REGISTRY_DB_URL` unset. See [Single-tenant (dedicated) deployment](docs/deploy-single-tenant.md).
- **Multi-tenant (shared):** One API instance, a Registry database, and one database per tenant. Set `TENANT_REGISTRY_DB_URL` and `MASTER_ENCRYPTION_KEY`. See [Multi-tenant (shared) deployment](docs/deploy-multi-tenant.md).

**Connection pools:** Use `DB_POOL_MAX` and `DB_POOL_MIN` (defaults 5 and 0) to stay within managed Postgres connection limits (e.g. Aiven). Keeping these low avoids errors like "remaining connection slots are reserved for roles with the SUPERUSER attribute". See the deploy guides for details.

## Database Management

### Running Migrations

To create database tables, run:

```bash
npm run db:migrate
or
npx sequelize-cli db:migrate

```

To undo the last migration:

```bash
npm run db:migrate:undo
or
npx sequelize-cli db:migrate:undo

```

To undo all migrations:

```bash
npm run db:migrate:undo:all
or
npx sequelize-cli db:migrate:undo:all

```

### Running Seeders

To seed the database with initial data:

```bash
npm run db:seed:all
or
npx sequelize-cli db:seed:all

```

To undo the last seeder:

```bash
npm run db:seed:undo
or
npx sequelize-cli db:seed:undo

```

To undo all seeders:

```bash
npm run db:seed:undo:all
or
npx sequelize-cli db:seed:undo:all

```

## Available API Modules

1. Authentication Module

   - User registration
   - User login
   - Google OAuth authentication
   - Token management

2. User Management Module
   - User profile management
   - Role-based access control
   - Module permissions

## Error Handling

The API uses a centralized error handling mechanism with custom error classes. All errors are properly formatted and returned with appropriate HTTP status codes.

## Middleware

- Authentication middleware for protected routes
- Route logging for debugging
- CORS configuration
- Error handling middleware

## Models

- User
- Role
- Module
- RoleModule
- UserToken

Each model includes proper associations and validation rules.

## process to initialte

- npm run dev // to start server
- npm run db:migrate // to generate database
- npm run db:seed // to genarete required default data
- npm run db:reset // too reset database
- npm run db:make-migration --name create-table-test // to create new migration
