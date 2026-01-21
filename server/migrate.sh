#!/bin/bash

# Script para migrar rápidamente al servidor refactorizado

echo "🚀 Berry Dashboard - Refactoring Migration Script"
echo "=================================================="
echo ""

# Verificar variables de entorno
echo "📋 Verificando variables de entorno..."

required_vars=("DATABASE_URL" "ENCRYPTION_KEY" "RESEND_API_KEY")
missing_vars=()

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
  echo "❌ Faltan las siguientes variables de entorno:"
  for var in "${missing_vars[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "✏️  Por favor, agregalas a .env"
  exit 1
fi

echo "✅ Todas las variables de entorno están configuradas"
echo ""

# Hacer backup del index.js original
echo "💾 Creando backup del servidor original..."
if [ ! -f "server/index.backup.js" ]; then
  cp server/index.js server/index.backup.js
  echo "✅ Backup guardado en server/index.backup.js"
else
  echo "ℹ️  Backup ya existe (saltando)"
fi

echo ""
echo "✅ Migración completada"
echo ""
echo "Próximos pasos:"
echo "1. Actualizar package.json: npm run dev"
echo "2. Probar health check: curl http://localhost:8080/api/v1/health"
echo "3. Para producción, usar: node server/index-refactored.js"
echo ""
