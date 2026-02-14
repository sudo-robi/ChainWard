#!/bin/sh
# Basic backup script for ChainWard configuration &state
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
ARTIFACT_NAME="chainward_backup_$TIMESTAMP.tar.gz"

mkdir -p $BACKUP_DIR

echo "📦 Creating backup: $ARTIFACT_NAME"

# Backup .env, data JSONs
tar -czf $BACKUP_DIR/$ARTIFACT_NAME .env .env.monitor data/*.json 2>/dev/null

echo "✅ Backup completed at $BACKUP_DIR/$ARTIFACT_NAME"
