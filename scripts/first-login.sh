
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Crash Monitor — First-Time Login Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "This will open a browser window for you to log in to Firebase."
echo "Your session will be saved to: ${ROOT_DIR}/browser-profile/"
echo

TEMP_CONFIG=$(mktemp /tmp/crash-monitor-config.XXXXXX.yaml)
sed 's/headless: true/headless: false/' "${ROOT_DIR}/config.yaml" > "$TEMP_CONFIG"

echo "Starting browser in non-headless mode..."
echo "Please:"
echo "  1. Log in with your Google account"
echo "  2. Navigate to any Firebase project to confirm access"  
echo "  3. Close the browser or press Ctrl+C when done"
echo

cd "$ROOT_DIR"
go run ./cmd/reporter --config "$TEMP_CONFIG" --run-now --no-sheets || true

rm -f "$TEMP_CONFIG"

echo
echo "Login session saved. You can now run with headless: true."
echo "Test headless mode with: make run-now"
