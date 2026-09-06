ALTER TABLE mfa_factors ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE sessions ADD COLUMN csrf_hash text;
ALTER TABLE sessions ADD COLUMN mfa_satisfied_at timestamptz(3);
ALTER TABLE sessions ADD COLUMN replaced_by_id uuid;

CREATE TABLE auth_login_challenges (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id),
 user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz(3) NOT NULL,
 used_at timestamptz(3),
 FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id)
);
CREATE INDEX auth_login_challenges_active_idx ON auth_login_challenges(token_hash, expires_at) WHERE used_at IS NULL;
CREATE TABLE auth_totp_replays (
 factor_id uuid NOT NULL REFERENCES mfa_factors(id),
 time_step text NOT NULL,
 consumed_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (factor_id, time_step)
);
CREATE TABLE auth_rate_limits (
 key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
 locked_until timestamptz(3),
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);ALTER TABLE users ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX users_auth_email_idx ON users(organization_id,lower(email));
CREATE UNIQUE INDEX mfa_one_enabled_per_user ON mfa_factors(organization_id,user_id) WHERE enabled;
ALTER TABLE sessions ADD CONSTRAINT sessions_csrf_format CHECK (csrf_hash IS NULL OR csrf_hash ~ '^[0-9a-f]{64}$');
CREATE TABLE auth_security_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id uuid, action text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('passed','denied')),
 account_ref text NOT NULL CHECK(account_ref ~ '^[0-9a-f]{64}$'), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE TRIGGER auth_security_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON auth_security_events FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
