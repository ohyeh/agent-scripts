# Dispatch record

- Gate: `independent-context`; global guidance plus two installed skills and evals require isolated full-read, edit, and verification.
- Worker bound: two sequential `agent-tmux codex` workers, both explicitly requested by the user as `gpt-5.6-luna` at `max` effort (author, fresh reviewer).
- Native proxies exclusively own wrapper interaction.
- Approved external scope: commit, push to `main`, then invoke the repository deployment workflow. Remote hosts that cannot be reached remain `UNCONFIRMED`.
