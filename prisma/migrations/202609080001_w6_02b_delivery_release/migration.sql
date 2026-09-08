CREATE TABLE payslip_release_previews (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 draft_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL,
 binding jsonb NOT NULL,
 binding_hash text NOT NULL CHECK(binding_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz(3) NOT NULL,
 expires_at timestamptz(3) NOT NULL CHECK(expires_at>created_at),
 UNIQUE(id,organization_id),
 FOREIGN KEY(draft_id,organization_id) REFERENCES delivery_drafts(id,organization_id),
 FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON payslip_release_previews FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TABLE payslip_release_receipts (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 preview_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('queued_fake','operator_confirmed_manual','password_handoff_confirmed')),
 channel text NOT NULL CHECK(channel IN ('fake_email','zalo_manual','in_person','phone')),
 password_version_id uuid,
 job_id uuid,
 created_at timestamptz(3) NOT NULL,
 UNIQUE(preview_id,kind),
 FOREIGN KEY(preview_id,organization_id) REFERENCES payslip_release_previews(id,organization_id),
 FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id),
 FOREIGN KEY(job_id,organization_id) REFERENCES outbox_jobs(id,organization_id),
 CHECK((kind='queued_fake')=(job_id IS NOT NULL)),
 CHECK((kind='password_handoff_confirmed')=(password_version_id IS NOT NULL))
);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON payslip_release_receipts FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
ALTER TABLE outbox_jobs DROP CONSTRAINT outbox_kind_binding;
ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_kind_binding CHECK (
 (kind='synthetic_payslip_draft' AND pay_run_id IS NOT NULL AND employee_id IS NULL AND destination_id IS NULL AND destination_hash IS NULL)
 OR (kind='synthetic_email_verification' AND pay_run_id IS NULL AND employee_id IS NOT NULL AND destination_id IS NOT NULL AND destination_hash IS NOT NULL)
 OR (kind='synthetic_payslip_release' AND pay_run_id IS NOT NULL AND employee_id IS NOT NULL AND destination_id IS NOT NULL AND destination_hash IS NOT NULL)
);
CREATE FUNCTION guard_payslip_release_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind<>'synthetic_payslip_release' THEN RETURN NEW; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM document_artifacts a JOIN payslips s ON s.id=a.payslip_id AND s.organization_id=a.organization_id AND s.employee_id=a.employee_id
  JOIN pay_run_employees e ON e.id=s.pay_run_employee_id AND e.employee_id=a.employee_id AND e.organization_id=a.organization_id
  JOIN pay_runs p ON p.id=e.pay_run_id AND p.organization_id=e.organization_id
  JOIN delivery_destinations d ON d.id=NEW.destination_id AND d.organization_id=a.organization_id AND d.employee_id=a.employee_id
  JOIN employee_email_verifications v ON v.destination_id=d.id AND v.organization_id=d.organization_id AND v.employee_id=d.employee_id
  WHERE a.id::text=NEW.payload->'attachment'->>'artifactId' AND a.content_hash=NEW.payload->'attachment'->>'sha256'
   AND a.size_bytes::text=NEW.payload->'attachment'->>'bytes' AND a.organization_id=NEW.organization_id AND a.employee_id=NEW.employee_id
   AND p.id=NEW.pay_run_id AND p.status='finalized' AND p.evidence_mode='synthetic'
   AND d.channel='email' AND d.address=NEW.payload->>'to' AND d.content_hash=NEW.destination_hash
   AND v.verified_at IS NOT NULL AND v.invalidated_at IS NULL AND d.valid_from<=NEW.created_at AND (d.valid_to IS NULL OR d.valid_to>NEW.created_at)
   AND NOT EXISTS(SELECT 1 FROM delivery_destination_closures c WHERE c.destination_id=d.id AND c.effective_to<=NEW.created_at)
 ) THEN RAISE EXCEPTION 'RELEASE_BINDING_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_payslip_release BEFORE INSERT ON outbox_jobs FOR EACH ROW EXECUTE FUNCTION guard_payslip_release_job();

-- Extend the existing draft transition without permitting binding edits or reopening.
ALTER TABLE delivery_drafts DROP CONSTRAINT delivery_drafts_status_check;
ALTER TABLE delivery_drafts ADD CONSTRAINT delivery_drafts_status_check CHECK(status IN ('draft','invalidated','queued_fake','operator_confirmed_manual'));
CREATE OR REPLACE FUNCTION bind_delivery_destination() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'status'-'version')<>(to_jsonb(OLD)-'status'-'version') THEN
  RAISE EXCEPTION 'IMMUTABLE_RECORD: delivery binding' USING ERRCODE='55000';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.version<>OLD.version+1 OR OLD.status<>'draft' OR NEW.status NOT IN ('invalidated','queued_fake','operator_confirmed_manual') THEN
   RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE='23514';
  END IF;
  IF NEW.status IN ('queued_fake','operator_confirmed_manual') AND NOT EXISTS(SELECT 1 FROM payslip_release_receipts r JOIN payslip_release_previews p ON p.id=r.preview_id WHERE p.draft_id=NEW.id AND r.organization_id=NEW.organization_id AND r.kind=NEW.status) THEN
   RAISE EXCEPTION 'RELEASE_RECEIPT_REQUIRED' USING ERRCODE='23514';
  END IF;
 END IF;
 PERFORM id FROM delivery_destinations WHERE id=NEW.destination_id FOR UPDATE;
 RETURN NEW;
END $$;
