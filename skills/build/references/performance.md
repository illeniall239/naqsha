# Performance by design: complexity against real numbers

You know Big-O, data structures and the classic algorithms. What goes wrong is applying
them: a query inside a loop on a page that lists 10,000 rows, or a clever structure around a
list that never holds more than 50 items. The rule here is to judge cost against the input
sizes and budgets in the plan, not in the abstract. Knuth's full sentence is the guide: forget
small efficiencies about 97% of the time, "yet we should not pass up our opportunities in
that critical 3%". The plan's hot paths are that 3%.

## Where it applies

- **Hot paths** (`architecture.hotPaths` in the plan): each has its input size from the
  estimates and a time budget from a quality scenario. Code on them is designed for that
  size and proven against it.
- **Everywhere else:** write the simplest clear code, but never something that grows badly
  in the input by accident (the traps below). Simple and linear beats clever.
- **Untrusted input, everywhere:** worst case, not average case (see below).

## Count what actually costs

In most applications the cost is I/O, not CPU. State the complexity of a hot path in the
units that dominate it:

- **Database:** queries per request (one per page, never one per row: no N+1), rows
  scanned, not just returned. Check that every query on a hot path uses an index: run
  `EXPLAIN` (or the store's equivalent) on realistic data and put the plan's key line in the
  step notes.
- **Network:** round trips per request. Batch, or fetch in parallel with a limit, instead
  of calling once per item.
- **Memory:** peak memory at the estimated size. Stream large results (cursors, chunked
  responses, generators) instead of loading them whole. Every collection that grows with
  traffic or time has a bound.
- **CPU:** time and space complexity in the input size, for the code that loops over data.

## Traps that grow quietly

| Looks harmless | Grows as | Instead |
|----------------|----------|---------|
| A query or HTTP call inside a loop | n round trips | One batched query or call (`WHERE id IN`, a join, a bulk endpoint) |
| `list.includes` / `in list` / `indexOf` inside a loop | n² | A Set or Map built once |
| Sorting or re-reading the same data on every request | n log n per request | Sort once, keep the index, or let the database order it |
| String concatenation in a loop (in languages where strings are immutable) | n² | A builder or `join` |
| `SELECT *` then filtering in code | rows in the table | Filter, page and project in the query |
| Offset pagination deep into a large table | rows skipped | Keyset (cursor) pagination |
| A cache, map or queue with no size limit or expiry | unbounded memory | A bound and an eviction policy |
| Nested loops joining two lists | n × m | A hash map on one side |

## Worst case for untrusted input

When an attacker chooses the input, the average case doesn't protect you. Design for the
worst case on every path that takes input from outside:

- **Regular expressions:** no nested quantifiers or overlapping alternatives on input
  (ReDoS). Prefer a linear-time engine (RE2, Rust `regex`) or bound the input length first.
- **Hash tables:** keys from input can collide on purpose (hash flooding, the multi-language
  hashDoS disclosures of 2011). Use the language's randomized hashing, and cap the number
  of keys you accept.
- **Parsers:** limit nesting depth, element count and total size for JSON, XML (and no
  entity expansion), YAML and archives.
- **Anything quadratic in input size** gets a hard size limit before it runs.

These are resource limits in `secure-coding.md` seen from the algorithm side; both apply.

## Choosing the structure

- The standard library or an installed, well-maintained library first: its sort, heap,
  map, set, priority queue, trie or interval tree. Hand-rolling a data structure needs a
  reason in the step notes.
- Pick by the operations the hot path performs and how often: lookups by key (map), order
  (sorted structure or index), membership (set), the smallest or largest next (heap),
  ranges (sorted structure or B-tree index).
- Constants matter at real sizes: a linear scan over 30 items in contiguous memory can
  beat a hash map. Below the sizes in the estimates, choose for clarity.

## Prove it

- Every hot path gets a check in its step: a benchmark or load test at the estimated size
  that must meet the budget, run like any other check, with the numbers in the notes.
- Measure before optimizing anything that isn't a hot path. Profile, find the actual cost,
  fix that. A guess about where time goes is often wrong.
- Optimizations keep their tests green, and stay in the hot path's module
  (`modularity.md`), so the clever part has one home.
