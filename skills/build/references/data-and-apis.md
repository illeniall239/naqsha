# Data and APIs: the contracts that outlive the code

Code can be rewritten in an afternoon. A schema with data in it, and an API with clients
calling it, are contracts: expensive to change and painful to get wrong. The usual slop:
integrity left to application code, migrations that lock a table or break the version still
running, floats for money, local times, a different error shape per endpoint, and lists
with no limit.

## Data

- **Integrity lives in the database.** `NOT NULL`, foreign keys, `UNIQUE` and `CHECK`
  constraints for every invariant the code relies on. Application validation gives good
  messages; the constraint is the guarantee, because concurrent writers, scripts and other
  services don't go through your code.
- **Types that can't lie:**
  - **Money:** integer minor units or `DECIMAL`, stored with its currency code, never a
    float.
  - **Instants:** UTC in a time-zone-aware type (`timestamptz`), converted for display at
    the edge.
  - **Future local events** (a meeting at 9:00 in Lisbon): the local time plus the zone
    name, because offsets change.
  - **Ids exposed to clients:** not guessable (random or UUIDv7), which ties into the
    access checks in `secure-coding.md`.
  - **Enums:** constrained in the schema.
- **Transactions** around every multi-write invariant, at an isolation level chosen on
  purpose. A write that clients may retry is idempotent: a unique constraint on its
  idempotency key or natural key.
- **Migrations never break the running version.** Use expand and contract (parallel change),
  one deploy at a time:
  1. Add the new column or table.
  2. Write to both.
  3. Backfill in batches.
  4. Read from the new one.
  5. Stop writing the old one.
  6. Drop the old one in a later release.
  
  Never in a single deploy: renaming or dropping something the current code reads,
  `NOT NULL` without a default on a large table, or a type change that rewrites the table.
  Know which statements lock (Postgres: `CREATE INDEX CONCURRENTLY`). Each migration is
  reversible, or says it isn't and has a backup step. Test it up and down on a copy of the
  schema with the data volume from the estimates.
- **Backfills** run in batches, can resume, and are throttled.
- **Lifecycle.** Each kind of data has a retention period from the plan, and deletion
  actually deletes. Soft delete only where a requirement needs restoring, with unique
  constraints that account for it.
- **Test and seed data is synthetic.** Never copy production personal data.

## APIs

- **Contract first.** The interface is written down in the repository (OpenAPI 3.2 for HTTP,
  protobuf for gRPC, the GraphQL schema), and a test checks the code against it. The
  schema can be the input validator too.
- **HTTP semantics (RFC 9110):** `GET` is safe, `PUT` and `DELETE` are idempotent, `POST`
  is neither. Status codes mean what they say:
  - `201` with `Location` when something is created
  - `401` for not signed in, `403` for not allowed
  - `404` for objects the caller may not know exist
  - `409` for conflicts
  - `429` with `Retry-After` for rate limits
- **One error shape.** RFC 9457 Problem Details (`application/problem+json`: `type`,
  `title`, `status`, `detail`, `instance`), unless the project already has a format, which
  you then follow everywhere. No stack traces or internal details (`secure-coding.md`).
- **Every list is paginated** with a maximum page size and a stable order; use cursors for
  large or changing collections (`performance.md`).
- **Operations clients retry** (a payment, an order, an email) take an idempotency key: the
  server stores the key with the result and returns the same result on a retry. This is
  the Stripe pattern; the IETF `Idempotency-Key` header is still a draft as of October 2026.
- **Lost updates:** an update that can collide uses optimistic concurrency (`ETag` with
  `If-Match`, or a version column).
- **Compatibility.** Within a version, changes are additive only: new optional fields and
  new endpoints. Removing, renaming or changing a field's meaning is breaking, so it needs a
  new version or a deprecation period (announce it, then a `Sunset` header, RFC 8594).
  Clients ignore fields they don't know.
- **Webhooks.** Outgoing ones are signed (an HMAC over the body and a timestamp) and
  retried with backoff. Incoming ones are verified (signature and timestamp) and
  deduplicated by event id.

## Review

- Which invariants does the database enforce, and which only the code? Why?
- Can this migration run while the previous version of the code is still serving?
- Is every number of money, every instant and every exposed id typed as above?
- Does every endpoint follow the contract, the error shape and the pagination rule?
- What happens when a client retries this request?
