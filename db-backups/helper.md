✅ STEP 4 — Create New Database in DigitalOcean

You have 2 options:

Option A — Using psql (recommended now)

Connect first:

psql "host=ddcscc-do-user-33103258-0.j.db.ondigitalocean.com port=25060 user=doadmin dbname=defaultdb sslmode=require"

Then inside psql run:

CREATE DATABASE solar_prod;

(You can change name if you want.)

Then exit:

\q
✅ STEP 5 — Restore Backup Into New Database

Now restore into the new DB:

/opt/homebrew/opt/postgresql@17/bin/pg_restore \
  -h ddcscc-do-user-33103258-0.j.db.ondigitalocean.com \
  -p 25060 \
  -U doadmin \
  -d solar_prod \
  --no-owner \
  --no-privileges \
  solar-demo-backup.dump
⚠ Important

Do NOT use --clean because solar_prod is empty.

✅ STEP 6 — Verify

Connect to new DB:

psql "host=ddcscc-do-user-33103258-0.j.db.ondigitalocean.com port=25060 user=doadmin dbname=solar_prod sslmode=require"

Then:

\dt

You should see all your tables.



FOR Dump

/opt/homebrew/opt/postgresql@17/bin/pg_dump \
  -h ddcscc-do-user-33103258-0.j.db.ondigitalocean.com \
  -p 25060 \
  -U doadmin \
  -d defaultdb \
  -Fc \
  -f defaultdb-backup.dump
  