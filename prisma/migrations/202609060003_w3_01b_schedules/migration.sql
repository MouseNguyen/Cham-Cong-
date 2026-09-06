-- W3-01b appends effective-date closures and dated/public-holiday overrides.
-- Source rows are immutable: replacement is represented by a new row plus closure/supersession.
ALTER TABLE opening_hour_versions ADD CONSTRAINT opening_hour_version_source_key UNIQUE (id, organization_id, workplace_id, content_hash);
ALTER TABLE schedule_assignments ADD CONSTRAINT schedule_assignment_source_key UNIQUE (id, organization_id, workplace_id, employee_id);

CREATE TABLE opening_hour_closures (
  version_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  source_hash text NOT NULL,
  effective_to timestamptz(3) NOT NULL,
  FOREIGN KEY (version_id, organization_id, workplace_id, source_hash)
    REFERENCES opening_hour_versions(id, organization_id, workplace_id, content_hash)
);

CREATE TABLE schedule_assignment_closures (
  assignment_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  effective_to timestamptz(3) NOT NULL,
  FOREIGN KEY (assignment_id, organization_id, workplace_id, employee_id)
    REFERENCES schedule_assignments(id, organization_id, workplace_id, employee_id)
);

CREATE TABLE schedule_exceptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('date', 'public_holiday')),
  local_date date NOT NULL,
  canonical_payload text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex')),
  created_at timestamptz(3) NOT NULL,
  FOREIGN KEY (employee_id, organization_id, workplace_id)
    REFERENCES employees(id, organization_id, workplace_id),
  UNIQUE (id, organization_id, employee_id)
);

CREATE TABLE schedule_exception_supersessions (
  prior_exception_id uuid PRIMARY KEY,
  replacement_exception_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  created_at timestamptz(3) NOT NULL,
  FOREIGN KEY (prior_exception_id, organization_id, employee_id)
    REFERENCES schedule_exceptions(id, organization_id, employee_id),
  FOREIGN KEY (replacement_exception_id, organization_id, employee_id)
    REFERENCES schedule_exceptions(id, organization_id, employee_id),
  CHECK (prior_exception_id <> replacement_exception_id)
);

CREATE FUNCTION validate_schedule_closure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE start_at timestamptz; end_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'opening_hour_closures' THEN
    PERFORM id FROM workplaces WHERE id = NEW.workplace_id AND organization_id = NEW.organization_id FOR UPDATE;
    SELECT valid_from, valid_to INTO start_at, end_at FROM opening_hour_versions WHERE id = NEW.version_id;
  ELSE
    PERFORM id FROM employees WHERE id = NEW.employee_id AND organization_id = NEW.organization_id FOR UPDATE;
    SELECT valid_from, valid_to INTO start_at, end_at FROM schedule_assignments WHERE id = NEW.assignment_id;
  END IF;
  IF start_at IS NULL OR NEW.effective_to <= start_at OR (end_at IS NOT NULL AND NEW.effective_to > end_at) THEN
    RAISE EXCEPTION 'INVALID_CLOSURE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_opening_closure BEFORE INSERT ON opening_hour_closures FOR EACH ROW EXECUTE FUNCTION validate_schedule_closure();
CREATE TRIGGER validate_assignment_closure BEFORE INSERT ON schedule_assignment_closures FOR EACH ROW EXECUTE FUNCTION validate_schedule_closure();

-- A row lock and logical end date serialize effective-range replacement without mutating source history.
CREATE FUNCTION guard_schedule_effective_range() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE overlap_found boolean; effective_end timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'opening_hour_versions' THEN
    PERFORM id FROM workplaces WHERE id = NEW.workplace_id AND organization_id = NEW.organization_id FOR UPDATE;
    SELECT LEAST(NEW.valid_to, c.effective_to) INTO effective_end FROM (SELECT 1) x LEFT JOIN opening_hour_closures c ON c.version_id = NEW.id;
    SELECT EXISTS(
      SELECT 1 FROM opening_hour_versions v LEFT JOIN opening_hour_closures c ON c.version_id = v.id
      WHERE v.organization_id = NEW.organization_id AND v.workplace_id = NEW.workplace_id AND v.id <> NEW.id
        AND tstzrange(v.valid_from, LEAST(v.valid_to, c.effective_to), '[)') && tstzrange(NEW.valid_from, effective_end, '[)')
    ) INTO overlap_found;
  ELSE
    PERFORM id FROM employees WHERE id = NEW.employee_id AND organization_id = NEW.organization_id AND workplace_id = NEW.workplace_id FOR UPDATE;
    SELECT LEAST(NEW.valid_to, c.effective_to) INTO effective_end FROM (SELECT 1) x LEFT JOIN schedule_assignment_closures c ON c.assignment_id = NEW.id;
    SELECT EXISTS(
      SELECT 1 FROM schedule_assignments v LEFT JOIN schedule_assignment_closures c ON c.assignment_id = v.id
      WHERE v.organization_id = NEW.organization_id AND v.employee_id = NEW.employee_id AND v.id <> NEW.id
        AND tstzrange(v.valid_from, LEAST(v.valid_to, c.effective_to), '[)') && tstzrange(NEW.valid_from, effective_end, '[)')
    ) INTO overlap_found;
  END IF;
  IF overlap_found THEN RAISE EXCEPTION 'OVERLAPPING_PERIOD' USING ERRCODE = '23P01'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER opening_effective_range BEFORE INSERT OR UPDATE ON opening_hour_versions FOR EACH ROW EXECUTE FUNCTION guard_schedule_effective_range();
CREATE TRIGGER assignment_effective_range BEFORE INSERT OR UPDATE ON schedule_assignments FOR EACH ROW EXECUTE FUNCTION guard_schedule_effective_range();

CREATE FUNCTION validate_schedule_exception_supersession() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior schedule_exceptions; replacement schedule_exceptions;
BEGIN
  SELECT * INTO prior FROM schedule_exceptions WHERE id = NEW.prior_exception_id FOR UPDATE;
  SELECT * INTO replacement FROM schedule_exceptions WHERE id = NEW.replacement_exception_id FOR UPDATE;
  IF prior.organization_id <> NEW.organization_id OR replacement.organization_id <> NEW.organization_id
    OR prior.employee_id <> NEW.employee_id OR replacement.employee_id <> NEW.employee_id
    OR prior.workplace_id <> replacement.workplace_id OR prior.kind <> replacement.kind OR prior.local_date <> replacement.local_date THEN
    RAISE EXCEPTION 'INVALID_EXCEPTION_SUPERSESSION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_exception_supersession BEFORE INSERT ON schedule_exception_supersessions FOR EACH ROW EXECUTE FUNCTION validate_schedule_exception_supersession();

CREATE TRIGGER immutable_opening_closure BEFORE UPDATE OR DELETE OR TRUNCATE ON opening_hour_closures FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_assignment_closure BEFORE UPDATE OR DELETE OR TRUNCATE ON schedule_assignment_closures FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_schedule_exception BEFORE UPDATE OR DELETE ON schedule_exceptions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_exception_supersession BEFORE UPDATE OR DELETE OR TRUNCATE ON schedule_exception_supersessions FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
CREATE INDEX schedule_exception_effective_idx ON schedule_exceptions(organization_id, employee_id, local_date, kind);

-- The logical guards above replace physical exclusions, which cannot see closure rows.
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN SELECT conrelid::regclass AS target_table, conname FROM pg_constraint
    WHERE contype='x' AND conrelid IN ('opening_hour_versions'::regclass,'schedule_assignments'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.target_table, constraint_row.conname);
  END LOOP;
END $$;
