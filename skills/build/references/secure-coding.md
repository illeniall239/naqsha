# Secure coding: security first, no exceptions

Security is not one item on the review list. It is the condition every line ships under. A
step with an open security finding is not done, whatever else passes. Speed, tokens, scope,
"it's only a prototype", "it's internal" and "we'll harden it later" are never reasons to
skip a rule here. Why: in Veracode's 2025 test of over 100 models, the generated code had an
OWASP Top 10 flaw in 45% of tasks, and cross-site scripting and log injection went
undefended in more than 85% of the cases that called for a defense. The cost of a breach
lands on the user, not on the step that saved ten minutes.

The rules below follow OWASP ASVS 5.0, the OWASP Top 10:2025 and the 2025 CWE Top 25 (as
of October 2026; check for newer versions when you research). Where a rule cites them, the
plan and step notes can too.

## Who can bend a rule

- **You never weaken a security control on your own.** If a rule blocks the plan, stop and
  bring it to the user as a deviation: the risk, the evidence, the secure way to get what
  they want.
- **The hard floor below holds even if the user asks.** Say so, explain why in one or two
  sentences, and offer the secure way to reach their goal. A self-signed certificate in
  development, for example, goes in the trust store; verification stays on.
- **Anything else only the user can accept, explicitly.** Record it in the plan: the threat
  or risk gets `acceptedBy: "user"` and their reason in `acceptedReason`. Silence, "sounds
  good" to something else, or a deadline is not acceptance.

### The hard floor

1. No secret, key, token or password in source, tests, fixtures, logs, error messages,
   URLs or client bundles.
2. No disabled TLS certificate verification, CSRF protection, auth check, output encoding
   or CSP in code that ships.
3. No SQL, shell command, code, query or template built by joining untrusted input into a
   string.
4. No password stored in plain text or with a fast hash; no home-made cryptography.
5. No unsafe deserializer on untrusted data (pickle, Java native serialization, full
   `yaml.load`, PHP `unserialize`, `Marshal`).
6. No endpoint, job or handler that changes data or returns non-public data without
   authentication and a check that this caller may touch this object.

## The rules

Each rule names the weakness it prevents. Apply every one the code touches.

### Input at trust boundaries (CWE-20, ASVS V2)
- Validate every input where it enters (request, file, message, env, CLI args, webhook,
  LLM output) against a schema: type, length, range, format, allowed values. Reject what
  fails; don't repair it and carry on. Why: a value that's half-cleaned is still hostile.
- Canonicalize before you validate (Unicode normalization, path resolution, URL decoding).
- Use strict types and comparisons; no type juggling (ASVS 15.3.5).
- Bind request data to an explicit field allowlist, never straight onto a model (mass
  assignment, ASVS 15.3.3). In JavaScript, use `Map`/`Set` or null-prototype objects for
  keys from input (prototype pollution, ASVS 15.3.6).

### Injection (CWE-89, -78, -77, -94, -79; Top 10 A05)
- SQL: parameterized queries or the ORM's query builder only. Table and column names from
  input go through an allowlist.
- Commands: avoid the shell. Pass an argument array (`execFile`, `subprocess.run([...])`,
  `exec.Command`), never a command string; put `--` before user-supplied arguments.
- Code: no `eval`, `new Function`, `exec`, dynamic `import` or template compilation on input.
- HTML: rely on the framework's auto-escaping. Raw sinks (`innerHTML`,
  `dangerouslySetInnerHTML`, `v-html`, `|safe`, `mark_safe`) only for content you produced,
  or after a maintained sanitizer such as DOMPurify. Encode for the context: HTML, attribute,
  URL, JavaScript, CSS.
- Also: NoSQL operators from input (`$where`, `$ne`), LDAP and XPath queries, header values
  (CR/LF), and log lines (use structured logging).

### Access control (CWE-862, -863, -639, -284, -306; A01; ASVS V8)
- Deny by default. Every request that reads or changes data checks, server-side, that this
  caller may act on this specific object (owner, tenant, role). An id from the client is a
  claim, not a permission.
- Authorization lives in one module that every entry point uses, not re-implemented per
  handler. See `modularity.md`.
- Every protected route gets a test that another user's object is refused.
- **Tenant isolation** in a multi-tenant system is enforced in one place every query goes
  through, not remembered query by query: row-level security in the database, or a
  repository that takes the tenant from the authenticated context and adds it to every
  query. Raw queries that bypass it are a red flag. Each data access path gets a test that
  one tenant can't read, change or list another's data, including through search, exports,
  caches, background jobs and file storage. Per-tenant limits keep one tenant from
  starving the rest.

### Authentication and sessions (CWE-352; A07; ASVS V6, V7, V9, V10)
- Use the framework's or provider's authentication. Don't write your own.
- Passwords: argon2id with OWASP's current parameters, or bcrypt or scrypt where argon2id
  isn't available.
- Compare secrets and tokens in constant time.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`; rotate the session on login
  and privilege change; expire and revoke.
- CSRF protection on every state-changing request authenticated by cookies.
- JWT: pin the algorithm, verify signature, `exp`, `aud` and `iss`; never accept `none`.

### Secrets (ASVS V13)
- From the environment or a secret manager, read in one config module. `.env` is
  git-ignored; `.env.example` holds placeholders only.
- If you find a secret in the repository or its history, stop and tell the user it needs
  rotating. Deleting it from the file doesn't make it secret again.

### Cryptography and randomness (A04; ASVS V11, V12)
- Tokens, ids that must not be guessed, and nonces come from a CSPRNG
  (`crypto.randomBytes`, `secrets`, `crypto/rand`), never `Math.random` or `random`.
- Standard library or libsodium primitives only: AES-GCM or ChaCha20-Poly1305, SHA-256 or
  better. No MD5 or SHA-1 for anything security-related.
- TLS for every connection that leaves the machine, with verification on.

### Files and paths (CWE-22, -434; ASVS V5)
- Resolve a path, then check it is inside the allowed root, after following symlinks.
- Uploads: size limit, type checked from content not the extension, a random server-side
  name, stored outside the web root, never executable. Archives: check every entry's path
  (zip slip) and the total unpacked size.

### Outbound requests (CWE-918; ASVS 15.3.2)
- A URL that input can influence is fetched only from an allowlist of hosts. Block private,
  loopback, link-local and cloud metadata addresses after DNS resolution. Don't follow
  redirects unless intended. Always set a timeout.

### Resource limits (CWE-770, -400; ASVS 15.1.3, 15.2.2)
- Limits on request body size, page size, upload size, query cost and fan-out. Timeouts on
  every network call. Rate limits on login, signup, password reset, and costly or paid
  endpoints.
- No regular expression with catastrophic backtracking on input. Queues and caches are
  bounded.

### Data exposure and errors (CWE-200; A09, A10; ASVS 15.3.1, V16)
- Return only the fields the caller needs: a response type, not the database row.
- Users get a generic error; details go to the log. No stack traces in responses.
- Log security events (login, failed authorization, permission changes) with who and
  when, never with secrets, tokens or personal data that isn't needed.
- **Audit trail** for actions someone may later need to prove or investigate: sign-ins,
  changes to roles and permissions, data exports, deletions, money movements, admin
  actions, and changes to settings that affect security. Each record says who (user and,
  for admins acting as someone, both), what, on which object, when (UTC), from where, and
  the outcome. It's append-only (the application can't update or delete it), kept apart
  from debug logs, has its own retention period from the plan, and is written in the same
  transaction as the action, so an action never happens unrecorded.
- Fail closed: an exception in an auth, validation or payment path denies. No catch-all
  that continues.
- Check-then-act on shared state is one atomic operation: a transaction, a unique
  constraint, a conditional update (TOCTOU, ASVS 15.4.2).

### Web frontend (ASVS V3)
- Content-Security-Policy without `unsafe-inline` scripts where the stack allows,
  `frame-ancestors` against clickjacking, and `X-Content-Type-Options: nosniff`.
- CORS allows named origins only; never `*` with credentials.
- Redirect targets come from an allowlist (open redirect). Scripts from a CDN get Subresource
  Integrity.

### Memory-unsafe code (CWE-787, -125, -416, -120, -121, -122, -476)
- In C and C++: bounds-checked APIs only (no `strcpy`, `sprintf`, `gets`), ownership
  documented, tests run under AddressSanitizer and UBSan, and parsers get a fuzz target.
- For a new component, prefer a memory-safe language unless the plan's decisions say
  otherwise (CISA and partners' memory-safety guidance).

### Dependencies and supply chain (A03, A08; ASVS 15.1, 15.2)
- No dependency the plan doesn't list. Before adding one, check that the exact package
  name exists and is the one you mean. AI assistants invent plausible package names, and
  attackers register them.
- Check advisories (OSV, GitHub advisories) for the version you install. Commit the
  lockfile. Install from the expected registry (dependency confusion).
- CI actions are pinned to a commit SHA. Test code, samples and debug features don't ship
  (ASVS 15.2.3).

### LLM features (OWASP Top 10 for LLM Applications)
- Model output is untrusted input: validate it before it reaches a tool, a query or a page.
  Tools get the least privilege that works. No secrets in prompts.

## Red flags in a diff

Grep your diff for these before you call a step done. Each hit needs to be removed, or be
shown in the step notes to touch no untrusted data and to have no safer equivalent.

`eval(` · `new Function` · `exec(` · `shell=True` · `os.system` · `child_process.exec` with
interpolation · string-built SQL (`+`, f-strings, template literals near `SELECT`,
`INSERT`, `UPDATE`, `DELETE`) · `pickle.load` · `yaml.load(` without `SafeLoader` ·
`unserialize(` · `innerHTML` · `dangerouslySetInnerHTML` · `v-html` · `|safe` ·
`mark_safe` · `Math.random()` near tokens or ids · `md5`/`sha1` near passwords or
signatures · `verify=False` · `rejectUnauthorized: false` · `InsecureSkipVerify` ·
`NODE_TLS_REJECT_UNAUTHORIZED` · `Access-Control-Allow-Origin: *` · `chmod 777` ·
`strcpy`/`sprintf`/`gets` · a raw query that bypasses the tenant-scoped repository · a
cache key without the user or tenant in it · suppression comments (`nosec`, `nosemgrep`,
`eslint-disable` on a security rule, `# type: ignore` on validation code).

## Checks every step runs

The plan's `testing.securityChecks` lists them. Run each one for every step, and record
each as pass, fail, unavailable or blocked, like any other check.

1. **Security tests, written first.** Each threat mitigation the step owns starts as an
   attack test that gets through (`tdd.md`): another user's object, malformed input, an
   oversized body, an expired token. Then the defense makes it fail closed.
2. **Static analysis** with the project's security rules (for example Semgrep, CodeQL,
   Bandit, gosec, eslint-plugin-security).
3. **Dependency audit** whenever dependencies change (for example `npm audit`,
   `pip-audit`, `govulncheck`, `cargo audit`, `osv-scanner`).
4. **Secret scan** of the diff (for example gitleaks).

A finding is fixed, or shown to be a false positive with a concrete reason in the notes.
Silencing it with a suppression comment is the user's call, never yours. A security check
that is unavailable is not a pass: name it in the step report and in the final summary.
