#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/yasusu/Desktop/立命館OICマップ"
PID_FILE="$PROJECT_DIR/.map-server.pid"
PORT=4173

if [ ! -d "$PROJECT_DIR" ]; then
  echo "プロジェクトフォルダが見つかりません: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm が見つかりません。Node.js をインストールしてください。"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 が見つかりません。"
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run build

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" >/dev/null 2>&1; then
    kill "$OLD_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$PID_FILE"
fi

python3 -m http.server "$PORT" -d "$PROJECT_DIR/dist" < /dev/null >"$PROJECT_DIR/.map-server.log" 2>&1 &!
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

sleep 1

if [ "${NO_OPEN:-0}" != "1" ]; then
  open "http://127.0.0.1:$PORT/"
fi

echo "立命館OICマップを http://127.0.0.1:$PORT/ で起動しました。"
