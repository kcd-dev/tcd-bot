#!/bin/zsh
set -euo pipefail
APP="${GROK_BOT_INTEL_APP:-/Applications/grok-bot-tcd.app}"
UD="${GROK_BOT_INTEL_USER_DATA:-$HOME/Library/Application Support/Grok Bot Reconstructed Intel}"
OFF="${GROK_BOT_OFFICIAL_USER_DATA:-$HOME/Library/Application Support/Grok Bot}"
SSH_HOST="${GROK_BOT_COMPUTER_SSH:-mason1}"
PORTS=(1340 1337 1339 6080 6081 8790)

mkdir -p "$UD"

# Isolate from official Grok Bot: never copy its sand-secrets into TCD userData.
if python3 -c 'import os,sys; sys.exit(0 if any("/Applications/Grok Bot.app/Contents/MacOS/Grok Bot" in line and "Helper" not in line for line in os.popen("ps -ax -o command=")) else 1)'; then
  echo "WARN: official Grok Bot.app is running. Quit it if Computer/gateway ports clash (1340/1337/6080)." >&2
fi

# ensure local-docker runtime + openrouter/ChainFuel defaults
mkdir -p "$UD/sand-data"
node -e '
const fs=require("fs");
const p=process.argv[1];
let j={};
try { j=JSON.parse(fs.readFileSync(p,"utf8")); } catch {}
j.boxRuntime="local-docker";
j.inferenceProvider=j.inferenceProvider||"openrouter";
if (!j.agentDefaultModel) j.agentDefaultModel={modelId:"grok-4.6",maxMode:false,parameters:[]};
fs.writeFileSync(p, JSON.stringify(j,null,2));
' "$UD/sand-data/settings.json"

# local Cursor-login bypass JWT so openrouter does not show Sign in
node -e '
const fs=require("fs"); const p=process.argv[1];
let sec={}; try { sec=JSON.parse(fs.readFileSync(p,"utf8")); } catch {}
const already=typeof sec["cursor-access-token"]==="string" && sec["cursor-access-token"].startsWith("plaintext:v1:");
if (!already) {
  const b64u=buf=>Buffer.from(buf).toString("base64url");
  const jwt=[b64u("{\"alg\":\"none\",\"typ\":\"JWT\"}"), b64u(JSON.stringify({sub:"local-openrouter",email:"openrouter@local",exp:Math.floor(Date.now()/1000)+86400*3650})), "local"].join(".");
  const stored="plaintext:v1:"+Buffer.from(jwt).toString("base64");
  sec["cursor-access-token"]=stored;
  sec["cursor-refresh-token"]=stored;
  fs.writeFileSync(p, JSON.stringify(sec,null,2));
}
' "$UD/sand-secrets.json" || true

# merge OPENROUTER_API_KEY from tcd-inference.env into sand-secrets
if [[ -f "$UD/sand-data/tcd-inference.env" ]]; then
  node -e '
const fs=require("fs");
const envPath=process.argv[1], secPath=process.argv[2];
const envText=fs.readFileSync(envPath,"utf8");
const key=(envText.match(/OPENROUTER_API_KEY=["'\'']?([^"'\''\n]+)/)||[])[1];
if (!key) process.exit(0);
let sec={};
try { sec=JSON.parse(fs.readFileSync(secPath,"utf8")); } catch {}
sec.OPENROUTER_API_KEY=key;
fs.writeFileSync(secPath, JSON.stringify(sec,null,2));
' "$UD/sand-data/tcd-inference.env" "$UD/sand-secrets.json" || true
fi

# pull token from mason1
ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_HOST" 'cat ~/grok-bot-computer/local-docker-vm.json' > "$UD/sand-data/local-docker-vm.json"
# ensure container up
ssh -o BatchMode=yes "$SSH_HOST" 'docker start grok-bot-local-vm >/dev/null 2>&1 || true; docker ps --filter name=grok-bot-local-vm --format "{{.Status}}"'

# kill stale tunnels on same ports
for p in $PORTS; do
  old=$(lsof -tiTCP:$p -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${old:-}" ]]; then
    # only kill if it is ssh
    for pid in $=old; do
      cmd=$(ps -p $pid -o command= 2>/dev/null || true)
      if [[ "$cmd" == *ssh* ]]; then kill $pid 2>/dev/null || true; fi
    done
  fi
done

FWD=()
for p in $PORTS; do FWD+=(-L "${p}:127.0.0.1:${p}"); done
# background tunnel
nohup ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  "${FWD[@]}" "$SSH_HOST" >/tmp/grok-bot-mason1-tunnel.log 2>&1 &
echo "tunnel_pid=$!"
sleep 3
TOKEN=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).token)' "$UD/sand-data/local-docker-vm.json")
code=000
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H "authorization: Bearer $TOKEN" http://127.0.0.1:1340/health || true)
  echo "local_health_try=$i code=$code"
  [[ "$code" == "200" ]] && break
  sleep 1
done
if [[ "$code" != "200" ]]; then
  echo "tunnel/health failed; see /tmp/grok-bot-mason1-tunnel.log" >&2
  cat /tmp/grok-bot-mason1-tunnel.log >&2 || true
  exit 1
fi

# clear locks
for f in SingletonLock SingletonCookie SingletonSocket; do
  [[ -e "$UD/$f" ]] && mv "$UD/$f" "/tmp/gb-$f-$$" 2>/dev/null || true
done

# TCD ChainFuel inference — skip Cursor Sign in when using openrouter
export SAND_SKIP_CURSOR_AUTH=1
if [[ -f "$UD/sand-data/tcd-inference.env" ]]; then
  # shellcheck disable=SC1090
  source "$UD/sand-data/tcd-inference.env"
fi
nohup "$APP/Contents/MacOS/Grok Bot" --user-data-dir="$UD" >/tmp/gb-intel-out.log 2>/tmp/gb-intel-err.log &
echo "app_pid=$! app=$APP ud=$UD computer=mason1"
