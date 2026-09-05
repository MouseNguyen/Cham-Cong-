-- Add execution state without changing historical immutable outbox intent.
ALTER TABLE outbox_jobs
 ALTER COLUMN pay_run_id DROP NOT NULL,
 ADD COLUMN kind text NOT NULL DEFAULT 'synthetic_payslip_draft',
 ADD COLUMN employee_id uuid,
 ADD COLUMN destination_id uuid,
 ADD COLUMN destination_hash text,
 ADD UNIQUE (id,organization_id),
 ADD FOREIGN KEY(destination_id,organization_id,employee_id,destination_hash)
   REFERENCES delivery_destinations(id,organization_id,employee_id,content_hash),
 ADD CONSTRAINT outbox_kind_binding CHECK (
   (kind='synthetic_payslip_draft' AND pay_run_id IS NOT NULL AND employee_id IS NULL AND destination_id IS NULL AND destination_hash IS NULL)
   OR (kind='synthetic_email_verification' AND pay_run_id IS NULL AND employee_id IS NOT NULL AND destination_id IS NOT NULL AND destination_hash IS NOT NULL)
 );
CREATE INDEX outbox_destination_idx ON outbox_jobs(destination_id);

CREATE OR REPLACE FUNCTION require_finalized_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text; parent_id uuid; destination delivery_destinations;
BEGIN
 IF TG_TABLE_NAME='outbox_jobs' THEN
  IF NEW.kind='synthetic_email_verification' THEN
   SELECT * INTO destination FROM delivery_destinations
    WHERE id=NEW.destination_id AND organization_id=NEW.organization_id AND employee_id=NEW.employee_id
     AND content_hash=NEW.destination_hash FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'DESTINATION_MISMATCH' USING ERRCODE='23514'; END IF;
   IF destination.channel<>'email' OR destination.address !~ '^[A-Za-z0-9._+-]+@example[.]invalid$'
    OR destination.valid_from>NEW.created_at OR (destination.valid_to IS NOT NULL AND destination.valid_to<=NEW.created_at)
    OR NEW.payload IS DISTINCT FROM jsonb_build_object('jobId',NEW.id::text,'idempotencyKey',NEW.id::text,'to',destination.address,
       'subject','Synthetic email verification','body','Synthetic verification test only. No payroll or verification secret is included.')
   THEN RAISE EXCEPTION 'SYNTHETIC_ONLY' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  END IF;
  parent_id:=NEW.pay_run_id;
 ELSE SELECT pay_run_id INTO parent_id FROM pay_run_employees WHERE id=NEW.pay_run_employee_id; END IF;
 SELECT status INTO parent_state FROM pay_runs WHERE id=parent_id FOR UPDATE;
 IF parent_state IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'FINALIZED_PARENT_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_referenced_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE referenced boolean;
BEGIN
 IF TG_TABLE_NAME='compensation_terms' THEN
  SELECT EXISTS(SELECT 1 FROM pay_run_employees WHERE compensation_id=OLD.id) INTO referenced;
 ELSE
  SELECT EXISTS(SELECT 1 FROM delivery_drafts WHERE destination_id=OLD.id)
    OR EXISTS(SELECT 1 FROM outbox_jobs WHERE destination_id=OLD.id) INTO referenced;
 END IF;
 IF referenced THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: referenced version' USING ERRCODE='55000'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE TABLE outbox_dispatches (
 job_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 available_at timestamptz(3) NOT NULL,
 generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),
 send_attempts integer NOT NULL DEFAULT 0 CHECK(send_attempts BETWEEN 0 AND 3),
 reconcile_attempts integer NOT NULL DEFAULT 0 CHECK(reconcile_attempts BETWEEN 0 AND 3),
 lease_token uuid,
 lease_phase text,
 lease_expires_at timestamptz(3),
 worker_id text,
 provider_reference text,
 terminal_reason text,
 FOREIGN KEY(job_id,organization_id) REFERENCES outbox_jobs(id,organization_id),
 UNIQUE(job_id,organization_id),
 CHECK(status IN ('pending','leased','retry_wait','reconcile','accepted','dead_letter')),
 CHECK((status='leased' AND lease_token IS NOT NULL AND lease_phase IS NOT NULL AND lease_phase IN ('send','reconcile') AND lease_expires_at IS NOT NULL AND worker_id IS NOT NULL)
   OR (status<>'leased' AND lease_token IS NULL AND lease_phase IS NULL AND lease_expires_at IS NULL AND worker_id IS NULL)),
 CHECK((status='accepted')=(provider_reference IS NOT NULL)),
 CHECK((status='dead_letter')=(terminal_reason IS NOT NULL))
);
CREATE INDEX outbox_dispatch_due_idx ON outbox_dispatches(organization_id,available_at,job_id)
 WHERE status IN ('pending','retry_wait','reconcile','leased');
CREATE TABLE outbox_dispatch_attempts (
 id uuid PRIMARY KEY,
 job_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 generation integer NOT NULL CHECK(generation>=1),
 phase text NOT NULL CHECK(phase IN ('send','reconcile')),
 event text NOT NULL CHECK(event IN ('claim','result','terminal')),
 outcome text NOT NULL CHECK(outcome IN ('claimed','accepted','definitely_failed','unknown','not_found','attempt_budget_exhausted')),
 provider_reference text,
 created_at timestamptz(3) NOT NULL,
 FOREIGN KEY(job_id,organization_id) REFERENCES outbox_dispatches(job_id,organization_id),
 UNIQUE(job_id,generation,event)
);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON outbox_dispatch_attempts FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
