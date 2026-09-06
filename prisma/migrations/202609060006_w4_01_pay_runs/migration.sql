-- PAY-W4-01: keep legacy immutable records, but replace the three-state scaffold
-- with the approved five-state orchestration lifecycle.
ALTER TABLE legal_rule_packs ADD COLUMN release_evidence jsonb;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='legal_rule_packs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status = ''draft''%'
  LOOP EXECUTE format('ALTER TABLE legal_rule_packs DROP CONSTRAINT %I', item.conname); END LOOP;
END $$;
ALTER TABLE legal_rule_packs ADD CONSTRAINT legal_rule_pack_release_evidence CHECK (
  (status='draft' AND release_evidence IS NULL) OR
  (status='released' AND evidence_mode='synthetic' AND jsonb_typeof(release_evidence)='object'
   AND release_evidence ?& ARRAY['accountantSignedContentHash','externalSpecialistSignedContentHash']
   AND release_evidence->>'accountantSignedContentHash'=content_hash
   AND release_evidence->>'externalSpecialistSignedContentHash'=content_hash)
);

DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='pay_runs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP EXECUTE format('ALTER TABLE pay_runs DROP CONSTRAINT %I', item.conname); END LOOP;
END $$;
ALTER TABLE pay_runs ADD CONSTRAINT pay_runs_lifecycle_check CHECK (status IN ('draft','reviewed','calculated','review_pending','approved','finalized'));

CREATE OR REPLACE FUNCTION protect_pay_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.version<>0 OR NEW.evidence_mode<>'synthetic' THEN RAISE EXCEPTION 'INVALID_INITIAL_STATE' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: pay run' USING ERRCODE='55000'; END IF;
  IF OLD.status='finalized' THEN RAISE EXCEPTION 'IMMUTABLE_RECORD: finalized pay run' USING ERRCODE='55000'; END IF;
  IF (to_jsonb(NEW)-'status'-'version')<>(to_jsonb(OLD)-'status'-'version') OR NEW.version<>OLD.version+1
    OR NOT ((OLD.status='draft' AND NEW.status='calculated') OR (OLD.status='calculated' AND NEW.status='review_pending') OR (OLD.status='review_pending' AND NEW.status='approved') OR (OLD.status='approved' AND NEW.status='finalized') OR (OLD.status='reviewed' AND NEW.status='review_pending'))
  THEN RAISE EXCEPTION 'INVALID_STATE_TRANSITION' USING ERRCODE='23514'; END IF;
  IF NEW.status='finalized' AND NOT EXISTS(SELECT 1 FROM pay_run_employees WHERE pay_run_id=NEW.id) THEN RAISE EXCEPTION 'EMPTY_PAY_RUN' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

UPDATE pay_runs SET status='review_pending', version=version+1 WHERE status='reviewed';
ALTER TABLE pay_runs DROP CONSTRAINT pay_runs_lifecycle_check;
ALTER TABLE pay_runs ADD CONSTRAINT pay_runs_lifecycle_check CHECK (status IN ('draft','calculated','review_pending','approved','finalized'));

-- The application role intentionally cannot read immutable legal packs. Bind the
-- release proof inside the database rather than accepting caller-supplied flags.
CREATE FUNCTION require_w4_released_rule_pack() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE pack public.legal_rule_packs;
BEGIN
  SELECT * INTO pack FROM public.legal_rule_packs WHERE id=NEW.rule_pack_id AND organization_id=NEW.organization_id AND content_hash=NEW.rule_pack_hash;
  IF NOT FOUND OR pack.status<>'released' OR pack.evidence_mode<>'synthetic'
    OR pack.release_evidence->>'accountantSignedContentHash'<>NEW.rule_pack_hash
    OR pack.release_evidence->>'externalSpecialistSignedContentHash'<>NEW.rule_pack_hash
  THEN RAISE EXCEPTION 'RULE_PACK_NOT_RELEASED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER require_w4_released_rule_pack BEFORE INSERT ON pay_run_employees FOR EACH ROW EXECUTE FUNCTION require_w4_released_rule_pack();
REVOKE ALL ON FUNCTION require_w4_released_rule_pack() FROM PUBLIC;

-- Do not replace require_finalized_parent(): W2 owns the verification branch.
ALTER TABLE outbox_jobs ADD COLUMN event_kind text, ADD COLUMN event_version integer;
ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_event_pair CHECK ((event_kind IS NULL)=(event_version IS NULL) AND (event_version IS NULL OR event_version>=1));
CREATE UNIQUE INDEX outbox_pay_run_event_version_key ON outbox_jobs(organization_id,pay_run_id,event_kind,event_version) WHERE event_kind IS NOT NULL;
CREATE FUNCTION w4_released_rule_pack_payload(rule_id uuid,org_id uuid,rule_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payload text; BEGIN
 SELECT canonical_payload INTO payload FROM public.legal_rule_packs WHERE id=rule_id AND organization_id=org_id AND content_hash=rule_hash AND status='released' AND evidence_mode='synthetic'
 AND release_evidence->>'accountantSignedContentHash'=rule_hash AND release_evidence->>'externalSpecialistSignedContentHash'=rule_hash;
 IF payload IS NULL THEN RAISE EXCEPTION 'RULE_PACK_NOT_RELEASED' USING ERRCODE='23514'; END IF; RETURN payload;
END $$;
REVOKE ALL ON FUNCTION w4_released_rule_pack_payload(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION w4_released_rule_pack_payload(uuid,uuid,text) TO payslip_app;
CREATE FUNCTION w4_finalization_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expected_payload jsonb; BEGIN
 IF NEW.status='finalized' THEN
  expected_payload=jsonb_build_object('eventKind','pay_run_finalized','payRunId',NEW.id::text,'finalVersion',NEW.version,'evidenceMode','synthetic');
  IF NOT EXISTS(SELECT 1 FROM public.approval_events WHERE pay_run_id=NEW.id AND action='pay_run.finalized')
   OR NOT EXISTS(SELECT 1 FROM public.audit_events WHERE aggregate_id=NEW.id AND action='pay_run.finalized')
   OR NOT EXISTS(SELECT 1 FROM public.outbox_jobs WHERE organization_id=NEW.organization_id AND pay_run_id=NEW.id AND event_kind='pay_run_finalized' AND event_version=NEW.version AND payload=expected_payload)
  THEN RAISE EXCEPTION 'FINALIZATION_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pay_run_finalization_evidence AFTER INSERT OR UPDATE OF status ON pay_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION w4_finalization_evidence();
REVOKE ALL ON FUNCTION w4_finalization_evidence() FROM PUBLIC;
