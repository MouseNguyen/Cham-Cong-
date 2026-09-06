-- PAY-W3-03 append-only maker proposals and owner decisions. Prisma lifecycle review must apply the paired fragment.
CREATE TABLE attendance_review_cases (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workplace_id uuid NOT NULL, employee_id uuid NOT NULL,
 month text NOT NULL, version integer NOT NULL DEFAULT 0, created_at timestamptz(3) NOT NULL,
 FOREIGN KEY (employee_id, organization_id, workplace_id) REFERENCES employees(id, organization_id, workplace_id),
 CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'), CHECK (version >= 0),
 UNIQUE (organization_id, workplace_id, employee_id, month),
 UNIQUE (id, organization_id, workplace_id, employee_id)
);
CREATE TABLE attendance_review_proposals (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, organization_id uuid NOT NULL, workplace_id uuid NOT NULL, employee_id uuid NOT NULL,
 expected_version integer NOT NULL, source_hash text NOT NULL, candidate_hash text NOT NULL, canonical_payload text NOT NULL,
 reason text NOT NULL, made_by uuid NOT NULL, made_at timestamptz(3) NOT NULL,
 FOREIGN KEY (case_id, organization_id, workplace_id, employee_id) REFERENCES attendance_review_cases(id, organization_id, workplace_id, employee_id),
 FOREIGN KEY (made_by, organization_id) REFERENCES users(id, organization_id),
 CHECK (expected_version >= 0), CHECK (reason <> ''), CHECK (source_hash ~ '^[0-9a-f]{64}$'), CHECK (candidate_hash ~ '^[0-9a-f]{64}$'),
 CHECK (candidate_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex'))
);
CREATE TABLE attendance_review_decisions (
 id uuid PRIMARY KEY, proposal_id uuid NOT NULL UNIQUE, case_id uuid NOT NULL, organization_id uuid NOT NULL,
 expected_version integer NOT NULL, source_hash text NOT NULL, candidate_hash text NOT NULL, reason text NOT NULL,
 approved_by uuid NOT NULL, approved_at timestamptz(3) NOT NULL,
 FOREIGN KEY (proposal_id) REFERENCES attendance_review_proposals(id), FOREIGN KEY (case_id) REFERENCES attendance_review_cases(id),
 FOREIGN KEY (approved_by, organization_id) REFERENCES users(id, organization_id),
 CHECK (expected_version >= 0), CHECK (reason <> ''), CHECK (source_hash ~ '^[0-9a-f]{64}$'), CHECK (candidate_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE attendance_review_audits (
 id uuid PRIMARY KEY, case_id uuid NOT NULL, organization_id uuid NOT NULL, actor_id uuid NOT NULL, action text NOT NULL,
 expected_version integer NOT NULL, reason text NOT NULL, source_hash text NOT NULL, candidate_hash text, created_at timestamptz(3) NOT NULL,
 FOREIGN KEY (case_id) REFERENCES attendance_review_cases(id), FOREIGN KEY (actor_id, organization_id) REFERENCES users(id, organization_id),
 CHECK (expected_version >= 0), CHECK (reason <> ''), CHECK (source_hash ~ '^[0-9a-f]{64}$')
);
CREATE FUNCTION attendance_review_case_only_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'version')<>(to_jsonb(OLD)-'version') OR NEW.version<>OLD.version+1) THEN
  RAISE EXCEPTION 'INVALID_REVIEW_CASE_TRANSITION' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: attendance_review_cases' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attendance_review_case_guard BEFORE UPDATE OR DELETE ON attendance_review_cases FOR EACH ROW EXECUTE FUNCTION attendance_review_case_only_version();
CREATE TRIGGER attendance_review_proposals_immutable BEFORE UPDATE OR DELETE ON attendance_review_proposals FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER attendance_review_decisions_immutable BEFORE UPDATE OR DELETE ON attendance_review_decisions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER attendance_review_audits_immutable BEFORE UPDATE OR DELETE ON attendance_review_audits FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
-- Bind one original review snapshot to its case. Separate linked adjustment snapshots remain possible.
ALTER TABLE attendance_snapshots ADD COLUMN review_case_id uuid UNIQUE;
ALTER TABLE attendance_snapshots ADD CONSTRAINT attendance_snapshot_review_case_fk FOREIGN KEY (review_case_id, organization_id, workplace_id, employee_id) REFERENCES attendance_review_cases(id, organization_id, workplace_id, employee_id);
CREATE INDEX attendance_review_proposals_case_idx ON attendance_review_proposals(case_id, made_at DESC);
CREATE INDEX attendance_review_decisions_case_idx ON attendance_review_decisions(case_id, approved_at DESC);
