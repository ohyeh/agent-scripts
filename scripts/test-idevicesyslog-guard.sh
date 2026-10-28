#!/usr/bin/env bash
# The idevicesyslog guard caps streams on a listed fragile device and passes others.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export HOME="$T/home"; mkdir -p "$HOME/.config/agent-device" "$T/bin" "$T/alias"
GUARD="$ROOT/.agents/bin/idevicesyslog"
RT="$(command -v timeout)"   # the real one, before the fake below shadows it
# Fakes: real binary prints its args; timeout marks the cap; idevice_id lists one USB and one network phone.
printf '#!/bin/sh\necho "REAL $*"\n' > "$T/bin/real-syslog"
printf '#!/bin/sh\nwhile [ "${1#-}" != "$1" ]; do [ "$1" = -k ] && shift; shift; done\necho "TIMEOUT $1"; shift; exec "$@"\n' > "$T/bin/timeout"
printf '#!/bin/sh\n[ "$1" = -n ] && echo NETPHONE || echo USBPHONE\n' > "$T/bin/idevice_id"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" IDEVICESYSLOG_REAL="$T/bin/real-syslog"
fail() { echo "FAIL: $*" >&2; exit 1; }
first() { "$GUARD" "$@" 2>/dev/null | head -1; }

[ "$(first -u FRAGILE01)" = "REAL -u FRAGILE01" ] || fail "no list must pass through"
printf '# lab phones\nFRAGILE01\n  NETPHONE  \n' > "$HOME/.config/agent-device/fragile-devices"

capped() { [ "$(first "$@")" = "TIMEOUT 60" ] || fail "fragile stream not capped: $*"; }
passed() { case "$(first "$@")" in REAL*) ;; *) fail "should pass through: $*" ;; esac; }
capped -u FRAGILE01; capped --udid FRAGILE01; capped --udid=FRAGILE01; capped -uFRAGILE01
capped -nuFRAGILE01; capped -x -m foo -u FRAGILE01 --no-colors; capped -u OTHERPHONE -u FRAGILE01
capped -n; capped --network -x
capped --udi=FRAGILE01; capped --ud FRAGILE01; capped --net   # getopt_long unique prefixes
passed --mat -uFRAGILE01   # --mat = --match, which takes -uFRAGILE01 as its value
# macOS /bin/bash 3.2 with set -u: an empty pin array must not abort the stream
if [ -x /bin/bash ]; then
  out="$(/bin/bash "$GUARD" -u FRAGILE01 2>/dev/null | head -1)"
  [ "$out" = "TIMEOUT 60" ] || fail "/bin/bash run broke: $out"
fi
capped -u FRAGILE01 -m -u   # -m takes "-u" as its value, so FRAGILE01 stays the target
passed -u OTHERPHONE; passed -u FRAGILE010; passed -u FRAGILE01 --udid=OTHERPHONE
passed -m -uFRAGILE01; passed; passed -u FRAGILE01 archive out.tar; passed pidlist -u FRAGILE01; passed --help -u FRAGILE01
# no -u: the chosen default device is pinned so the real tool cannot pick another one
[ "$("$GUARD" -n 2>/dev/null | tail -1)" = "REAL -u NETPHONE -n" ] || fail "network default not pinned"
"$GUARD" -u FRAGILE01 2>&1 >/dev/null | grep -q 'stops after 60 s' || fail "cap notice missing on stderr"
# reached through a symlink alias first in PATH: no self re-entry
ln -s "$GUARD" "$T/alias/idevicesyslog"
out="$(PATH="$T/alias:$ROOT/.agents/bin:$T/bin:/usr/bin:/bin" IDEVICESYSLOG_REAL= "$RT" 5 "$T/alias/idevicesyslog" --help 2>&1 | head -1 || true)"
case "$out" in *"no real idevicesyslog"*|Usage*) ;; *) fail "symlink alias re-entered itself: $out" ;; esac
echo "idevicesyslog guard: fragile streams capped at 60 s (getopt forms, network default pinned); others, archive, pidlist, help pass"
