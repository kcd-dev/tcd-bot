#!/bin/zsh
set -euo pipefail
# Not the TCD entry. Copies official Cursor tokens into the Intel reconstructed
# profile and will collide with grok-bot-tcd / official Grok Bot. Use
# scripts/launch-mason1-computer.sh for TCD.
APP="${GROK_BOT_INTEL_APP:-/Applications/Grok Bot 0.18 Reconstructed Intel.app}"
UD="${GROK_BOT_INTEL_USER_DATA:-$HOME/Library/Application Support/Grok Bot Reconstructed Intel}"
OFF="${GROK_BOT_OFFICIAL_USER_DATA:-$HOME/Library/Application Support/Grok Bot}"
mkdir -p "$UD"

# reuse official multi-account tokens flattened for 0.18 top-level secret keys
if [[ -f "$OFF/sand-secrets.json" ]]; then
  node -e '
const fs=require("fs");
const off=process.argv[1], ud=process.argv[2];
const src=JSON.parse(fs.readFileSync(off,"utf8"));
let next={...src};
try {
  const accounts=JSON.parse(src["cursor-accounts"]||"{}");
  const acct=accounts.accounts?.[accounts.active];
  if (acct?.["cursor-access-token"] && acct?.["cursor-refresh-token"]) {
    next["cursor-access-token"]=acct["cursor-access-token"];
    next["cursor-refresh-token"]=acct["cursor-refresh-token"];
  }
} catch {}
fs.writeFileSync(ud+"/sand-secrets.json", JSON.stringify(next,null,2));
console.log("auth secrets synced");
' "$OFF/sand-secrets.json" "$UD"
fi

# clear stale locks
for f in SingletonLock SingletonCookie SingletonSocket; do
  [[ -e "$UD/$f" ]] && mv "$UD/$f" "/tmp/gb-$f-$$" 2>/dev/null || true
done

nohup "$APP/Contents/MacOS/Grok Bot" --user-data-dir="$UD" >/tmp/gb-intel-out.log 2>/tmp/gb-intel-err.log &
echo "launched pid $!  app=$APP  ud=$UD"
