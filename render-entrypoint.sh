#!/bin/sh
set -eu

: "${PORT:=8080}"
: "${API_UPSTREAM:?API_UPSTREAM must be set to the HTTPS Render API URL}"

case "$API_UPSTREAM" in
  https://* ) ;;
  * ) echo "API_UPSTREAM must use HTTPS" >&2; exit 1 ;;
esac

case "$API_UPSTREAM" in
  */ ) echo "API_UPSTREAM must not end with a slash" >&2; exit 1 ;;
esac

envsubst '${PORT} ${API_UPSTREAM}' \
  < /etc/nginx/render.conf.template \
  > /tmp/nginx.conf

exec nginx -c /tmp/nginx.conf -g 'daemon off;'

