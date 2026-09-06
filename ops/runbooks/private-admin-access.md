# Private admin access

The current approved local synthetic run binds administration to 127.0.0.1:46217. Only the same machine can reach it. Authentication, MFA, CSRF and organization authorization still apply.

No second-PC access channel, LAN bind, public hostname, tunnel, shared kiosk credential or Windows service deployment is enabled. The attendance process on 127.0.0.1:46218 cannot serve or proxy admin routes and has a separate restricted database identity.

Before multi-PC access, approve and verify a named-device/user private channel, MFA, revocation and an unauthenticated Internet negative test. That release gate is outside the local kiosk wave.
