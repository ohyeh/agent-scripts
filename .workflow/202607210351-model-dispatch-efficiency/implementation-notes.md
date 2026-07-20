# Implementation notes

- Defaulted repeated receipt behavior to re-emit only when criterion, model, acceptance, or deviation changes.
- Added the approved distinction between runtime/context reuse and explicit model authorization.
- Removed the Codex-only workflow block from global startup context so both runtime files are content-identical again.
- Codex uses Sol medium+ for commander/plan/review and Terra, CLI Luna, or external execution workers.
- Worker tier and effort are separate: Terra/Luna may scale effort through `max`; Sol reserves `xhigh` for major problems and uses `max` only rarely.
- When Sol is used as an execution worker, its effort is capped at `medium`; Sol `high+` is reserved for commander, plan, and review roles.
- `ultra` is forbidden.
