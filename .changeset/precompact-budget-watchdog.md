---
"@lossless-claude/lcm": patch
---

PreCompact's reply budget now holds when the estimate misses. A summary still running 3 s before `reply_budget_ms` ends is answered 202 with `summaryOutcome: { status: "deferred", reason: "budget-expired" }` after the session is marked for the restore that follows, and keeps compacting after the reply, instead of running into the hook deadline the host enforces. The over-budget `precompact.deferred` record now carries `reason: "over-budget"` too, a request logs one such record, and a `reply_budget_ms` above 2147483647 is answered 400, since Node fires a longer timer at once.
