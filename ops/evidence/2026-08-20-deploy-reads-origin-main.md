# deploy.sh deploys origin/main, not the working tree

Two observations, both `deploy exit=0` with the script's own
`PASS [rules] 0 diff`, followed by an external `diff -rq` showing the
just-edited file stale in `~/.agents/rules/`:

1. `session-titles.md` — edited, deployed, not yet committed.
2. `lessons.md` — edited, deployed, not yet committed.

Control: two consecutive deploys on the unchanged, already-pushed tree at
`58a7251` both reached IN_SYNC with matching md5
`7ef5fcd3d5abc384e910590eba7e7e45`. The peer host also did not reproduce.
A race would not distinguish these cases; the source of the deploy does.

## Mechanism (scripts/deploy.sh)

    36  DEPLOYED_SHA="$(git ls-remote "$REPO_GIT_URL" "$RELEASE_REF" | cut -f1)"
    41  REPO_TARBALL_URL=".../archive/${DEPLOYED_SHA}.tar.gz"
    47  curl -fsSL "$REPO_TARBALL_URL" | tar xz -C "$WORKDIR"
    48  SRC="$WORKDIR/agent-scripts-$DEPLOYED_SHA"
    80  rsync -a --delete "$SRC/.agents/rules/" ~/.agents/rules/
    81  rules_diff="$(diff -rq ~/.agents/rules/ "$SRC/.agents/rules/" || true)"

`RELEASE_REF=refs/heads/main`. The internal assertion at line 81 compares the
rsync destination against the rsync source, so it verifies that rsync worked,
never that runtime matches local intent. It passes by construction.

## Consequence

`deploy exit=0` means "origin/main was deployed". Uncommitted or unpushed work
cannot reach runtime through it. The only evidence that runtime carries the
intended content is an external `diff -rq .agents/rules ~/.agents/rules` run
after push and deploy.
