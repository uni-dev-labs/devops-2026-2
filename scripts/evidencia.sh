#!/usr/bin/env bash
# Levanta el stack, corre las pruebas de humo y guarda toda la evidencia
# en la carpeta evidencia/ para adjuntarla al Pull Request.
#
# Uso:  bash scripts/evidencia.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="evidencia"
LOG="$OUT/evidencia.txt"
BASE="http://localhost:3000"

mkdir -p "$OUT"
: > "$LOG"

say()  { echo -e "\n=== $* ===" | tee -a "$LOG"; }
run()  { echo "\$ $*" | tee -a "$LOG"; "$@" 2>&1 | tee -a "$LOG"; }

{
  echo "Evidencia práctica Docker — DevOps 2026-2"
  echo "Fecha: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Rama:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
  echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
} | tee -a "$LOG"

say "Versiones"
run docker --version
run docker compose version

say "Levantando el stack"
[ -f .env ] || cp .env.example .env
run docker compose up --build -d

say "Esperando a que la API responda"
for i in $(seq 1 60); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    echo "API lista tras ${i}s" | tee -a "$LOG"
    break
  fi
  sleep 1
  [ "$i" -eq 60 ] && echo "TIMEOUT: la API no respondió en 60s" | tee -a "$LOG"
done

say "Estado de los contenedores"
run docker compose ps

say "Imágenes construidas"
run docker images --filter reference='*devops*' --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'

# --- Pruebas de humo -------------------------------------------------------
check() {  # check <descripción> <curl args...>
  local desc="$1"; shift
  echo -e "\n--- $desc ---" | tee -a "$LOG"
  echo "\$ curl $*" | tee -a "$LOG"
  local body code
  body=$(curl -sS -w $'\n%{http_code}' "$@" 2>&1)
  code=$(printf '%s' "$body" | tail -n1)
  printf '%s\n' "$body" | sed '$d' | tee -a "$LOG"
  echo "HTTP $code" | tee -a "$LOG"
  if [[ "$code" =~ ^2 ]]; then
    echo "[OK] $desc" | tee -a "$LOG"
  else
    echo "[FALLO] $desc" | tee -a "$LOG"
    FAILED=$((FAILED + 1))
  fi
}

FAILED=0
say "Pruebas de humo"

check "GET /health"                "$BASE/health"
check "GET /api/postgres/health"   "$BASE/api/postgres/health"
check "GET /api/mongo/health"      "$BASE/api/mongo/health"

STAMP=$(date +%s)
check "POST /api/postgres/users" -X POST "$BASE/api/postgres/users" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Ana\",\"email\":\"ana+$STAMP@example.com\"}"

check "POST /api/mongo/users" -X POST "$BASE/api/mongo/users" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Luis\",\"email\":\"luis+$STAMP@example.com\"}"

check "GET /api/postgres/users"    "$BASE/api/postgres/users"
check "GET /api/mongo/users"       "$BASE/api/mongo/users"

say "Persistencia: los datos siguen en el volumen tras reiniciar la API"
run docker compose restart api
sleep 8
check "GET /api/postgres/users (tras restart)" "$BASE/api/postgres/users"
check "GET /api/mongo/users (tras restart)"    "$BASE/api/mongo/users"

say "Logs del servicio api"
docker compose logs --tail 60 api 2>&1 | tee "$OUT/logs-api.txt" | tee -a "$LOG"

say "Resultado"
if [ "$FAILED" -eq 0 ]; then
  echo "TODAS LAS PRUEBAS PASARON ✅" | tee -a "$LOG"
else
  echo "$FAILED prueba(s) fallaron ❌" | tee -a "$LOG"
fi

echo -e "\nEvidencia guardada en: $OUT/"
exit "$FAILED"
