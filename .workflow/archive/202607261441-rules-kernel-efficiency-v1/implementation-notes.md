# Implementation Notes

- The v1 optimization target is semantic depth: a small, strong startup
  interface backed by routed implementation, not a fixed token-reduction quota.
- Ledger storage remains outside this patch until the user chooses
  `local-only` or `tracked-but-redacted`.
- The global and dispatch semantic edits are proposal-only until the
  maintenance gate receives exact-diff approval.
- `deploy.sh` now resolves `refs/heads/main` once and downloads the archive by
  that immutable SHA; it does not deploy during verification.
- Router adoption now filters candidate files explicitly: only grep rc=1
  becomes zero-match; find errors and grep rc>1 remain fatal. An empty-history
  regression covers both runtimes.
- The first independent review blocked the patch because the initial router
  pipeline still failed on empty histories, the deploy invariant was only
  static, two fixture labels were natural-language assertions, and the
  dispatch proposal cited the wrong section. All four findings were corrected;
  a second fresh review is pending.
- The deploy invariant now sources the real resolution/download functions with
  stubbed git/curl/tar and asserts the observed request URL and archive root.
- Four minimal fixture files cover positive/negative routing for
  `model-dispatch` and `judgment-rubrics`. Static schema validation is live;
  behavioral execution remains explicitly unimplemented.
- Exact proposal artifacts:
  - `global.proposed.patch`
  - `model-dispatch.proposed.patch`
- The fresh reviewer spawned an unauthorized child despite the dispatch
  contract. The child was interrupted; the reviewer was instructed to
  reproduce any useful observation independently and finish without delegation.
- Independent rereview after the four fixes found no P0–P2 issues and ended
  `VERDICT: PASS`.
- User approved the exact proposals with two final rulings: make the
  wrong-direction gate action-triggered to avoid a load-order deadlock, and
  retain the `V=0/1/2/3` compatibility mapping.
- After applying the canonical files, `check-canary.sh` exposed narrowed golden
  wording. The full every-reply `codeword` canary contract and reload signal
  were restored before final verification.
- Final independent read-back found no P0–P2 issues and ended `VERDICT: PASS`;
  invariants passed 22/22 with canonical files applied.
