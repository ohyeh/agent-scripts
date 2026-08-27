#!/usr/bin/env bash
# Shared normalizer: text on stdin → fixed-shape evidence tokens, one per line,
# unique, max 20. Used by context-ledger.sh (on tool output) and
# claim-evidence-gate.sh (on the model's reply) so a claim is bound to what a
# tool actually printed by TOKEN EQUALITY, not substring luck.
#
# Only fixed shapes are emitted — never surrounding context — so the ledger
# can carry these without becoming a secrets surface (it stores sha256 of
# inputs for the same reason).
set -u
tr -d '\r' \
| grep -oE 'exit[ =:]*(code[ =:]*)?[0-9]+|[0-9]+/[0-9]+ passed|[0-9]+ (tests? )?passed|DEPLOY OK|VERDICT: *(PASS|BLOCK)|(^|[^A-Za-z])PASS([^A-Za-z]|$)|No issues found|All tests passed' 2>/dev/null \
| sed -E 's/^exit[ =:]*(code[ =:]*)?([0-9]+)$/exit=\2/; s/^([0-9]+) tests? passed$/\1 passed/; s/^VERDICT: *(PASS|BLOCK)$/VERDICT: \1/; s/^[^A-Za-z]?PASS[^A-Za-z]?$/PASS/' \
| sort -u | head -20
exit 0
