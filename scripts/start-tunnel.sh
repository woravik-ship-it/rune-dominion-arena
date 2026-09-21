#!/bin/bash
# Expose Rune Dominion Arena ให้เข้าจากอินเทอร์เน็ตด้วย Cloudflare quick tunnel
#
# - URL เปลี่ยนทุกครั้งที่ tunnel รีสตาร์ท → เขียนไว้ที่ ~/.rune-dominion-tunnel/url.txt
# - ส่งลิงก์เข้า Telegram ให้เอง (อ่าน token จาก ~/.config/cline-bot.env)
#
# วิธีใช้:
#   scripts/start-tunnel.sh                # เปิด tunnel + ส่งลิงก์เข้า Telegram
#   scripts/start-tunnel.sh --no-notify    # ไม่ส่ง Telegram
#   TARGET=http://localhost:3100 scripts/start-tunnel.sh
set -uo pipefail

CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"
TARGET="${TARGET:-http://localhost:3000}"
STATE_DIR="${TUNNEL_STATE_DIR:-$HOME/.rune-dominion-tunnel}"
LOG_FILE="$STATE_DIR/tunnel.log"
URL_FILE="$STATE_DIR/url.txt"
CLINE_ENV="${CLINE_ENV:-$HOME/.config/cline-bot.env}"

NOTIFY=1
[ "${1:-}" = "--no-notify" ] && NOTIFY=0

if [ ! -x "$CLOUDFLARED" ]; then
    echo "ไม่พบ cloudflared ที่ $CLOUDFLARED" >&2
    exit 1
fi

mkdir -p "$STATE_DIR"

# เกมต้องตอบก่อน ไม่งั้น URL สาธารณะจะได้ 502 — ลองซ้ำเพราะ unit นี้ถูกรีสตาร์ทตามแอป
CODE=""
for _ in $(seq 1 30); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$TARGET/api/health" 2>/dev/null)"
    case "$CODE" in
        200|302|401|403|429) break ;;
    esac
    sleep 1
done
case "$CODE" in
    200|302|401|403|429) ;;
    *)
        echo "แอปที่ $TARGET ไม่ตอบ (HTTP ${CODE:-none}) — สตาร์ทก่อน: systemctl --user start rune-dominion-arena" >&2
        exit 1
        ;;
esac

send_telegram() {
    local token chat response
    [ -f "$CLINE_ENV" ] || { echo "(ข้ามการแจ้งเตือน: ไม่พบ $CLINE_ENV)"; return 0; }
    token="$(sed -n 's/^CLINE_TELEGRAM_TOKEN=//p' "$CLINE_ENV")"
    chat="$(sed -n 's/^CLINE_TELEGRAM_ALLOWED_USER_ID=//p' "$CLINE_ENV")"
    if [ -z "$token" ] || [ -z "$chat" ]; then
        echo "(ข้ามการแจ้งเตือน: ไม่มี token หรือ user id)" >&2
        return 0
    fi
    response="$(curl -sS --max-time 20 -X POST \
        "https://api.telegram.org/bot${token}/sendMessage" \
        -d "chat_id=${chat}" -d "parse_mode=HTML" -d "disable_web_page_preview=true" \
        --data-urlencode "text=<b>🎮 Rune Dominion Arena</b>

${URL}

🔗 <a href=\"${URL}\">เปิดหน้าแรก</a>
🔮 <a href=\"${URL}/discover\">ถอดรหัสรูน</a>
⚔️ <a href=\"${URL}/arena\">อารีน่า</a>
📋 <a href=\"${URL}/quests\">ภารกิจ</a>

<i>ลิงก์เปลี่ยนใหม่ทุกครั้งที่ tunnel รีสตาร์ท · สมัครฟรี เริ่มด้วย 100 Coin</i>" 2>&1)"
    case "$response" in
        *'"ok":true'*) echo "ส่งลิงก์เกมเข้า Telegram แล้ว" ;;
        *) echo "ส่ง Telegram ไม่สำเร็จ: $(echo "$response" | head -c 200)" >&2 ;;
    esac
}

echo "=== เปิด tunnel ไปที่ $TARGET ==="
: > "$LOG_FILE"
"$CLOUDFLARED" tunnel --no-autoupdate --url "$TARGET" >> "$LOG_FILE" 2>&1 &
CF_PID=$!

cleanup() {
    kill "$CF_PID" 2>/dev/null
    wait "$CF_PID" 2>/dev/null
    rm -f "$URL_FILE"
}
trap cleanup INT TERM EXIT

echo "รอ URL จาก Cloudflare..."
URL=""
for _ in $(seq 1 60); do
    URL="$(grep -oE 'https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com' "$LOG_FILE" | head -1)"
    [ -n "$URL" ] && break
    if ! kill -0 "$CF_PID" 2>/dev/null; then
        echo "cloudflared ออกไปแล้ว ดู log:" >&2
        tail -15 "$LOG_FILE" >&2
        exit 1
    fi
    sleep 1
done

if [ -z "$URL" ]; then
    echo "หา public URL ไม่เจอ ดู $LOG_FILE" >&2
    exit 1
fi

printf '%s\n' "$URL" > "$URL_FILE"

echo
echo "  🎮 Rune Dominion Arena : $URL"
echo "     health            : $URL/api/health"
echo "     ไฟล์ URL           : $URL_FILE"
echo

if [ "$NOTIFY" = "1" ]; then
    send_telegram
fi

echo "tunnel ทำงานอยู่ — กด Ctrl+C เพื่อหยุด"
wait "$CF_PID"
