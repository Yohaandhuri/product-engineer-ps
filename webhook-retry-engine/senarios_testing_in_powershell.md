# Demo Video — Copy-Paste Commands (PowerShell-native)

Run these in **Terminal 3**.

---

## Setup (before recording, or as your opening shot)

```powershell
npm start
```

```powershell
npm run receiver
```

---

## AC1 — Successful delivery

```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="success"} | ConvertTo-Json)
```

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

*(wait ~2 seconds, let Terminal 1 logs settle)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_1
```

**Expect:** `status: delivered`, `attemptCount: 1`, one attempt with `outcome: success`.
To see the nested attempts array clearly, add: `| ConvertTo-Json -Depth 5`

---

## AC2 — Temporary failure, then retry succeeds

```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="fail_once"} | ConvertTo-Json)
```

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

*(optional — check right away to show it's still pending, one failed attempt)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_2 | ConvertTo-Json -Depth 5
```

**Expect (early check):** `status: pending`, `attemptCount: 1`, attempt outcome `failed_retryable`, httpStatus 503.

*(wait ~4-5 seconds more — backoff passes, retry fires)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_2 | ConvertTo-Json -Depth 5
```

**Expect (after retry):** `status: delivered`, `attemptCount: 2`, attempts show `failed_retryable` then `success`.

---

## AC3 — Terminal failure (non-retryable, stops immediately)

```powershell
Invoke-RestMethod -Uri http://localhost:4000/control/mode -Method Post -ContentType "application/json" -Body (@{mode="fail_terminal"} | ConvertTo-Json)
```

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

*(wait ~2 seconds)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_3 | ConvertTo-Json -Depth 5
```

**Expect:** `status: failed`, `attemptCount: 1`, one attempt with outcome `failed_terminal`, httpStatus 400.

*(optional — wait 5 more seconds and check again, to prove it stays at 1 attempt)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_3
```

**Expect (still):** `attemptCount: 1` — unchanged.

*(Narrate exhaustion/bounded-retry verbally here — don't run it live, it takes ~35s of real backoff time.)*

---

## AC4 — Idempotent ingestion

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

**Expect:** `duplicate: False` (PowerShell shows booleans capitalized).

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events -Method Post -ContentType "application/json" -Body $body4
```

**Expect:** `duplicate: True` — same eventId, no new event created.

*(wait ~2 seconds so delivery finishes)*

```powershell
Invoke-RestMethod -Uri http://localhost:3000/events/evt_demo_4 | ConvertTo-Json -Depth 5
```

**Expect:** `status: delivered`, `attemptCount: 1` — only one attempt despite two submissions.

---
