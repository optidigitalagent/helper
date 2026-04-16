#!/bin/bash
# Usage: ./deploy.sh user@your-server-ip

SERVER=$1

if [ -z "$SERVER" ]; then
  echo "Usage: ./deploy.sh user@server-ip"
  exit 1
fi

echo "==> Syncing files to $SERVER..."
rsync -avz --exclude=node_modules --exclude=dist --exclude=.git \
  ./ $SERVER:/opt/helper/

echo "==> Deploying on server..."
ssh $SERVER "
  cd /opt/helper
  docker compose pull rsshub
  docker compose up -d --build
  docker compose ps
"

echo "==> Done. Logs:"
ssh $SERVER "docker compose -f /opt/helper/docker-compose.yml logs --tail=20 bot"
