# Security section

The goal is a threat model of *this* design, where every threat has a mitigation and every
mitigation has a step that builds it. A list of generic best practices isn't a threat model:
if a line would be equally true of any project, cut it.

## Method

1. **Assets**: what is worth stealing, corrupting or making unavailable. Examples: accounts,
   personal data, money, API keys, the integrity of records, uptime.
2. **Actors**: anonymous visitor, signed-in user, another tenant, admin, a compromised
   dependency, the operator.
3. **Trust boundaries**: every place data crosses from less trusted to more trusted. Examples:
   browser → server, server → third-party API, uploaded file → parser, LLM output → tool
   call, webhook → handler, CI → production.
4. **Threats**: walk each data flow that crosses a boundary with STRIDE: Spoofing,
   Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
   Keep the ones that apply to this flow.
5. **Mitigations**: concrete and checkable ("reset tokens are 32 random bytes, stored
   SHA-256 hashed, single use, expire in 30 min"), linked to a step `S#`. Test the important
   ones in `testing.acceptance`.

Mitigation choices are research, held to the same standard as the rest of the plan:
cite the OWASP cheat sheet, ASVS requirement, RFC or vendor security doc you followed.

## Coverage check

Before calling the section done, go through each area that this design touches. Mark an area
not applicable only when nothing in the design touches it.

| Area | Ask | Reference |
|------|-----|-----------|
| Access control | Is every object access checked against the caller, server-side, deny by default? IDOR? | Top 10 A01, ASVS V8 |
| Authentication | Proven library or provider? MFA, credential storage (argon2id/bcrypt), lockout, recovery flow? | A07, ASVS V6 |
| Sessions and tokens | Cookie flags, rotation on login, expiry, revocation; JWT algorithm pinned, audience checked | ASVS V7, V9, V10 |
| Input and output | Validated at the boundary against a schema; output encoded for its context; parameterized queries | A05, ASVS V1, V2 |
| Server-side requests | Any user-influenced URL fetched? Allowlist, block internal ranges | A01 (SSRF), ASVS V4 |
| Files | Upload size/type limits, stored outside web root, no path traversal, safe parsers | ASVS V5 |
| Web frontend | CSP, CSRF defense, CORS limited to known origins, clickjacking headers | ASVS V3 |
| Secrets | Where do they live (env/secret manager, never repo or client bundle)? Rotation? | ASVS V13 |
| Crypto | Standard library primitives only; TLS everywhere; nothing hand-rolled | A04, ASVS V11, V12 |
| Data protection | Personal data minimized, retention, deletion, what gets logged | ASVS V14 |
| Supply chain | New deps vetted (maintenance, advisories via OSV/GitHub, license); lockfile committed; CI actions pinned | A03, A08 |
| Abuse and availability | Rate limits on auth, signup, expensive and paid endpoints; payload size limits; timeouts | ASVS V2 |
| Errors and logging | Security events logged without secrets or tokens; errors fail closed; no stack traces to users | A09, A10, ASVS V16 |
| Configuration | Debug off in prod, least-privilege service accounts and DB users, safe defaults | A02, ASVS V13 |
| LLM features | Prompt injection via retrieved or user content; tool permissions; output treated as untrusted | OWASP Top 10 for LLM Applications |

References are to the OWASP Top 10:2025 and ASVS 5.0 as of October 2026. Check for newer
versions when you research; standards get revised.

## Depth

Scale to the risk, not to the size of the feature. A small change that touches auth,
payments, file uploads, multi-tenancy or personal data gets the full method. A purely local
change with no new data flows gets a short section: what it touches and why that doesn't
create a new threat.
