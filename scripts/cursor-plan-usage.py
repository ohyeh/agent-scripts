#!/usr/bin/env python3
"""Inject Cursor plan usage into a statusline JSON payload.

Claude Code already sends rate_limits on stdin; this is a no-op in that case.
Cursor CLI does not, so we fill rate_limits.model_scoped from GetCurrentPeriodUsage:
plan (totalPercentUsed), auto (autoPercentUsed), api (apiPercentUsed).

Cache (~/.cursor/statusline-usage-cache.json) stores percents + reset time only.
The access token is read from the macOS keychain (or Cursor IDE state.vscdb)
only on refresh and is never written to disk.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CACHE_PATH = Path.home() / ".cursor" / "statusline-usage-cache.json"
CACHE_TTL_MS = 60_000
CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000
FETCH_TIMEOUT_S = 1.8
USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage"


def clamp_display_percent(raw: float) -> int:
    """Match CLI /usage: (0, 1) shows as 1%; otherwise round to 0–100."""
    if not isinstance(raw, (int, float)) or raw != raw:  # NaN
        return 0
    if 0 < raw < 1:
        return 1
    return max(0, min(100, int(round(raw))))


def iso_from_millis(ms: object) -> str | None:
    if isinstance(ms, str) and ms.strip():
        try:
            ms = float(ms.strip())
        except ValueError:
            return None
    if not isinstance(ms, (int, float)) or ms <= 0:
        return None
    millis = float(ms)
    if millis < 1e12:
        millis *= 1000
    try:
        return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except (OSError, OverflowError, ValueError):
        return None


def read_cache() -> dict | None:
    try:
        data = json.loads(CACHE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    percent = data.get("percent")
    fetched_at = data.get("fetchedAt")
    auto = data.get("auto")
    api = data.get("api")
    if not isinstance(percent, (int, float)) or not isinstance(fetched_at, (int, float)):
        return None
    if not isinstance(auto, (int, float)) or not isinstance(api, (int, float)):
        return None
    return {
        "percent": clamp_display_percent(percent),
        "auto": clamp_display_percent(auto),
        "api": clamp_display_percent(api),
        "fetchedAt": int(fetched_at),
        "resets_at": data.get("resets_at") if isinstance(data.get("resets_at"), str) else None,
    }


def write_cache(usage: dict) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "percent": usage["percent"],
            "auto": usage["auto"],
            "api": usage["api"],
            "fetchedAt": int(time.time() * 1000),
        }
        if usage.get("resets_at"):
            payload["resets_at"] = usage["resets_at"]
        CACHE_PATH.write_text(json.dumps(payload))
    except OSError:
        pass


def keychain_token() -> str:
    if sys.platform != "darwin":
        return ""
    try:
        out = subprocess.check_output(
            [
                "security",
                "find-generic-password",
                "-s",
                "cursor-access-token",
                "-a",
                "cursor-user",
                "-w",
            ],
            stderr=subprocess.DEVNULL,
            timeout=2,
            text=True,
        )
        return out.strip()
    except (subprocess.SubprocessError, OSError):
        return ""


def vscdb_paths() -> list[Path]:
    home = Path.home()
    paths: list[Path] = []
    if sys.platform == "darwin":
        paths.append(
            home
            / "Library/Application Support/Cursor/User/globalStorage/state.vscdb"
        )
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            paths.append(
                Path(appdata) / "Cursor/User/globalStorage/state.vscdb"
            )
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME", str(home / ".config"))
        paths.append(Path(xdg) / "Cursor/User/globalStorage/state.vscdb")
    return paths


def vscdb_token() -> str:
    for db_path in vscdb_paths():
        if not db_path.is_file():
            continue
        try:
            con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            try:
                row = con.execute(
                    "SELECT value FROM ItemTable WHERE key = ?",
                    ("cursorAuth/accessToken",),
                ).fetchone()
            finally:
                con.close()
        except sqlite3.Error:
            continue
        if row and row[0]:
            value = row[0]
            return value.decode() if isinstance(value, bytes) else str(value)
    return ""


def access_token() -> str:
    return keychain_token() or vscdb_token()


def bucket_percent(plan: dict, key: str) -> int | None:
    raw = plan.get(key)
    if isinstance(raw, (int, float)):
        return clamp_display_percent(raw)
    return None


def fetch_plan_usage(token: str) -> dict | None:
    if not token:
        return None
    req = urllib.request.Request(
        USAGE_URL,
        data=b"{}",
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
            "User-Agent": "cursor-statusline/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
            body = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(body, dict):
        return None
    plan = body.get("planUsage")
    if not isinstance(plan, dict):
        return None
    total = bucket_percent(plan, "totalPercentUsed")
    if total is None:
        used = plan.get("includedSpend", plan.get("totalSpend"))
        limit = plan.get("limit")
        if isinstance(used, (int, float)) and isinstance(limit, (int, float)) and limit > 0:
            total = clamp_display_percent((used / limit) * 100)
        else:
            return None
    auto = bucket_percent(plan, "autoPercentUsed")
    api = bucket_percent(plan, "apiPercentUsed")
    if auto is None or api is None:
        return None
    return {
        "percent": total,
        "auto": auto,
        "api": api,
        "resets_at": iso_from_millis(body.get("billingCycleEnd")),
    }


def spawn_refresh() -> None:
    try:
        subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--refresh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError:
        pass


def refresh_cache() -> dict | None:
    fetched = fetch_plan_usage(access_token())
    if fetched is None:
        return None
    write_cache(fetched)
    fetched["fetchedAt"] = int(time.time() * 1000)
    return fetched


def get_plan_usage() -> dict | None:
    cached = read_cache()
    now = int(time.time() * 1000)
    if cached and now - cached["fetchedAt"] < CACHE_TTL_MS:
        return cached
    if cached and now - cached["fetchedAt"] < CACHE_MAX_STALE_MS:
        spawn_refresh()
        return cached
    return refresh_cache()


def scoped_window(name: str, percent: int, resets_at: str | None) -> dict:
    window = {"display_name": name, "utilization": percent}
    if resets_at:
        window["resets_at"] = resets_at
    return window


def inject(payload: dict, usage: dict) -> dict:
    resets_at = usage.get("resets_at") if isinstance(usage.get("resets_at"), str) else None
    payload["rate_limits"] = {
        "model_scoped": [
            scoped_window("plan", usage["percent"], resets_at),
            scoped_window("auto", usage["auto"], resets_at),
            scoped_window("api", usage["api"], resets_at),
        ]
    }
    return payload


def main() -> int:
    if "--refresh" in sys.argv:
        return 0 if refresh_cache() is not None else 1

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        sys.stdout.write(raw)
        return 0
    if not isinstance(payload, dict):
        sys.stdout.write(raw)
        return 0
    if payload.get("rate_limits"):
        json.dump(payload, sys.stdout, separators=(",", ":"))
        return 0
    usage = get_plan_usage()
    if usage is not None:
        payload = inject(payload, usage)
    json.dump(payload, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
