-- ============================================================
-- Meta (Facebook) Lead Ads Integration — DB Migration
-- Run this once on each tenant database (and the registry DB
-- if you are seeding shared mode).
-- ============================================================

-- 1. facebook_accounts
-- Stores one row per Facebook user-account linked by a platform user.
CREATE TABLE IF NOT EXISTS facebook_accounts (
  id               SERIAL PRIMARY KEY,
  user_id          BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fb_user_id       VARCHAR(255)  NOT NULL,
  display_name     VARCHAR(255),
  short_access_token TEXT,
  access_token     TEXT          NOT NULL,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  created_by       INTEGER       REFERENCES users(id),
  updated_by       INTEGER       REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_fb_accounts_user_id ON facebook_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_accounts_fb_user_id ON facebook_accounts(fb_user_id);


-- 2. facebook_pages
-- One row per Facebook Page accessible by a linked account.
CREATE TABLE IF NOT EXISTS facebook_pages (
  id                 SERIAL PRIMARY KEY,
  account_id         BIGINT        NOT NULL REFERENCES facebook_accounts(id) ON DELETE CASCADE,
  page_id            VARCHAR(255)  NOT NULL,
  page_name          VARCHAR(255),
  page_access_token  TEXT          NOT NULL,
  is_subscribed      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,
  created_by         INTEGER       REFERENCES users(id),
  updated_by         INTEGER       REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_pages_account_page ON facebook_pages(account_id, page_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fb_pages_page_id ON facebook_pages(page_id);


-- 3. facebook_lead_forms
-- One row per Lead Form on a Page.
CREATE TABLE IF NOT EXISTS facebook_lead_forms (
  id           SERIAL PRIMARY KEY,
  page_id      BIGINT        NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
  form_id      VARCHAR(255)  NOT NULL,
  form_name    VARCHAR(255),
  form_status  VARCHAR(50),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  created_by   INTEGER       REFERENCES users(id),
  updated_by   INTEGER       REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_forms_page_form ON facebook_lead_forms(page_id, form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fb_forms_form_id ON facebook_lead_forms(form_id);


-- 4. Seed the Facebook inquiry_source (if not exists)
-- This row is looked up by the webhook/lead-sync to set inquiry_source_id on new marketing_leads.
INSERT INTO inquiry_sources (source_name, created_at, updated_at)
SELECT 'Facebook', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM inquiry_sources WHERE source_name ILIKE 'Facebook' AND deleted_at IS NULL
);


-- Done ✅
-- After running this migration, set the following environment variables:
--   META_APP_ID       = your Facebook App ID
--   META_APP_SECRET   = your Facebook App Secret
--   META_VERIFY_TOKEN = any secret string for webhook verification
--   META_REDIRECT_URI = https://yourdomain.com/api/meta/oauth/callback
