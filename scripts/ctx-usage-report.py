#!/usr/bin/env python3
import argparse
import glob
import json
import os
import re
import sqlite3
from collections import Counter
from datetime import datetime, timedelta


def known_skills():
    names = set()
    roots = [
        os.path.expanduser("~/.agents/skills"),
        os.path.expanduser("~/.codex/skills"),
        os.path.expanduser("~/.codex/plugins/cache"),
    ]
    for root in roots:
        if not os.path.exists(root):
            continue
        pattern = root + "/**/SKILL.md" if root.endswith("cache") else root + "/*/SKILL.md"
        for path in glob.glob(pattern, recursive=root.endswith("cache")):
            names.add(os.path.basename(os.path.dirname(path)))
            try:
                head = open(path, encoding="utf-8", errors="ignore").read(1000)
            except OSError:
                continue
            match = re.search(r"^name:\s*([^\n]+)", head, re.M)
            if match:
                names.add(match.group(1).strip())
    return {name for name in names if re.match(r"^[A-Za-z0-9_:-]+$", name)}


def open_ro(path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def print_counter(title, counter, limit, suffix=""):
    print(f"\n{title}")
    if not counter:
        print("    0  none")
        return
    for key, count in counter.most_common(limit):
        print(f"{count:5d}  {key}{suffix}")


def plugin_from_tool(tool_name):
    if tool_name.startswith("ctx_"):
        return "context-mode"
    if not tool_name.startswith("mcp__"):
        return None
    parts = tool_name.split("__")
    if len(parts) < 3:
        return None
    plugin = parts[1]
    if plugin == "context_mode":
        return "context-mode"
    if plugin == "computer_use":
        return "computer-use"
    if plugin == "codex_apps" and len(parts) >= 4:
        return f"codex_apps/{parts[2]}"
    return plugin


def infer_agent(project_dir, session_text):
    haystack = f"{project_dir or ''}\n{session_text}".lower()
    codex_score = haystack.count("codex") + haystack.count("/.codex/")
    claude_score = haystack.count("claude") + haystack.count("/.claude/")
    if codex_score > claude_score and codex_score:
        return "codex"
    if claude_score > codex_score and claude_score:
        return "claude"
    return "unknown"


def parse_datetime(value, end_of_day=False):
    if not value:
        return None
    formats = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            if fmt == "%Y-%m-%d" and end_of_day:
                return parsed + timedelta(days=1)
            return parsed
        except ValueError:
            pass
    raise argparse.ArgumentTypeError(f"invalid date: {value}")


def main():
    parser = argparse.ArgumentParser(description="Read-only context-mode usage report")
    parser.add_argument(
        "--sessions-dir",
        action="append",
        help="Context-mode sessions directory. Can be passed multiple times.",
    )
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--project", help="Substring filter for project_dir")
    parser.add_argument("--agent", choices=["all", "codex", "claude", "unknown"], default="all")
    parser.add_argument("--sessions", action="store_true", help="Print per-session rows")
    parser.add_argument("--since", help="Only sessions started on/after this date, e.g. 2026-07-01")
    parser.add_argument("--until", help="Only sessions started before this date boundary. YYYY-MM-DD includes that whole day.")
    parser.add_argument("--days", type=int, help="Only sessions from the last N days")
    args = parser.parse_args()
    if args.days is not None and args.since:
        parser.error("--days and --since are mutually exclusive")

    since = parse_datetime(args.since) if args.since else None
    until = parse_datetime(args.until, end_of_day=True) if args.until else None
    if args.days is not None:
        since = datetime.now() - timedelta(days=args.days)

    session_dirs = args.sessions_dir or [
        "~/.codex/context-mode/sessions",
        "~/.claude/context-mode/sessions",
    ]
    session_dirs = [os.path.expanduser(path) for path in session_dirs]
    dbs = []
    for sessions_dir in session_dirs:
        dbs.extend(glob.glob(os.path.join(sessions_dir, "*.db")))
    skills_allowlist = known_skills()

    tools = Counter()
    tool_bytes = Counter()
    plugins = Counter()
    explicit_skills = Counter()
    captured_skills = Counter()
    dynamic_workflows = Counter()
    project_workflows = Counter()
    projects = Counter()
    errors_by_project = Counter()
    blockers_by_project = Counter()
    error_markers = Counter()
    blocker_markers = Counter()
    sessions = set()
    seen_session_ids = set()
    session_agents = {}
    session_rows = []
    events = 0
    duplicate_sessions = 0

    for db in dbs:
        try:
            con = open_ro(db)
            cur = con.cursor()
        except sqlite3.Error:
            continue

        session_text = {}
        for session_id, data in cur.execute("select session_id, data from session_events"):
            if data:
                session_text.setdefault(session_id, [])
                if len(session_text[session_id]) < 4000:
                    session_text[session_id].append(data[:1000])

        project_session_ids = set()
        for session_id, project_dir, started_at, last_event_at, event_count, compact_count in cur.execute(
            "select session_id, project_dir, started_at, last_event_at, event_count, compact_count from session_meta"
        ):
            if args.project and args.project not in (project_dir or ""):
                continue
            started = parse_datetime(started_at) if started_at else None
            if since and (not started or started < since):
                continue
            if until and (not started or started >= until):
                continue
            agent = infer_agent(project_dir, "\n".join(session_text.get(session_id, [])))
            if args.agent != "all" and agent != args.agent:
                continue
            if session_id in seen_session_ids:
                duplicate_sessions += 1
                continue
            seen_session_ids.add(session_id)
            session_agents[session_id] = agent
            project_session_ids.add(session_id)
            session_rows.append(
                (started_at, last_event_at, agent, event_count or 0, compact_count or 0, project_dir or "(unknown)", session_id)
            )

        for session_id, tool_name, calls, bytes_returned in cur.execute(
            "select session_id, tool, calls, bytes_returned from tool_calls"
        ):
            if session_id not in project_session_ids:
                continue
            plugin = plugin_from_tool(tool_name)
            if plugin:
                plugins[plugin] += calls or 0
            tools[tool_name] += calls or 0
            tool_bytes[tool_name] += bytes_returned or 0

        for session_id, project_dir in cur.execute("select session_id, project_dir from session_meta"):
            if session_id not in project_session_ids:
                continue
            sessions.add(session_id)
            projects[project_dir or "(unknown)"] += 1

        for session_id, typ, category, data, project_dir in cur.execute(
            "select session_id, type, category, data, project_dir from session_events"
        ):
            if session_id not in project_session_ids:
                continue
            events += 1
            text = data or ""

            if category == "error":
                errors_by_project[project_dir or "(unknown)"] += 1
                for marker in [
                    "FAIL",
                    "Error",
                    "Exception",
                    "timeout",
                    "test",
                    "analyze",
                    "flutter",
                    "fastlane",
                    "adb",
                    "WDA",
                    "denied",
                    "403",
                    "404",
                ]:
                    if re.search(marker, text, re.I):
                        error_markers[marker] += 1

            if category == "blocked-on":
                blockers_by_project[project_dir or "(unknown)"] += 1
                for marker in [
                    "token",
                    "github",
                    "result.json",
                    "WDA",
                    "device",
                    "access",
                    "permission",
                    "agreement",
                    "login",
                ]:
                    if re.search(marker, text, re.I):
                        blocker_markers[marker] += 1

            if not text:
                continue

            if category == "user-prompt":
                candidates = re.findall(r"\$([A-Za-z0-9_:-]+)\b", text)
                candidates += re.findall(r"<name>([A-Za-z0-9_:-]+)</name>", text)
                for candidate in candidates:
                    if candidate in skills_allowlist:
                        explicit_skills[candidate] += 1

            if typ not in {"rule", "rule_content"}:
                candidates = re.findall(r"\$([A-Za-z0-9_:-]+)\b", text)
                candidates += re.findall(r"<name>([A-Za-z0-9_:-]+)</name>", text)
                candidates += re.findall(r"(?:^|/)skills/([A-Za-z0-9_:-]+)/SKILL\.md", text)
                candidates += re.findall(r"\.agents/skills/([A-Za-z0-9_:-]+)/", text)
                for candidate in candidates:
                    if candidate in skills_allowlist:
                        captured_skills[candidate] += 1

            for match in re.finditer(
                r"(?:~?/)?\.agents/workflows/recipes/([A-Za-z0-9_-]+)\.workflow\.js"
                r"|recipes/([A-Za-z0-9_-]+)\.workflow\.js"
                r"|Workflow\(\{[^}]*?name[\"']?\s*[:=]\s*[\"']([A-Za-z0-9_-]+)",
                text,
            ):
                dynamic_workflows[next(group for group in match.groups() if group)] += 1

            for match in re.finditer(r"\.workflow/([A-Za-z0-9_./-]+)", text):
                workflow = match.group(1).split()[0].strip("`\"',)")
                root = workflow.split("/")[0]
                if root and root not in {".", ".."}:
                    project_workflows[root] += 1

        con.close()

    print(f"Scope: {len(dbs)} db files, {len(sessions)} sessions, {events} events")
    if duplicate_sessions:
        print(f"Skipped duplicate sessions: {duplicate_sessions}")
    print("Session dirs:")
    for sessions_dir in session_dirs:
        print(f"  - {sessions_dir}")
    if args.project:
        print(f"Project filter: {args.project}")
    if args.agent != "all":
        print(f"Agent filter: {args.agent}")
    if since:
        print(f"Since: {since.strftime('%Y-%m-%d %H:%M:%S')}")
    if until:
        inclusive_until = until - timedelta(seconds=1)
        print(f"Until: {inclusive_until.strftime('%Y-%m-%d %H:%M:%S')}")

    print("\nTool usage")
    for name, count in tools.most_common(args.limit):
        print(f"{count:5d}  {tool_bytes[name]:10d} bytes  {name}")

    print_counter("Plugin usage inferred from tool_calls", plugins, args.limit)
    print_counter("Explicit user-invoked skills", explicit_skills, args.limit)
    print_counter("Captured skill mentions", captured_skills, args.limit)
    print_counter("Dynamic workflow recipes", dynamic_workflows, args.limit)
    print_counter("Project .workflow families", project_workflows, args.limit)
    print_counter("Sessions by project", projects, args.limit)
    print_counter("Errors by project", errors_by_project, args.limit)
    print_counter("Error markers", error_markers, args.limit)
    print_counter("Blockers by project", blockers_by_project, args.limit)
    print_counter("Blocker markers", blocker_markers, args.limit)

    print_counter("Sessions by inferred agent", Counter(session_agents[sid] for sid in sessions), args.limit)

    if args.sessions:
        print("\nSessions")
        for started_at, last_event_at, agent, event_count, compact_count, project_dir, session_id in sorted(session_rows, reverse=True)[: args.limit]:
            print(
                f"{started_at or '?'}  {agent:7s}  events={event_count:4d}  compact={compact_count:2d}  {session_id}  {project_dir}"
            )


if __name__ == "__main__":
    main()
