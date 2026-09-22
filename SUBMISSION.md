# Product Engineering Challenge Submission

## Candidate

- **Name:Yohaan Sachin Dhuri**
- **Email: yohaandhuri@gmail.com**
- **GitHub: https://github.com/Yohaandhuri**
- **Selected problem: Webhook retry engine**
- **Demo video: https://www.loom.com/share/7018ee5e7c8a46faa1108e95a748c821**

## Run the project

Prerequisites:
- Node.js 18 or higher
- npm

Setup:
```
npm install
cp env.example .env
```

Environment variables (set in `.env`, see `.env.example` for the full list, no secrets involved):
```
PORT=3000
RECEIVER_PORT=4000
DB_PATH=./data/webhook-engine.db
WEBHOOK_URL=http://localhost:4000/receive
POLL_INTERVAL_MS=1000
MAX_ATTEMPTS=5
BACKOFF_BASE_MS=1000
BACKOFF_MAX_MS=30000
PER_CLIENT_FETCH_LIMIT=5
BATCH_SIZE=20
WEBHOOK_TIMEOUT_MS=5000
MAX_CLIENTS=50
```

Run the main service (in one terminal):
```
npm start
```

Run the local test receiver (in a second terminal). This is a small Express app that stands 
in for the external webhook endpoint. It can be switched between different behaviors 
("success", "fail_retryable", "fail_terminal", "fail_once") on demand:
```
npm run receiver
```
Available modes:
- `success` — always returns 200
- `fail_retryable` — always returns 503 (keeps failing, good for watching retries and eventually hitting the attempt limit)
- `fail_terminal` — always returns 400 (non-retryable, stops after one attempt)
- `fail_once` — fails the first call, succeeds after that (good for showing a clean retry-then-success)
- `timeout` — never responds, to test the request timeout path

### How to trigger the different scenarios


## AC1 — Successful delivery
Switches receiver to success mode:
```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="success"} | ConvertTo-Json)
```
Registers an event:
```powershell
$body1 = @{
    eventId = "evt_demo_1"
    type = "incident.created"
    occurredAt = "2026-09-22T10:00:00Z"
    payload = @{ incidentId = "inc_1"; severity = "high" }
    clientId = "demo-client"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body1
```
See the status of the event:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_1
```
**Expect:** `status: delivered`, `attemptCount: 1`, one attempt with `outcome: success`.

## AC2 — Temporary failure, then retry succeeds
Switches receiver to temporary-failure mode:
```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="fail_once"} | ConvertTo-Json)
```
Registers an event:
```powershell
$body2 = @{
    eventId = "evt_demo_2"
    type = "incident.created"
    occurredAt = "2026-09-22T10:00:00Z"
    payload = @{ incidentId = "inc_2"; severity = "high" }
    clientId = "demo-client"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body2
```
Check event status:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_2 | ConvertTo-Json -Depth 5
```
**Expect (after retry):** `status: delivered`, `attemptCount: 2`, attempts show `failed_retryable` then `success`.

## AC3 — Terminal failure (non-retryable, stops immediately)
Switches receiver to terminal-failure mode:
```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="fail_terminal"} | ConvertTo-Json)
```
Registers an event:
```powershell
$body3 = @{
    eventId = "evt_demo_3"
    type = "incident.created"
    occurredAt = "2026-09-22T10:00:00Z"
    payload = @{ incidentId = "inc_3"; severity = "high" }
    clientId = "demo-client"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body3
```
Check event status:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_3 | ConvertTo-Json -Depth 5
```
**Expect:** `status: failed`, `attemptCount: 1`, one attempt with outcome `failed_terminal`, httpStatus 400.

## AC4 — Idempotent ingestion
Register event:
```powershell
$body4 = @{
    eventId = "evt_demo_4"
    type = "incident.created"
    occurredAt = "2026-09-22T10:00:00Z"
    payload = @{ incidentId = "inc_4"; severity = "high" }
    clientId = "demo-client"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body4
```
**Expect:** `duplicate: False`.
Register same event again:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body4
```
**Expect:** `duplicate: True` — same eventId, no new event created.
Check event status:
```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_4 | ConvertTo-Json -Depth 5
```
**Expect:** `status: delivered`, `attemptCount: 1` — only one attempt despite two submissions.

## Run the tests

```
npm test
```
This runs the full automated test suite with Jest. 
Tests use an in-memory SQLite database and a mocked `fetch` 
(no real network calls, no paid service, no real receiver process needed to run these).

## Acceptance scenarios and verification

All five acceptance scenarios are implemented and covered by automated tests:
- **AC1 (Successful delivery)**
  — covered by `tests/scheduler.test.js`, test
    "a successful delivery marks the event delivered with one recorded attempt"
- **AC2 (Temporary failure and retry)**
  — covered by `tests/scheduler.test.js`, test
    "a temporary failure is retried and eventually succeeds"
- **AC3 (Bounded failure)**
  — covered by two tests in `tests/scheduler.test.js`:
    one for a terminal (non-retryable) failure stopping after one attempt,
    and one for retryable failures stopping once the configured attempt limit is reached,
    confirming a further tick does not attempt it again
- **AC4 (Idempotent ingestion)**
  — covered by two tests in `tests/ingestion.test.js`:
    a sequential duplicate submission, and a concurrent duplicate submission (two identical requests fired at the same time),
    both confirming only one row ever exists for a given `eventId`
- **AC5 (Inspectable history)**
  — covered by `tests/inspection.test.js`,
    checking that `GET /events/:eventId` returns the current status and the attempt history in the correct order

One thing I added beyond the minimum: a `clientId` field on events (self-reported by the caller, falling back to their IP if not given),
which is used to make retry scheduling fair across multiple clients (explained more below). 
This isn't part of the required scenarios, but it addresses a fairness problem I noticed could come up with many clients submitting events at different volumes.

## Architecture and data flow

The service is split into four layers, each with one job:

**Ingestion** (`src/services/ingestionService.js`, `src/routes/eventsRoutes.js`) 
  — receives the `POST /events` request, validates the body with Zod, 
    figures out the client ID (either what was sent or falls back to the requester's IP), 
    and calls the repository to store it.

**Storage** (`src/repositories/`) 
  — the only place that touches the SQLite database directly. 
    `eventRepository.js` handles events (insert with duplicate detection, 
    state transitions, the query that finds due events). 
    `attemptRepository.js` handles the attempt history (append-only, one row per delivery attempt).

**Scheduler** (`src/scheduler/scheduler.js`) 
  — polls the database on an interval (`setInterval`) for events that are due 
    (`status = 'pending'` and `next_attempt_at` has passed). 
    For each one it finds, it claims it (flips status to `delivering`, 
    which also guards against two overlapping ticks grabbing the same event), 
    hands it to the delivery service, and based on the result, moves it to `delivered`, 
    schedules a retry, or marks it permanently `failed`.

**Delivery** (`src/services/deliveryService.js`) 
  — makes the actual HTTP call to the configured webhook URL, with a timeout, 
    and classifies the result as success, a retryable failure, or a terminal failure using 
    `src/scheduler/retryPolicy.js`.

Data flow for a normal event:

```
Client -> POST /events -> ingestionService -> eventRepository (insert)
                                                     |
                          scheduler polls DB every POLL_INTERVAL_MS
                                                     |
                                    eventRepository.findDueEventsFairly()
                                                     |
                                        selectFairBatch() (round-robin)
                                                     |
                              for each event: claim it, then deliveryService
                                                     |
                          success -> delivered | retryable -> reschedule
                                              | terminal -> failed
                                                     |
                              attemptRepository records every attempt
                                                     |
                          Client -> GET /events/:id -> shows status + history
```

## Technology choices

I built this with Node.js, Express, and SQLite (via `better-sqlite3`).

I picked Node for a project this size, it let me move faster than I could have with Spring Boot, 
which is the other stack I'm comfortable with. Spring has good built-in tools for 
a lot of what this project needs (retry annotations, scheduled tasks), but for a small, 
focused project like this, writing the retry and scheduling logic 
by hand in plain functions felt more transparent, and it's easier to unit test 
without extra framework setup.

I picked SQLite over a "real" database server (Postgres, MySQL) because it needs zero setup, 
it's just a single file, and the project doesn't need to run against a separate DB server 
for a prototype like this. Its main limitations compared to 
Postgres: no native timestamp type (I store timestamps as ISO-8601 text, 
which sorts correctly as plain strings, so it works fine for this, 
but a production version would likely move to a real timestamp type
or numeric Unix timestamps for slightly better performance at scale), 
and no native JSON type (the event payload is stored as a JSON string and parsed back out).

I avoided a message queue (Redis, RabbitMQ) on purpose. The scheduler polling the database 
on an interval, using a `next_attempt_at` column, does the same job a queue would do at 
this scale (holding jobs, scheduling delayed retries) without adding another moving part to run 
and configure.

## Important decisions

**Idempotency is enforced at the database level, not just in application code.** 
`event_id` is the primary key on the `events` table. When a new event comes in, the 
code always tries to insert it, and if that fails because the ID already exists, 
it just returns the existing row instead of creating a new one. 
I didn't do a "check if it exists, then insert" as two separate steps, 
because that has a race condition — two identical requests arriving at the same time 
could both pass the check before either one inserts. Letting the database's unique constraint
be the real guard avoids that.

**Retry state lives in the database, not in memory.** 
Instead of using `setTimeout` to schedule a retry, every event has a `next_attempt_at` column, 
and the scheduler just polls for anything due. This means if the process crashes or restarts, 
nothing is lost — the next time the scheduler runs, it picks up exactly where it left off, 
since the "when to retry" information was never only sitting in memory. 
I also added a startup check that resets any event stuck in an in-progress (`delivering`) 
status back to `pending`, in case the process died in the middle of handling it, 
so nothing gets permanently stuck.

**Retry scheduling is fair across multiple clients.** 
Since events belong to different clients (`clientId`), I didn't want one client submitting 
a large number of events to delay another client's events from being processed. 
The scheduler discovers which clients have work due, ordered by whoever has been waiting the longest,
then pulls a capped number of due events per client, and interleaves them round-robin style 
when building the batch to process. This wasn't a strict requirement, but I thought it was 
a realistic problem for a system like this to have, and the fix was small once the rest of the 
design was in place.

## Assumptions and limitations

- `eventId` uniqueness is treated as the only thing that defines a duplicate.
  If the same `eventId` is sent twice with different payload content,
  I keep the original and ignore the new payload — I don't try to detect or merge
  conflicting content.

- The webhook URL is a single, fixed endpoint configured through `.env`.
  Multiple subscriber endpoints, authentication on the webhook call,
  and request signing are not implemented (these were listed as out of scope or optional in the brief).

- The retry classification table is fixed in code (5xx, 429, 408,
  and network errors are retryable; other 4xx are terminal). It isn't configurable per event type.

- Delivery is at-least-once, not exactly-once. If my service sends a request and
  the receiver processes it but the response is lost before I see it (a timeout, for example),
  I'll retry it, and the receiver would see the same event twice.
  I didn't build anything (like a signed idempotency key passed to the receiver) to help the
  receiver de-duplicate on their end, since the brief says this isn't required,
  but a production version could include one so receivers have a way to detect a duplicate delivery.

- Fairness across clients works by discovering due work ordered by how long a client
  has been waiting, and round-robining a batch across whichever clients are found.
  It's not a strict mathematically fair scheduling algorithm (like weighted fair queuing),
  just a simple approach that avoids one client's backlog starving another's,
  which felt like the right amount of complexity for this project.

- Logging is plain structured `console.log` output, not a logging library,
  since a full logging setup felt like more than this project needs.

## Production and scale

If this needed to run in production or at meaningfully larger scale, 
here's what I'd change first, and why:

**Move to a real database server (Postgres).** 
SQLite's synchronous driver works fine for a single process at this scale, but it blocks 
the Node event loop on every query. Under real concurrent load, that would mean 
one slow database operation could delay unrelated incoming requests. 
Postgres with an async driver avoids that, plus gives native timestamp 
and JSON column types instead of the text-based workarounds I'm using now.

**Run multiple worker processes/instances.** 
Right now there's one process doing both ingestion and scheduling. 
At higher volume, I'd want to run the scheduler separately from the API, 
and run more than one scheduler worker, with the database (through row-level locking 
or a similar mechanism) making sure two workers can't claim the same event at once, 
the same way my current `WHERE status = 'pending'` claim check does within a single process.

**Isolate a badly-behaving endpoint.** 
Right now, if the one configured webhook URL is slow or down, it can still tie up delivery attempts. 
At higher scale, with more than one webhook subscriber, I'd want to make sure 
one consistently failing endpoint can't consume all the available delivery capacity 
meant for others (for example, with a per-endpoint concurrency limit or a circuit breaker that 
temporarily stops trying a clearly broken endpoint).

**Add real monitoring.** 
Right now the only visibility is structured console logs and the inspection endpoint. 
In production I'd want metrics on delivery success/failure rates, retry counts, 
how many events are sitting in a `failed` terminal state, and alerts if that number 
grows unexpectedly, since that would usually mean something is wrong on the receiver's side.

**Add an idempotency signal the receiver can use.** 
Since delivery is at-least-once, I'd want to send something like a delivery attempt ID or 
a signed header so the receiver has a reliable way to detect and ignore a duplicate 
delivery on their end, instead of only relying on my side to avoid creating duplicate 
delivery jobs.

## AI usage

I used **Claude Code** as an interactive thought partner and accelerator during development, 
while maintaining complete ownership of the system design and core implementation.

Specifically, AI was leveraged across three areas:

1. **Architecture & Edge Case Brainstorming:**
   I designed the overall four-layer architecture, data flow, and DB-level idempotency strategy first.
   I then used Claude Code to review the design for subtle edge cases. It pointed out that an
   unexpected process crash could leave active events stranded in the `delivering` state.
   I proposed the solution—running a database cleanup query on startup to reset any `delivering`
   events back to `pending`—and verified the approach before writing the recovery logic.

3. **Automated Testing Setup:**
   Since I had limited prior experience with Jest and faced a tight timeline,
   I relied on Claude Code to generate the initial test suite boilerplate and mock setups
   (e.g., in-memory SQLite and mocked `fetch`). I thoroughly reviewed, ran, and verified all
   generated tests against the acceptance criteria (`AC1`–`AC5`), fixing minor assertion discrepancies manually.

5. **Boilerplate Acceleration:**
   I used Claude Code to scaffold standard Express endpoint handlers and service class signatures to speed up setup.
   All business logic—including the fair round-robin multi-client batching (`selectFairBatch`), backoff strategy,
   and idempotency handling—was guided and validated by me.

## Credibility note

### Automated Fallback System for Kafka Consumers

- **The problem it solved:**
  In a high-throughput event architecture, Kafka consumers frequently encountered payload messages exceeding
  configured broker/consumer size limits. This caused consumers to hit a dead loop, halting stream processing.
  Resolving it required constant manual intervention: engineering teams had to manually skip the offending message
  offset and restart the consumer service 10–20 times per day.
  My solution completely eliminated this manual intervention of skipping messages and restarting the service.

- **Your personal contribution:**
  I designed and implemented an automated claim-check/queue-based fallback pattern to address the root cause:
  - **Producer Layer:**
      When a message payload exceeds or approaches size thresholds, the producer encrypts the payload, persists it
      to a MySQL database, and emits only a lightweight reference key (claim check) over Kafka.
  - **Consumer Layer:**
      The consumer reads the lightweight reference key (guaranteed to be within size limits), fetches
      the encrypted payload from MySQL, decrypts it, and processes it seamlessly without failing or getting stuck.

- **Scale or operational complexity involved:**
  The system eliminated 10 to 20 daily critical service restarts and manual offset jumps, achieving
  zero-downtime message consumption for oversized payloads across multiple consumer instances
  while maintaining message encryption standards end-to-end.

- **One difficult engineering or product decision:**
  - **Infrastructure Limits vs. Architecture Pattern:**
      Increasing Kafka’s `max.message.bytes` broker-wide was considered, but rejected because larger payload
      limits across all topics degrade broker memory performance and network throughput under concurrent load.
  - **Storage Lifecycle & Cleanup Strategy:**
      Deciding whether to keep processed messages in MySQL required balancing auditability against storage bloat.
      I implemented a time-to-live (TTL) auto-deletion strategy that purges database payloads after a set retention
      window while logging success status separately.

- **Evidence / Public link:**
  This was an internal core infrastructure service at Calfus Technologies, so source code and internal
    dashboards cannot be shared publicly. However, I can discuss the architecture, database schema design,
    and failure modes in detail.
