#!/usr/bin/env bash
#
# Setup for TradingView MCP Jackson.
# Run this on your own machine (macOS/Linux) — not in a remote container.
#
#   bash setup-tradingview-mcp.sh
#
set -euo pipefail

REPO_URL="https://github.com/LewisWJackson/tradingview-mcp-jackson.git"
INSTALL_DIR="$HOME/tradingview-mcp-jackson"
MCP_CONFIG="$HOME/.claude/.mcp.json"
STAMP="$(date +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    ! %s\033[0m\n' "$1"; }

command -v node >/dev/null || { echo "node is required but not installed."; exit 1; }
command -v git  >/dev/null || { echo "git is required but not installed."; exit 1; }

# ---------------------------------------------------------------- 1. clone
say "Cloning to $INSTALL_DIR"
if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Already exists — pulling latest instead of re-cloning."
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# ---------------------------------------------------------------- 2. deps
say "Installing dependencies"
cd "$INSTALL_DIR"
npm install

# ---------------------------------------------------------------- 3. rules
# The repo SHIPS a committed rules.json (the author's live-trading scalper
# demo). Back it up rather than silently clobbering it.
say "Setting up rules.json"
if [ -f "$INSTALL_DIR/rules.json" ]; then
  cp "$INSTALL_DIR/rules.json" "$INSTALL_DIR/rules.json.bak-$STAMP"
  warn "Existing rules.json backed up to rules.json.bak-$STAMP"
fi
cp "$INSTALL_DIR/rules.example.json" "$INSTALL_DIR/rules.json"
echo "    rules.json is now the blank template — fill in your own rules."

# ---------------------------------------------------------------- 4. config
# Merge into ~/.claude/.mcp.json without disturbing existing servers.
say "Merging tradingview into $MCP_CONFIG"
mkdir -p "$(dirname "$MCP_CONFIG")"
[ -f "$MCP_CONFIG" ] && cp "$MCP_CONFIG" "$MCP_CONFIG.bak-$STAMP" && \
  warn "Existing config backed up to $(basename "$MCP_CONFIG").bak-$STAMP"

MCP_CONFIG="$MCP_CONFIG" INSTALL_DIR="$INSTALL_DIR" node <<'NODE'
const fs = require('fs');
const path = process.env.MCP_CONFIG;
const server = process.env.INSTALL_DIR + '/src/server.js';

let cfg = {};
if (fs.existsSync(path)) {
  const raw = fs.readFileSync(path, 'utf8').trim();
  if (raw) {
    try {
      cfg = JSON.parse(raw);
    } catch (e) {
      console.error('Existing .mcp.json is not valid JSON: ' + e.message);
      console.error('Refusing to overwrite it. Fix the syntax and re-run.');
      process.exit(1);
    }
  }
}

cfg.mcpServers = cfg.mcpServers || {};
const existing = Object.keys(cfg.mcpServers);
cfg.mcpServers.tradingview = { command: 'node', args: [server] };

fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
console.log('    servers now configured: ' + Object.keys(cfg.mcpServers).join(', '));
if (existing.length) console.log('    preserved: ' + existing.join(', '));
NODE

# ---------------------------------------------------------------- 5. verify
say "Verifying the server starts and speaks MCP"
# Collect the full response first. Piping straight into `grep -q` makes grep
# exit on first match, which SIGPIPEs node and trips `pipefail`.
VERIFY_OUT="$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"setup","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node "$INSTALL_DIR/src/server.js" 2>/dev/null || true)"

if printf '%s' "$VERIFY_OUT" | grep -q '"tools"'; then
  TOOL_COUNT="$(printf '%s' "$VERIFY_OUT" | grep -o '"name":"[a-z_]*"' | sort -u | wc -l | tr -d ' ')"
  echo "    OK — server responds to tools/list ($TOOL_COUNT tools registered)."
else
  echo "    FAILED — server did not respond correctly."
  exit 1
fi

cat <<EOF

──────────────────────────────────────────────────────────────
Install done. Three things left, and they need you:

1. Fill in your trading rules:
     open -e "$INSTALL_DIR/rules.json"     # macOS
     \$EDITOR "$INSTALL_DIR/rules.json"     # anything else

2. Launch TradingView Desktop with the debug port open
   (the MCP server talks to it over localhost:9222):
     macOS:  /Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
     Linux:  /opt/TradingView/tradingview --remote-debugging-port=9222

3. Fully restart Claude Code, then ask it to run tv_health_check.
   Expect: cdp_connected: true. If false, TradingView isn't running
   with the flag from step 2.
──────────────────────────────────────────────────────────────
EOF
