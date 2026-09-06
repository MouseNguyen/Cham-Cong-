# Local synthetic launcher

This launcher is scoped to the approved synthetic database on 127.0.0.1:55432. Supply PAYSLIP_AUTH_DATABASE_URL and PAYSLIP_INGRESS_DATABASE_URL in the calling process environment through the test harness; never paste credentials into commands or files. The ingress process receives only its dedicated restricted database identity.

1. Build the web app with the approved local build command.
2. Run scripts/windows/start-pay-slip.ps1 in the foreground (optional -Scope admin or attendance). A ready receipt requires the selected health endpoints to succeed.
3. Run scripts/windows/health-pay-slip.ps1 for current health.
4. Use scripts/windows/stop-pay-slip.ps1 for an explicit stop. The launcher also handles Ctrl+C and the foreground input command stop through its cleanup handler.

Port ownership is inspected before startup. Existing listeners are reported and left running. The stop helper matches process creation time and executable before stopping owned process trees, then verifies listener absence. State receipts contain no database credentials.

The synthetic database harness owns PostgreSQL startup and shutdown. Retain its temporary clusters and evidence; this launcher does not delete them. Real data, unattended Windows service deployment, tunnels and LAN access are outside this wave. Actual lifecycle evidence is recorded in ops/evidence/PAY-W7-02a-runtime.json; a handler's existence alone does not prove OS Ctrl+C behavior.
