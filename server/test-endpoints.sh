#!/bin/bash

# Testing Suite para Berry Dashboard Refactored Backend
# ======================================================

echo "╔════════════════════════════════════════════════════════╗"
echo "║     TESTING BERRY DASHBOARD REFACTORED BACKEND       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

BASE_URL="http://localhost:8080"
PASS=0
FAIL=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_code=$4
  local description=$5

  echo -n "Testing: $description... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$BASE_URL$endpoint")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [[ "$http_code" == "$expected_code"* ]]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_code, got $http_code)"
    ((FAIL++))
  fi
}

echo -e "${YELLOW}1. HEALTH & VERSION ENDPOINTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/v1/health" "" "200" "Health check endpoint"
test_endpoint "GET" "/api/v1/version" "" "200" "Version endpoint"
echo ""

echo -e "${YELLOW}2. AUTHENTICATION ENDPOINTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test registro válido
test_endpoint "POST" "/oauth/register" \
  '{"email":"test@example.com","password":"Test123!"}' \
  "200" "Register with valid credentials"

# Test registro sin email
test_endpoint "POST" "/oauth/register" \
  '{"password":"Test123!"}' \
  "400" "Register without email (should fail)"

# Test login válido
test_endpoint "POST" "/oauth/login" \
  '{"email":"test@example.com","password":"Test123!"}' \
  "200" "Login with valid credentials"

# Test login sin password
test_endpoint "POST" "/oauth/login" \
  '{"email":"test@example.com"}' \
  "400" "Login without password (should fail)"

echo ""

echo -e "${YELLOW}3. GUESTS ENDPOINTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test listar invitados
test_endpoint "GET" "/api/v1/guests" "" "200" "List all guests"

# Test crear invitado válido
test_endpoint "POST" "/api/v1/guests" \
  '{"name":"John Doe","email":"john@example.com"}' \
  "200" "Create guest with valid data"

# Test crear invitado sin nombre
test_endpoint "POST" "/api/v1/guests" \
  '{"email":"jane@example.com"}' \
  "400" "Create guest without name (should fail)"

# Test crear invitado sin email
test_endpoint "POST" "/api/v1/guests" \
  '{"name":"Jane Doe"}' \
  "400" "Create guest without email (should fail)"

echo ""

echo -e "${YELLOW}4. ERROR HANDLING${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test endpoint no existe
test_endpoint "GET" "/api/v1/nonexistent" "" "404" "Non-existent endpoint (should 404)"

# Test método no permitido
test_endpoint "DELETE" "/api/v1/health" "" "405" "Invalid method on endpoint"

echo ""

echo -e "${YELLOW}5. CORS VALIDATION${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test CORS headers
response=$(curl -s -i -X OPTIONS "$BASE_URL/api/v1/health" | grep -i "access-control")
if [ -n "$response" ]; then
  echo -e "Testing: CORS headers... ${GREEN}✓ PASS${NC}"
  ((PASS++))
else
  echo -e "Testing: CORS headers... ${RED}✗ FAIL${NC}"
  ((FAIL++))
fi

echo ""

echo "╔════════════════════════════════════════════════════════╗"
echo "║                    TEST RESULTS                        ║"
echo "╠════════════════════════════════════════════════════════╣"
echo -e "║ ${GREEN}Passed: $PASS${NC}                                                   │"
echo -e "║ ${RED}Failed: $FAIL${NC}                                                   │"
echo "╚════════════════════════════════════════════════════════╝"

# Exit with failure if any tests failed
if [ $FAIL -gt 0 ]; then
  exit 1
fi

exit 0
