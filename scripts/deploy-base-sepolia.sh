#!/usr/bin/env bash
# Deploy to Base Sepolia (testnet) for the submission's real transaction hashes.
#
# Needs (in your shell or in .env.testnet — never commit these):
#   OWNER_PRIVATE_KEY     testnet key with Base Sepolia ETH (owner + deployer)
#   OPERATOR_PRIVATE_KEY  a second fresh testnet key for the agent
# Optional:
#   BASE_SEPOLIA_RPC_URL  default https://sepolia.base.org
#   BASESCAN_API_KEY      to verify the contract source on basescan
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
# Keys come from the environment, or from the gitignored .env.testnet at the repo root.
if [ -z "${OWNER_PRIVATE_KEY:-}" ] && [ -f "$ROOT/.env.testnet" ]; then
  set -a; . "$ROOT/.env.testnet"; set +a
fi
RPC="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"

: "${OWNER_PRIVATE_KEY:?set OWNER_PRIVATE_KEY}"
: "${OPERATOR_PRIVATE_KEY:?set OPERATOR_PRIVATE_KEY}"
OPERATOR_ADDR=$(cast wallet address --private-key "$OPERATOR_PRIVATE_KEY")
OWNER_ADDR=$(cast wallet address --private-key "$OWNER_PRIVATE_KEY")
echo "Owner:    $OWNER_ADDR  balance: $(cast balance "$OWNER_ADDR" --rpc-url "$RPC" --ether) ETH"
echo "Operator: $OPERATOR_ADDR"

cd "$ROOT/contracts"
VERIFY=()
if [ -n "${BASESCAN_API_KEY:-}" ]; then
  VERIFY=(--verify --etherscan-api-key "$BASESCAN_API_KEY")
fi
# Sends 0.0001 ETH to the operator so the agent can pay gas (Base Sepolia gas is ~0.01 gwei).
OPERATOR_ADDRESS=$OPERATOR_ADDR OPERATOR_GAS_FUND=${OPERATOR_GAS_FUND:-100000000000000} \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow ${VERIFY[@]+"${VERIFY[@]}"}

cat deployments/84532.json

cat > "$ROOT/app/.env.local" <<EOF
CHAIN_ID=84532
RPC_URL=$RPC
EXPLORER_URL=https://sepolia.basescan.org
OPERATOR_PRIVATE_KEY=$OPERATOR_PRIVATE_KEY
OWNER_PRIVATE_KEY=$OWNER_PRIVATE_KEY
LLM_PROVIDER=${LLM_PROVIDER:-scripted}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-opus-5-5}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai/}
OPENAI_MODEL=${OPENAI_MODEL:-gemini-2.5-flash}
ALLOW_REDTEAM_BYPASS=true
EOF
echo
echo "✔ app/.env.local now points at Base Sepolia."
echo "  Next: cd app && npm run evidence   # writes docs/EXECUTION_EVIDENCE.md with basescan links"
echo "        npm run dev                  # demo UI against the testnet"
