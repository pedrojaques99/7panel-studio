#!/usr/bin/env bash
# Smoke test — valida estado saudável do stack inteiro em <5s.
# Uso: bash scripts/smoke.sh
# Exit 0 = tudo OK; exit 1 = pelo menos um check falhou.

set -u

PASS=0
FAIL=0
WARN=0

ok()   { echo "  OK    $1"; PASS=$((PASS+1)); }
err()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN  $1"; WARN=$((WARN+1)); }

echo "=== smoke test ==="

probe() { curl -s -o "${2:-/dev/null}" -w "%{http_code}" --max-time 2 "$1" 2>/dev/null; }

# 1) Backend Flask vivo em :5000
http=$(probe http://localhost:5000/api/audio/sessions /tmp/smoke_sessions.json)
if [ "$http" = "200" ]; then
  ok "backend /api/audio/sessions HTTP 200"
  if jq -e 'type == "array"' /tmp/smoke_sessions.json >/dev/null 2>&1; then
    ok "backend retorna JSON array válido"
  else
    warn "JSON inválido ou jq não instalado"
  fi
else
  err "backend offline ou erro (HTTP ${http:-000}) — rode @jaques.vbs"
fi

# 2) /api/config responde
http=$(probe http://localhost:5000/api/config)
[ "$http" = "200" ] && ok "/api/config HTTP 200" || err "/api/config falhou (HTTP ${http:-000})"

# 3) Frontend Vite servindo em :5173
http=$(probe http://localhost:5173/)
[ "$http" = "200" ] && ok "frontend Vite :5173 HTTP 200" || err "Vite offline (HTTP ${http:-000})"

# 4) Detector de Python órfão — só pode haver 1 dashboard + 1 yt_bot
orphans=$(powershell.exe -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match 'dashboard_server' } | Measure-Object).Count" 2>/dev/null | tr -d '\r\n ')
if [ "$orphans" = "1" ]; then
  ok "1 dashboard_server.py rodando (esperado)"
elif [ "$orphans" = "0" ]; then
  err "nenhum dashboard_server.py rodando"
elif [ -z "$orphans" ]; then
  warn "PowerShell indisponível — não foi possível contar processos"
else
  err "$orphans dashboard_server.py rodando (esperado: 1) — processos zombie!"
fi

# 5) Build production passa (TypeScript + Vite)
echo "  ...   rodando build (pode demorar ~5s)"
if (cd "$(dirname "$0")/.." && npx vite build > /tmp/smoke_build.log 2>&1); then
  ok "vite build production sem erros"
else
  err "vite build falhou (veja /tmp/smoke_build.log)"
fi

echo
echo "=== resultado: $PASS pass, $FAIL fail, $WARN warn ==="
[ "$FAIL" = "0" ] && exit 0 || exit 1
