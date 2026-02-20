# Production database SSL (Digital Ocean / managed Postgres)

When running on Digital Ocean (or any managed PostgreSQL) with `NODE_ENV=production`, the API uses SSL for the database connection. Use the provider’s CA certificate so the server is verified.

## 1. Get the CA certificate

- **Digital Ocean**: In the Control Panel → Databases → your cluster → **Connection details** → download the **CA certificate** (e.g. `ca-certificate.crt`).
- The file is usually PEM format (starts with `-----BEGIN CERTIFICATE-----`). Both `.crt` and `.pem` are supported.

## 2. Place the certificate in the project

Copy the CA file into the API project, for example:

```text
techhind-solar-api/
  src/
    config/
      ca-certificate.crt   ← your Digital Ocean CA cert
```

Use any filename you like (e.g. `do-db-ca.crt`). Keep this path out of version control if it contains sensitive deployment-specific data (e.g. add `src/config/*.crt` to `.gitignore` and deploy the file via your pipeline or secrets).

## 3. Configure the environment

In your production `.env` (or environment variables on Digital Ocean App Platform):

```env
NODE_ENV=production
DB_HOST=your-cluster.db.ondigitalocean.com
DB_PORT=25060
DB_NAME=defaultdb
DB_USER=doadmin
DB_PASS=your-password

# Path to the CA file (relative to project root)
DB_SSL_CA_PATH=./src/config/ca-certificate.crt
```

If you use a different path, set `DB_SSL_CA_PATH` to that path (e.g. `./src/config/do-db-ca.crt`).

## 4. Behaviour

- **Production** (`NODE_ENV=production`): SSL is enabled. If `DB_SSL_CA_PATH` (or `DB_SSL_CA`) is set, the server certificate is verified using that CA (`rejectUnauthorized: true`). If the CA file is missing, the app falls back to SSL without verification.
- **Development / test**: SSL is disabled by default so local Postgres works without a cert.

Migrations (`npm run db:migrate`) use the same config and resolve `DB_SSL_CA_PATH` from the project root, so they work on Digital Ocean as long as the cert file is present at the given path.
