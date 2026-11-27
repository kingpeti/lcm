---
"@lossless-claude/lcm": patch
---

The daemon log now gets a `request.aborted` record for a `/prompt-search` or `/restore` whose client disconnected before the answer, as it already did for `/ingest`. Their hooks wait for the answer, so each record is a hook that gave up at its own timeout and never got the hints or context it asked for. That covers the command hooks, the Codex hooks and the OMP extension, which close the connection when they time out. The function-hooks module does not close it, so its timeouts still end in an ordinary `request` record once the answer comes. Fire-and-forget routes are still not logged this way.
