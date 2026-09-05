-- SQL owns composite references, range exclusions and concurrency guards.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE workplaces (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE (id, organization_id),
  CHECK (timezone = 'Asia/Ho_Chi_Minh')
);

CREATE TABLE opening_hour_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (workplace_id, organization_id) REFERENCES workplaces(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, workplace_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE public_holidays (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  source_ref text NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE (organization_id, holiday_date)
);

CREATE TABLE employees (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  FOREIGN KEY (workplace_id, organization_id) REFERENCES workplaces(id, organization_id),
  UNIQUE (id, organization_id),
  UNIQUE (id, organization_id, workplace_id),
  CHECK (status IN ('active','inactive'))
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  role text NOT NULL,
  email text NOT NULL,
  password_hash text,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, email),
  CHECK (role IN ('owner','accountant'))
);

CREATE TABLE employment_contracts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  kind text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  FOREIGN KEY (employee_id, organization_id) REFERENCES employees(id, organization_id),
  UNIQUE (id, organization_id, employee_id),
  CHECK (kind IN ('full_time','part_time')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, employee_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE compensation_terms (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  contract_id uuid NOT NULL,
  monthly_salary_vnd bigint,
  hourly_rate_vnd bigint,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (employee_id, organization_id) REFERENCES employees(id, organization_id),
  FOREIGN KEY (contract_id, organization_id, employee_id) REFERENCES employment_contracts(id, organization_id, employee_id),
  UNIQUE (id, organization_id, employee_id, content_hash),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK ((monthly_salary_vnd IS NOT NULL AND monthly_salary_vnd >= 0 AND hourly_rate_vnd IS NULL) OR (hourly_rate_vnd IS NOT NULL AND hourly_rate_vnd >= 0 AND monthly_salary_vnd IS NULL)),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, employee_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE delivery_destinations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  channel text NOT NULL,
  address text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (employee_id, organization_id) REFERENCES employees(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  UNIQUE (id, organization_id, employee_id, content_hash),
  CHECK (channel IN ('email','zalo_manual')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, employee_id WITH =, channel WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE schedule_templates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  UNIQUE (id, organization_id)
);

CREATE TABLE schedule_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  template_id uuid NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
  FOREIGN KEY (template_id, organization_id) REFERENCES schedule_templates(id, organization_id),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, employee_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE clock_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  direction text NOT NULL,
  occurred_at timestamptz(3) NOT NULL,
  request_hash text NOT NULL,
  FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
  UNIQUE (organization_id, workplace_id, employee_id, idempotency_key),
  CHECK (direction IN ('IN','OUT')),
  CHECK (request_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE attendance_exceptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  kind text NOT NULL,
  occurred_at timestamptz(3) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  version integer NOT NULL DEFAULT 0,
  FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
  UNIQUE (id, organization_id, employee_id),
  CHECK (status IN ('open','resolved')),
  CHECK (version >= 0)
);

CREATE TABLE attendance_adjustments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  exception_id uuid NOT NULL,
  reason text NOT NULL,
  approved_by uuid NOT NULL,
  duration_ms bigint NOT NULL,
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (employee_id, organization_id) REFERENCES employees(id, organization_id),
  FOREIGN KEY (exception_id, organization_id, employee_id) REFERENCES attendance_exceptions(id, organization_id, employee_id),
  FOREIGN KEY (approved_by, organization_id) REFERENCES users(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (duration_ms >= 0)
);

CREATE TABLE attendance_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  period_start timestamptz(3) NOT NULL,
  period_end timestamptz(3) NOT NULL,
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  approved_by uuid NOT NULL,
  FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
  FOREIGN KEY (approved_by, organization_id) REFERENCES users(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (period_end > period_start),
  CHECK (status = 'approved'),
  UNIQUE (id, organization_id, workplace_id, employee_id, content_hash)
);

CREATE TABLE legal_rule_packs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  evidence_mode text NOT NULL DEFAULT 'synthetic',
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  UNIQUE (id, organization_id, content_hash),
  UNIQUE (id, organization_id),
  CHECK (status = 'draft'),
  CHECK (evidence_mode = 'synthetic')
);

CREATE TABLE rule_sources (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  rule_pack_id uuid NOT NULL,
  source_key text NOT NULL,
  uri text NOT NULL,
  content_hash text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  FOREIGN KEY (rule_pack_id, organization_id) REFERENCES legal_rule_packs(id, organization_id),
  UNIQUE (rule_pack_id, source_key),
  CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE minimum_wages (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  rule_pack_id uuid NOT NULL,
  region text NOT NULL,
  monthly_vnd bigint NOT NULL,
  hourly_vnd bigint NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  FOREIGN KEY (rule_pack_id, organization_id) REFERENCES legal_rule_packs(id, organization_id),
  CHECK (monthly_vnd >= 0 AND hourly_vnd >= 0),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, rule_pack_id WITH =, region WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE insurance_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  rule_pack_id uuid NOT NULL,
  policy_key text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (rule_pack_id, organization_id) REFERENCES legal_rule_packs(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, rule_pack_id WITH =, policy_key WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE pit_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  rule_pack_id uuid NOT NULL,
  policy_key text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (rule_pack_id, organization_id) REFERENCES legal_rule_packs(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, rule_pack_id WITH =, policy_key WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE earning_component_policies (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  rule_pack_id uuid NOT NULL,
  policy_key text NOT NULL,
  valid_from timestamptz(3) NOT NULL,
  valid_to timestamptz(3),
  canonical_payload text NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (rule_pack_id, organization_id) REFERENCES legal_rule_packs(id, organization_id),
  CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (organization_id WITH =, rule_pack_id WITH =, policy_key WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&)
);

CREATE TABLE pay_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 0,
  evidence_mode text NOT NULL DEFAULT 'synthetic',
  period_start timestamptz(3) NOT NULL,
  period_end timestamptz(3) NOT NULL,
  FOREIGN KEY (workplace_id, organization_id) REFERENCES workplaces(id, organization_id),
  UNIQUE (id, organization_id, workplace_id),
  UNIQUE (id, organization_id),
  CHECK (status IN ('draft','reviewed','finalized')),
  CHECK (evidence_mode = 'synthetic'),
  CHECK (period_end > period_start),
  CHECK (version >= 0)
);

CREATE TABLE pay_run_employees (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  pay_run_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  snapshot_hash text NOT NULL,
  compensation_id uuid NOT NULL,
  compensation_hash text NOT NULL,
  rule_pack_id uuid NOT NULL,
  rule_pack_hash text NOT NULL,
  calculator_version text NOT NULL,
  calculator_artifact_hash text NOT NULL,
  canonicalization_version text NOT NULL,
  result_schema_version text NOT NULL,
  canonical_input text NOT NULL,
  input_hash text NOT NULL,
  canonical_result text NOT NULL,
  result_hash text NOT NULL,
  CHECK (input_hash = encode(sha256(convert_to(canonical_input, 'UTF8')), 'hex')),
  CHECK (result_hash = encode(sha256(convert_to(canonical_result, 'UTF8')), 'hex')),
  FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
  UNIQUE (id, organization_id, employee_id),
  UNIQUE (pay_run_id, employee_id),
  FOREIGN KEY (pay_run_id, organization_id, workplace_id) REFERENCES pay_runs(id, organization_id, workplace_id),
  FOREIGN KEY (snapshot_id, organization_id, workplace_id, employee_id, snapshot_hash) REFERENCES attendance_snapshots(id, organization_id, workplace_id, employee_id, content_hash),
  FOREIGN KEY (compensation_id, organization_id, employee_id, compensation_hash) REFERENCES compensation_terms(id, organization_id, employee_id, content_hash),
  FOREIGN KEY (rule_pack_id, organization_id, rule_pack_hash) REFERENCES legal_rule_packs(id, organization_id, content_hash),
  CHECK (calculator_artifact_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE calculation_lines (
  id uuid PRIMARY KEY,
  pay_run_employee_id uuid NOT NULL,
  code text NOT NULL,
  amount_vnd bigint NOT NULL,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY (pay_run_employee_id) REFERENCES pay_run_employees(id)
);

CREATE TABLE approval_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  pay_run_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pay_run_id, organization_id) REFERENCES pay_runs(id, organization_id),
  FOREIGN KEY (actor_id, organization_id) REFERENCES users(id, organization_id)
);

CREATE TABLE adjustment_links (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  original_run_id uuid NOT NULL,
  adjustment_run_id uuid NOT NULL,
  reason text NOT NULL,
  FOREIGN KEY (original_run_id, organization_id) REFERENCES pay_runs(id, organization_id),
  FOREIGN KEY (adjustment_run_id, organization_id) REFERENCES pay_runs(id, organization_id),
  UNIQUE (original_run_id, adjustment_run_id),
  CHECK (original_run_id <> adjustment_run_id)
);

CREATE TABLE payslips (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  pay_run_employee_id uuid NOT NULL,
  content_hash text NOT NULL,
  FOREIGN KEY (pay_run_employee_id, organization_id, employee_id) REFERENCES pay_run_employees(id, organization_id, employee_id),
  UNIQUE (id, organization_id, employee_id),
  CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE document_artifacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  payslip_id uuid NOT NULL,
  relative_path text NOT NULL,
  content_hash text NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payslip_id, organization_id, employee_id) REFERENCES payslips(id, organization_id, employee_id),
  UNIQUE (id, organization_id, employee_id),
  CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CHECK (size_bytes > 0)
);

CREATE TABLE delivery_drafts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  destination_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 0,
  FOREIGN KEY (artifact_id, organization_id, employee_id) REFERENCES document_artifacts(id, organization_id, employee_id),
  FOREIGN KEY (destination_id, organization_id, employee_id, destination_hash) REFERENCES delivery_destinations(id, organization_id, employee_id, content_hash),
  UNIQUE (id, organization_id),
  CHECK (status IN ('draft','invalidated')),
  CHECK (version >= 0)
);

CREATE TABLE outbox_jobs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  pay_run_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pay_run_id, organization_id) REFERENCES pay_runs(id, organization_id),
  UNIQUE (organization_id, idempotency_key),
  CHECK (status = 'draft')
);

CREATE TABLE delivery_attempts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  outcome text NOT NULL,
  provider_reference text,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (draft_id, organization_id) REFERENCES delivery_drafts(id, organization_id),
  UNIQUE (draft_id, attempt_number),
  CHECK (attempt_number > 0),
  CHECK (outcome IN ('unknown','failed','accepted','delivered','manual_handoff'))
);

CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  encrypted_secret_ref text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  revoked_at timestamptz(3),
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id),
  UNIQUE (token_hash),
  CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  aggregate_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id, organization_id) REFERENCES users(id, organization_id)
);

CREATE TABLE retention_actions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id, organization_id) REFERENCES users(id, organization_id)
);

CREATE TABLE backup_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  status text NOT NULL,
  archive_ref text,
  content_hash text,
  started_at timestamptz(3) NOT NULL,
  finished_at timestamptz(3),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CHECK (status IN ('started','failed','verified'))
);


-- History is replaced by new versions, never edited in place.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_RECORD: %', TG_TABLE_NAME USING ERRCODE = '55000'; END $$;

DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['clock_events','attendance_snapshots','legal_rule_packs',
 'rule_sources','minimum_wages','insurance_policies','pit_policies','earning_component_policies',
 'opening_hour_versions','employment_contracts','schedule_templates','schedule_assignments',
 'attendance_adjustments','approval_events','adjustment_links','payslips','document_artifacts',
 'delivery_attempts','audit_events','retention_actions','outbox_jobs']
 LOOP EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()',name);
 END LOOP;
END $$;

CREATE FUNCTION protect_pay_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'draft' OR NEW.version <> 0 THEN
   RAISE EXCEPTION 'INVALID_INITIAL_STATE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.status = 'finalized' THEN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: finalized pay run' USING ERRCODE='55000';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF (to_jsonb(NEW) - 'status' - 'version') <> (to_jsonb(OLD) - 'status' - 'version')
    OR NEW.version <> OLD.version + 1
    OR NOT ((OLD.status='draft' AND NEW.status='reviewed') OR (OLD.status='reviewed' AND NEW.status='finalized')) THEN
  RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE='23514';
 END IF;
 IF NEW.status='finalized' AND NOT EXISTS (SELECT 1 FROM pay_run_employees WHERE pay_run_id=NEW.id) THEN
  RAISE EXCEPTION 'EMPTY_PAY_RUN' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_pay_run BEFORE INSERT OR UPDATE OR DELETE ON pay_runs FOR EACH ROW EXECUTE FUNCTION protect_pay_run();

-- The same parent row lock serializes finalization and every employee/line mutation.
CREATE FUNCTION protect_run_employee() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id uuid; parent_state text; old_parent uuid; new_parent uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_parent := OLD.pay_run_id; END IF;
 IF TG_OP <> 'DELETE' THEN new_parent := NEW.pay_run_id; END IF;
 FOR parent_id IN SELECT DISTINCT x FROM unnest(ARRAY[old_parent,new_parent]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT status INTO parent_state FROM pay_runs WHERE id=parent_id FOR UPDATE;
  IF parent_state='finalized' THEN
   RAISE EXCEPTION 'IMMUTABLE_RECORD: finalized employee inputs' USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 -- Serialize historical-reference creation with compensation mutation.
 PERFORM id FROM compensation_terms WHERE id=NEW.compensation_id FOR UPDATE;
 IF EXISTS (
  SELECT 1 FROM attendance_snapshots s JOIN pay_runs p ON p.id=NEW.pay_run_id
  WHERE s.id=NEW.snapshot_id AND (s.period_start<>p.period_start OR s.period_end<>p.period_end)
 ) THEN RAISE EXCEPTION 'SNAPSHOT_PERIOD_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_run_employee BEFORE INSERT OR UPDATE OR DELETE ON pay_run_employees FOR EACH ROW EXECUTE FUNCTION protect_run_employee();

CREATE FUNCTION protect_calculation_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE child_id uuid; parent_id uuid; parent_state text; old_child uuid; new_child uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN old_child := OLD.pay_run_employee_id; END IF;
 IF TG_OP <> 'DELETE' THEN new_child := NEW.pay_run_employee_id; END IF;
 FOR child_id IN SELECT DISTINCT x FROM unnest(ARRAY[old_child,new_child]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT pay_run_id INTO parent_id FROM pay_run_employees WHERE id=child_id FOR UPDATE;
  SELECT status INTO parent_state FROM pay_runs WHERE id=parent_id FOR UPDATE;
  IF parent_state='finalized' THEN
   RAISE EXCEPTION 'IMMUTABLE_RECORD: finalized calculation line' USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_calculation_line BEFORE INSERT OR UPDATE OR DELETE ON calculation_lines FOR EACH ROW EXECUTE FUNCTION protect_calculation_line();

CREATE FUNCTION protect_referenced_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE referenced boolean;
BEGIN
 IF TG_TABLE_NAME='compensation_terms' THEN
  SELECT EXISTS(SELECT 1 FROM pay_run_employees WHERE compensation_id=OLD.id) INTO referenced;
 ELSE
  SELECT EXISTS(SELECT 1 FROM delivery_drafts WHERE destination_id=OLD.id) INTO referenced;
 END IF;
 IF referenced THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: referenced version' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_compensation BEFORE UPDATE OR DELETE ON compensation_terms FOR EACH ROW EXECUTE FUNCTION protect_referenced_version();
CREATE TRIGGER protect_destination BEFORE UPDATE OR DELETE ON delivery_destinations FOR EACH ROW EXECUTE FUNCTION protect_referenced_version();

CREATE FUNCTION bind_delivery_destination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status'-'version')<>(to_jsonb(OLD)-'status'-'version') THEN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: delivery binding' USING ERRCODE='55000';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR OLD.status<>'draft' OR NEW.status<>'invalidated') THEN
  RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE='23514';
 END IF;
 PERFORM id FROM delivery_destinations WHERE id=NEW.destination_id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER bind_delivery_destination BEFORE INSERT OR UPDATE ON delivery_drafts FOR EACH ROW EXECUTE FUNCTION bind_delivery_destination();

CREATE FUNCTION require_finalized_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text; parent_id uuid;
BEGIN
 IF TG_TABLE_NAME='outbox_jobs' THEN parent_id:=NEW.pay_run_id;
 ELSE SELECT pay_run_id INTO parent_id FROM pay_run_employees WHERE id=NEW.pay_run_employee_id; END IF;
 SELECT status INTO parent_state FROM pay_runs WHERE id=parent_id FOR UPDATE;
 IF parent_state IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'FINALIZED_PARENT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_finalized_outbox BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION require_finalized_parent();
CREATE TRIGGER require_finalized_payslip BEFORE INSERT ON payslips FOR EACH ROW EXECUTE FUNCTION require_finalized_parent();

-- Forward and historical lookups used by guards and repositories.
CREATE INDEX pay_run_employees_compensation_idx ON pay_run_employees(compensation_id);
CREATE INDEX calculation_lines_employee_idx ON calculation_lines(pay_run_employee_id);
CREATE INDEX delivery_drafts_destination_idx ON delivery_drafts(destination_id);
CREATE INDEX audit_events_aggregate_idx ON audit_events(aggregate_id);
CREATE INDEX clock_events_timeline_idx ON clock_events(organization_id,workplace_id,employee_id,occurred_at,id);
