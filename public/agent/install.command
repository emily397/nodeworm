#!/bin/sh
# Double-click installer for the NodeWorm Agent on macOS / Linux. Downloads the Agent
# and registers it as a Chrome/Edge native-messaging host (current user). If macOS
# blocks it, run: chmod +x install.command  then open it again.
set -e
BASE="https://abie-three.vercel.app"
DIR="$HOME/.nodeworm-agent"
mkdir -p "$DIR"
curl -fsSL "$BASE/agent/nodeworm-agent.js" -o "$DIR/nodeworm-agent.js"
cat > "$DIR/run.sh" <<EOF
#!/bin/sh
exec node "$DIR/nodeworm-agent.js"
EOF
chmod +x "$DIR/run.sh"
MAN="$DIR/com.nodeworm.executor.json"
cat > "$MAN" <<EOF
{
  "name": "com.nodeworm.executor",
  "description": "NodeWorm Agent native messaging host",
  "path": "$DIR/run.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://lflebkjggclmnaokfmfnjgbdpfdkajpj/"]
}
EOF
case "$(uname)" in
  Darwin) TARGETS="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts $HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" ;;
  *) TARGETS="$HOME/.config/google-chrome/NativeMessagingHosts $HOME/.config/microsoft-edge/NativeMessagingHosts" ;;
esac
for T in $TARGETS; do mkdir -p "$T"; cp "$MAN" "$T/com.nodeworm.executor.json"; done
echo "NodeWorm Agent installed. Restart your browser."
