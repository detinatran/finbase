#!/usr/bin/env bash
# One command local demo: anvil chain + contracts + web app.
#   ./scripts/dev.sh          start everything (fresh chain each time)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"

# Anvil default accounts (#0 = owner, #1 = agent operator). Public test keys — never use on a real network.
OWNER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
OPERATOR_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

if ! command -v anvil >/dev/null; then
  echo "Foundry not found. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi

if lsof -iTCP:8545 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "▶ Restarting anvil on :8545 (fresh state)"
  kill "$(lsof -tiTCP:8545 -sTCP:LISTEN)" || true
  sleep 1
fi
echo "▶ Starting anvil"
anvil --silent >/tmp/leash-anvil.log 2>&1 &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
sleep 2

echo "▶ Deploying contracts"
cd "$ROOT/contracts"
OWNER_PRIVATE_KEY=$OWNER_KEY OPERATOR_ADDRESS=$OPERATOR_ADDR WALLET_ETH=1000000000000000000 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --silent
cat deployments/31337.json

cd "$ROOT/app"
[ -f .env.local ] || cp .env.example .env.local
[ -d node_modules ] || npm install
rm -f data/31337-*.json data/31337-*.jsonl   # chain is fresh, so is app state

echo "▶ Web app on http://localhost:3100"
npm run dev
