ALTER TABLE employees ADD COLUMN nationality text, ADD COLUMN tax_residency text;
ALTER TABLE users ADD COLUMN employee_id uuid,
 ADD FOREIGN KEY(employee_id,organization_id) REFERENCES employees(id,organization_id);
ALTER TABLE employment_contracts ADD COLUMN template_version text, ADD COLUMN probation_days integer,
 ADD COLUMN population_policy_version text;

CREATE TABLE compensation_term_closures (
 term_id uuid PRIMARY KEY,organization_id uuid NOT NULL,employee_id uuid NOT NULL,source_hash text NOT NULL,effective_to timestamptz(3) NOT NULL,
 FOREIGN KEY(term_id,organization_id,employee_id,source_hash) REFERENCES compensation_terms(id,organization_id,employee_id,content_hash)
);
CREATE TABLE delivery_destination_closures (
 destination_id uuid PRIMARY KEY,organization_id uuid NOT NULL,employee_id uuid NOT NULL,source_hash text NOT NULL,effective_to timestamptz(3) NOT NULL,
 FOREIGN KEY(destination_id,organization_id,employee_id,source_hash) REFERENCES delivery_destinations(id,organization_id,employee_id,content_hash)
);
CREATE FUNCTION validate_employee_closure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_at timestamptz; end_at timestamptz;
BEGIN
 PERFORM id FROM employees WHERE id=NEW.employee_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF TG_TABLE_NAME='compensation_term_closures' THEN
  SELECT valid_from,valid_to INTO start_at,end_at FROM compensation_terms WHERE id=NEW.term_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM pay_run_employees r JOIN pay_runs p ON p.id=r.pay_run_id WHERE r.compensation_id=NEW.term_id AND p.period_end>NEW.effective_to)
   THEN RAISE EXCEPTION 'HISTORICAL_PERIOD_CONFLICT' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT valid_from,valid_to INTO start_at,end_at FROM delivery_destinations WHERE id=NEW.destination_id FOR UPDATE;
 END IF;
 IF start_at IS NULL OR NEW.effective_to<=start_at OR (end_at IS NOT NULL AND NEW.effective_to>end_at)
  THEN RAISE EXCEPTION 'INVALID_CLOSURE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_closure BEFORE INSERT ON compensation_term_closures FOR EACH ROW EXECUTE FUNCTION validate_employee_closure();
CREATE TRIGGER validate_closure BEFORE INSERT ON delivery_destination_closures FOR EACH ROW EXECUTE FUNCTION validate_employee_closure();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE OR TRUNCATE ON compensation_term_closures FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE OR TRUNCATE ON delivery_destination_closures FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

-- Retain physical source rows and their hashes. Exclusion now uses logical end dates.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conrelid::regclass AS tab,conname FROM pg_constraint WHERE contype='x' AND conrelid IN ('compensation_terms'::regclass,'delivery_destinations'::regclass)
 LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tab,r.conname); END LOOP;
END $$;
CREATE FUNCTION guard_employee_effective_range() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE overlap_found boolean; effective_end timestamptz;
BEGIN
 PERFORM id FROM employees WHERE id=NEW.employee_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF TG_TABLE_NAME='compensation_terms' THEN
  SELECT LEAST(NEW.valid_to,c.effective_to) INTO effective_end FROM (SELECT 1) dummy LEFT JOIN compensation_term_closures c ON c.term_id=NEW.id;
  SELECT EXISTS(SELECT 1 FROM compensation_terms t LEFT JOIN compensation_term_closures c ON c.term_id=t.id
   WHERE t.organization_id=NEW.organization_id AND t.employee_id=NEW.employee_id AND t.id<>NEW.id
    AND tstzrange(t.valid_from,LEAST(t.valid_to,c.effective_to),'[)') && tstzrange(NEW.valid_from,effective_end,'[)')) INTO overlap_found;
 ELSE
  SELECT LEAST(NEW.valid_to,c.effective_to) INTO effective_end FROM (SELECT 1) dummy LEFT JOIN delivery_destination_closures c ON c.destination_id=NEW.id;
  SELECT EXISTS(SELECT 1 FROM delivery_destinations t LEFT JOIN delivery_destination_closures c ON c.destination_id=t.id
   WHERE t.organization_id=NEW.organization_id AND t.employee_id=NEW.employee_id AND t.channel=NEW.channel AND t.id<>NEW.id
    AND tstzrange(t.valid_from,LEAST(t.valid_to,c.effective_to),'[)') && tstzrange(NEW.valid_from,effective_end,'[)')) INTO overlap_found;
 END IF;
 IF overlap_found THEN RAISE EXCEPTION 'OVERLAPPING_PERIOD' USING ERRCODE='23P01'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER effective_range BEFORE INSERT OR UPDATE ON compensation_terms FOR EACH ROW EXECUTE FUNCTION guard_employee_effective_range();
CREATE TRIGGER effective_range BEFORE INSERT OR UPDATE ON delivery_destinations FOR EACH ROW EXECUTE FUNCTION guard_employee_effective_range();

CREATE TABLE employee_access_grants(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,employee_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('session','kiosk')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),revoked_at timestamptz(3),
 FOREIGN KEY(employee_id,organization_id) REFERENCES employees(id,organization_id)
);
CREATE FUNCTION require_active_employee_clock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM employees WHERE id=NEW.employee_id AND organization_id=NEW.organization_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_active BEFORE INSERT ON clock_events FOR EACH ROW EXECUTE FUNCTION require_active_employee_clock();

ALTER TABLE outbox_jobs DROP CONSTRAINT outbox_kind_binding;
ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_kind_binding CHECK(
 (kind='synthetic_payslip_draft' AND pay_run_id IS NOT NULL AND employee_id IS NULL AND destination_id IS NULL AND destination_hash IS NULL)
 OR (kind IN ('synthetic_email_verification','synthetic_destination_verification') AND pay_run_id IS NULL AND employee_id IS NOT NULL AND destination_id IS NOT NULL AND destination_hash IS NOT NULL)
);
-- Preserve the prior binding function unchanged for every legacy job and payslip.
ALTER FUNCTION require_finalized_parent() RENAME TO require_finalized_parent_legacy;
CREATE FUNCTION require_finalized_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text; parent_id uuid; destination delivery_destinations;
BEGIN
 IF TG_TABLE_NAME='outbox_jobs' THEN
 IF NEW.kind IN ('synthetic_email_verification','synthetic_destination_verification') THEN
  SELECT * INTO destination FROM delivery_destinations WHERE id=NEW.destination_id AND organization_id=NEW.organization_id AND employee_id=NEW.employee_id AND content_hash=NEW.destination_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DESTINATION_MISMATCH' USING ERRCODE='23514'; END IF;
  IF destination.channel<>'email' OR destination.address !~ '^[A-Za-z0-9._+-]+@example[.]invalid$'
   OR destination.valid_from>NEW.created_at OR (destination.valid_to IS NOT NULL AND destination.valid_to<=NEW.created_at)
   OR EXISTS(SELECT 1 FROM delivery_destination_closures c WHERE c.destination_id=destination.id AND c.effective_to<=NEW.created_at)
  THEN RAISE EXCEPTION 'SYNTHETIC_ONLY' USING ERRCODE='23514'; END IF;
  IF NEW.kind='synthetic_email_verification' THEN
   IF NEW.payload IS DISTINCT FROM jsonb_build_object('jobId',NEW.id::text,'idempotencyKey',NEW.id::text,'to',destination.address,'subject','Synthetic email verification','body','Synthetic verification test only. No payroll or verification secret is included.')
    THEN RAISE EXCEPTION 'SYNTHETIC_ONLY' USING ERRCODE='23514'; END IF;
  ELSE
   IF jsonb_typeof(NEW.payload)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(NEW.payload))<>2 OR NOT (NEW.payload ?& ARRAY['ciphertext','purpose'])
    OR NEW.payload->>'purpose'<>'pay-slip/email-verification/v1' OR length(NEW.payload->>'ciphertext') NOT BETWEEN 100 AND 16384
    OR NEW.payload->>'ciphertext' !~ '^[A-Za-z0-9+/=]+$'
    THEN RAISE EXCEPTION 'INVALID_VERIFICATION_PAYLOAD' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 END IF;
 IF TG_TABLE_NAME='outbox_jobs' THEN parent_id:=NEW.pay_run_id;
 ELSE SELECT pay_run_id INTO parent_id FROM pay_run_employees WHERE id=NEW.pay_run_employee_id; END IF;
 SELECT status INTO parent_state FROM pay_runs WHERE id=parent_id FOR UPDATE;
 IF parent_state IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'FINALIZED_PARENT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
-- Existing triggers retain function OIDs through rename; rebind them explicitly.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT tgname,tgrelid::regclass AS tab FROM pg_trigger WHERE tgfoid='require_finalized_parent_legacy'::regproc
 LOOP EXECUTE format('DROP TRIGGER %I ON %s',r.tgname,r.tab);
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION require_finalized_parent()',r.tgname,r.tab); END LOOP;
END $$;
DROP FUNCTION require_finalized_parent_legacy();

CREATE TABLE employee_email_verifications(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,employee_id uuid NOT NULL,destination_id uuid NOT NULL UNIQUE,
 job_id uuid NOT NULL UNIQUE REFERENCES outbox_jobs(id),code_hash text NOT NULL CHECK(code_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz(3) NOT NULL,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 verified_at timestamptz(3),invalidated_at timestamptz(3),
 FOREIGN KEY(employee_id,organization_id) REFERENCES employees(id,organization_id),
 FOREIGN KEY(destination_id) REFERENCES delivery_destinations(id)
);

CREATE FUNCTION protect_closed_employee_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='compensation_terms' THEN
  IF EXISTS(SELECT 1 FROM compensation_term_closures WHERE term_id=OLD.id) THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: closed version' USING ERRCODE='55000'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM delivery_destination_closures WHERE destination_id=OLD.id) THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: closed version' USING ERRCODE='55000'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_closed_history BEFORE UPDATE OR DELETE ON compensation_terms FOR EACH ROW EXECUTE FUNCTION protect_closed_employee_source();
CREATE TRIGGER a_closed_history BEFORE UPDATE OR DELETE ON delivery_destinations FOR EACH ROW EXECUTE FUNCTION protect_closed_employee_source();
