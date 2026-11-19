#!/usr/bin/env bash
# Self-check for check_artifacts in skills/session-handoff/scripts/validate_handoff.py:
# a handoff must list its products (Artifact pages, .md, memory, run dirs) with must-read marks.
cd "$(dirname "$0")/.." || exit 1
python3 -I - "$PWD/skills/session-handoff/scripts" <<'EOF'
import sys
sys.path.insert(0, sys.argv[1])
from validate_handoff import check_artifacts
cases = [
    ("no section", "## Timeline\nx\n", False),
    ("empty section", "## Artifacts\n\n## Related Resources\n- a\n", False),
    ("template row", "## Artifacts\n- [path or URL] · [artifact | md] · must-read: [yes | no]\n", False),
    ("row without mark", "## Artifacts\n- .workflow/x/report.md · md\n", False),
    ("filled md row", "## Artifacts\n- .workflow/x/report.md · md · must-read: yes · findings\n", True),
    ("artifact url", "## Artifacts\n- https://claude.ai/artifact/abc · artifact · must-read: no\n", True),
    ("none template line", "## Artifacts\n- none · [reason] (only when the session made no product)\n", False),
    ("next H2 after blank", "## Artifacts\n\n## Next\n- a.md · md · must-read: yes\n", False),
    ("valid plus invalid", "## Artifacts\n- a.md · md · must-read: yes\n- b.md · md\n", False),
    ("angle placeholder", "## Artifacts\n- <path or URL> · md · must-read: yes\n", False),
    ("none angle reason", "## Artifacts\n- none · <reason>\n", False),
    ("none plus a row", "## Artifacts\n- none · x\n- a.md · md · must-read: yes\n", False),
    ("closing hashes", "## Artifacts ##\n- a.md · md · must-read: no · notes\n", True),
    ("subsection rows", "## Artifacts\n### Pages\n- https://x/y · artifact · must-read: yes\n", True),
    ("markdown link path", "## Artifacts\n- [report](https://x/y) · artifact · must-read: yes\n", True),
    ("autolink path", "## Artifacts\n- <https://x/y> · artifact · must-read: no\n", True),
    ("capital None", "## Artifacts\n- None · read-only session\n", True),
    ("TODO scaffold row", "## Artifacts\n- [TODO: x] · md · must-read: yes\n", False),
    ("row only in fence", "## Artifacts\n```\n- a.md · md · must-read: yes\n```\n## Related Resources\n", False),
    ("heading in fence", "```\n## Artifacts\n- a.md · md · must-read: yes\n```\n", False),
    ("fence plus real row", "## Artifacts\n```\n- x\n```\n- a.md · md · must-read: yes\n", True),
    ("fake closing fence", "## Artifacts\n```\n```md\n- a.md · md · must-read: yes\n```\n", False),
    ("unclosed fence", "## Artifacts\n```\n- a.md · md · must-read: yes\n", False),
    ("none dot reason", "## Artifacts\n- none · .\n", False),
    ("none with reason", "## Artifacts\n- none · read-only Q&A session\n## Next\n", True),
]
fail = 0
for name, text, ok in cases:
    got = not check_artifacts(text)
    print(("ok  " if got == ok else "FAIL"), f"{name:18} want={ok} got={got}")
    fail |= got != ok
sys.exit(fail)
EOF
