-- W3-02a isolated kiosk ingress. Immutable clock_events remain append-only; mutable
-- device/employee aggregates provide the only SELECT FOR UPDATE serialization point.
CREATE TABLE kiosk_devices (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, workplace_id uuid NOT NULL,
 session_id uuid NOT NULL, token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'), UNIQUE(id,organization_id),
 enrolled_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL, revoked_at timestamptz(3),
 FOREIGN KEY(workplace_id,organization_id) REFERENCES workplaces(id,organization_id)
);
CREATE TABLE kiosk_employee_pins (
 employee_id uuid NOT NULL, organization_id uuid NOT NULL, device_id uuid NOT NULL,
 employee_code text NOT NULL, pin_hash text NOT NULL, revoked_at timestamptz(3),
 PRIMARY KEY(employee_id,device_id), UNIQUE(device_id,employee_code),
 FOREIGN KEY(employee_id,organization_id) REFERENCES employees(id,organization_id), FOREIGN KEY(device_id,organization_id) REFERENCES kiosk_devices(id,organization_id)
);
CREATE TABLE kiosk_employee_states (
 employee_id uuid PRIMARY KEY, organization_id uuid NOT NULL, workplace_id uuid NOT NULL, last_direction text CHECK(last_direction IN ('IN','OUT')), revision integer NOT NULL DEFAULT 0, updated_at timestamptz(3) NOT NULL,
 FOREIGN KEY(employee_id,organization_id,workplace_id) REFERENCES employees(id,organization_id,workplace_id)
);
CREATE TABLE kiosk_command_proofs (
 id uuid PRIMARY KEY, idempotency_key_hash text NOT NULL CHECK(idempotency_key_hash ~ '^[0-9a-f]{64}$'), device_id uuid NOT NULL, session_id uuid NOT NULL, employee_id uuid NOT NULL,
 event_id uuid NOT NULL, direction text NOT NULL CHECK(direction IN ('IN','OUT')), expires_at timestamptz(3) NOT NULL,
 UNIQUE(idempotency_key_hash,device_id,session_id,employee_id), FOREIGN KEY(device_id) REFERENCES kiosk_devices(id), FOREIGN KEY(event_id) REFERENCES clock_events(id)
);
CREATE TABLE kiosk_audit_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, device_id uuid NOT NULL, employee_id uuid, action text NOT NULL, outcome text NOT NULL, created_at timestamptz(3) NOT NULL,
 FOREIGN KEY(device_id) REFERENCES kiosk_devices(id)
);
CREATE TABLE kiosk_rate_limits (key_hash text PRIMARY KEY CHECK(key_hash ~ '^[0-9a-f]{64}$'), failure_count integer NOT NULL DEFAULT 0, locked_until timestamptz(3), updated_at timestamptz(3) NOT NULL);
CREATE INDEX kiosk_command_proof_lookup ON kiosk_command_proofs(idempotency_key_hash,device_id,session_id,employee_id,expires_at);
CREATE TRIGGER immutable_kiosk_proofs BEFORE UPDATE OR DELETE ON kiosk_command_proofs FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_kiosk_audit BEFORE UPDATE OR DELETE ON kiosk_audit_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
-- The ingress role cannot lock employee history. This narrowly scoped trigger
-- locks only the active referenced employee under the migration owner.
DROP TRIGGER IF EXISTS employee_active ON clock_events;
CREATE FUNCTION ingress_require_active_employee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM id FROM public.employees WHERE id=NEW.employee_id AND organization_id=NEW.organization_id AND workplace_id=NEW.workplace_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_INACTIVE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ingress_employee_active BEFORE INSERT ON clock_events FOR EACH ROW EXECUTE FUNCTION ingress_require_active_employee();
-- Parent runs these after creating the dedicated payslip_ingress role; no payroll/user/document grants.
GRANT USAGE ON SCHEMA public TO payslip_ingress;
GRANT SELECT ON kiosk_devices,kiosk_employee_pins,clock_events,kiosk_command_proofs TO payslip_ingress;
GRANT SELECT(id,organization_id,workplace_id,status) ON employees TO payslip_ingress;
GRANT INSERT ON clock_events,kiosk_command_proofs,kiosk_audit_events,kiosk_rate_limits TO payslip_ingress;
GRANT SELECT,UPDATE ON kiosk_employee_states,kiosk_rate_limits TO payslip_ingress;
