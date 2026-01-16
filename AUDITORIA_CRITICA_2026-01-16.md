# AUDITORÍA CRÍTICA DE SEGURIDAD Y DATOS
## Berry Dashboard - Sistema de Gestión de Eventos

---

**Fecha de Auditoría:** 16 de enero de 2026
**Auditor:** Sistema de Auditoría Crítica Automatizada
**Versión del Sistema:** 3.15.2-guest-status
**Tipo de Sistema:** Gestión de eventos con módulos financieros

---

## ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Alcance de la Auditoría](#2-alcance-de-la-auditoría)
3. [Metodología](#3-metodología)
4. [Arquitectura del Sistema](#4-arquitectura-del-sistema)
5. [Hallazgos Detallados](#5-hallazgos-detallados)
   - [5.1 Blockers (Críticos)](#51-blockers-críticos)
   - [5.2 Severidad Alta](#52-severidad-alta)
   - [5.3 Severidad Media](#53-severidad-media)
   - [5.4 Severidad Baja](#54-severidad-baja)
6. [Matriz de Riesgos](#6-matriz-de-riesgos)
7. [Plan de Remediación Priorizado](#7-plan-de-remediación-priorizado)
8. [Pruebas de Validación](#8-pruebas-de-validación)
9. [Conclusiones](#9-conclusiones)
10. [Anexos](#10-anexos)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión General

Esta auditoría crítica evalúa el sistema Berry Dashboard, una plataforma de gestión de eventos que incluye módulos de gestión financiera (comisiones, presupuestos, pagos a proveedores y staff).

**IMPORTANTE:** Este sistema NO es un sistema de inventario tradicional, pero maneja transacciones financieras que requieren controles de integridad equivalentes.

### 1.2 Métricas Clave

| Métrica | Valor |
|---------|-------|
| **Total de Hallazgos** | 23 |
| **Blockers (Críticos)** | 3 |
| **Severidad Alta** | 8 |
| **Severidad Media** | 9 |
| **Severidad Baja** | 3 |
| **Líneas de Código Backend** | ~16,000 |
| **Tablas de Base de Datos** | 35+ |
| **Endpoints API** | 100+ |

### 1.3 Estado General del Sistema

```
╔══════════════════════════════════════════════════════════════╗
║                    ESTADO: CRÍTICO                            ║
║                                                               ║
║  El sistema presenta vulnerabilidades de seguridad activas    ║
║  que requieren remediación inmediata antes de continuar       ║
║  operaciones en producción.                                   ║
╚══════════════════════════════════════════════════════════════╝
```

### 1.4 Hallazgos Más Críticos

1. **API Key de Telnyx hardcodeada en código fuente** - Credencial expuesta
2. **Autenticación permisiva** - Endpoints sensibles accesibles sin token
3. **Operaciones financieras sin transacciones atómicas** - Riesgo de inconsistencia

---

## 2. ALCANCE DE LA AUDITORÍA

### 2.1 Componentes Auditados

| Componente | Archivos | Estado |
|------------|----------|--------|
| Backend API | `server/index.js` | ✅ Auditado |
| Frontend React | `src/**/*.tsx` | ✅ Auditado |
| Esquema de BD | Inline en index.js | ✅ Auditado |
| Autenticación OAuth | Inline en index.js | ✅ Auditado |
| Integraciones | Eventbrite, Telnyx, Resend | ✅ Auditado |

### 2.2 Módulos Funcionales Evaluados

- Gestión de Invitados (Guests)
- Gestión de Eventos
- Sistema de Promotores y Comisiones
- Presupuestos y Budget Items
- Gestión de Staff y Pagos
- Proveedores y Contratos
- Sponsors y Tiers
- Integración Eventbrite
- Sistema de SMS (Telnyx)
- Sistema de Email (Resend)
- Portal de Cliente

### 2.3 Exclusiones

- Infraestructura de hosting (Railway, etc.)
- Configuración de red y firewall
- Análisis de penetración activo
- Revisión de dependencias npm (audit separado recomendado)

---

## 3. METODOLOGÍA

### 3.1 Lentes de Análisis

La auditoría se realizó desde cuatro perspectivas independientes:

#### 3.1.1 Experto en Negocio
- Control de flujos financieros
- Reglas de negocio y validaciones
- Riesgo de fraude y abuso
- Permisos y segregación de funciones

#### 3.1.2 Experto en Datos y Backend
- Integridad referencial
- Consistencia transaccional
- Idempotencia de operaciones
- Trazabilidad y auditoría

#### 3.1.3 Experto en Seguridad
- Autenticación y autorización
- Gestión de secretos
- Inyección SQL y XSS
- Validación de entrada

#### 3.1.4 Experto en UX/UI
- Prevención de errores
- Claridad de estados
- Flujos de usuario
- Feedback al usuario

### 3.2 Criterios de Severidad

| Severidad | Definición | SLA Recomendado |
|-----------|------------|-----------------|
| **Blocker** | Vulnerabilidad activa explotable, pérdida de datos inminente, o fallo crítico | 24-48 horas |
| **Alta** | Riesgo significativo de pérdida financiera o de datos | 1-2 semanas |
| **Media** | Problemas que afectan operaciones o mantenibilidad | 1 mes |
| **Baja** | Mejoras recomendadas, deuda técnica | Próximo sprint |

---

## 4. ARQUITECTURA DEL SISTEMA

### 4.1 Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 19.2 + TypeScript 5.9 + Tailwind CSS 3.4             │
│  Next.js 16.1 (Landing) + Vite (Dashboard)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│  Node.js + Express 4.18 (Monolito ~16,000 líneas)           │
│  WebSocket para tiempo real                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATABASE                               │
│  PostgreSQL 8.11 (35+ tablas, sin FKs)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRACIONES                             │
│  Eventbrite API │ Telnyx SMS │ Resend Email │ OpenAI GPT    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Modelo de Datos Principal

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    users     │     │    events    │     │   guests     │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ email        │     │ user_id      │◄────│ event_id     │
│ password_hash│     │ name         │     │ user_id      │
└──────────────┘     │ event_date   │     │ name, email  │
       │             └──────────────┘     │ category     │
       │                    │             └──────────────┘
       ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  promoters   │     │   budgets    │     │    staff     │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ user_id      │     │ event_id     │     │ user_id      │
│ commission_* │     │ total_budget │     │ hourly_rate  │
│ total_sales  │     │ total_spent  │     │ total_earned │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│promoter_sales│     │ budget_items │     │staff_payments│
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ promoter_id  │     │ budget_id    │     │ staff_id     │
│ sale_amount  │     │ actual_amount│     │ amount       │
│ commission_* │     │ is_paid      │     │ status       │
└──────────────┘     └──────────────┘     └──────────────┘

⚠️ NOTA: Ninguna relación tiene FOREIGN KEY constraint
```

### 4.3 Flujos Financieros Críticos

```
FLUJO DE COMISIONES DE PROMOTORES
─────────────────────────────────

  Venta           Registro          Actualización       Payout
    │                 │                  │                 │
    ▼                 ▼                  ▼                 ▼
┌────────┐     ┌────────────┐     ┌────────────┐     ┌────────┐
│Cliente │────►│ trackSale  │────►│ UPDATE     │────►│ payout │
│compra  │     │ INSERT     │     │ promoters  │     │ UPDATE │
│ticket  │     │ promo_sales│     │ totals     │     │ status │
└────────┘     └────────────┘     └────────────┘     └────────┘
                                                          │
              ⚠️ SIN TRANSACCIÓN              ⚠️ MARCA TODO │
              ⚠️ ATÓMICA                        COMO PAGADO │
                                                 SIN VERIFICAR
```

---

## 5. HALLAZGOS DETALLADOS

### 5.1 BLOCKERS (Críticos)

---

#### BLOCKER-01: API KEY DE TELNYX HARDCODEADA EN CÓDIGO FUENTE

| Campo | Valor |
|-------|-------|
| **ID** | BLOCKER-01 |
| **Severidad** | 🔴 BLOCKER |
| **Área** | Seguridad |
| **CVSS Score** | 9.8 (Crítico) |
| **Estado** | Activo - Requiere acción inmediata |

**Descripción:**

La API key del servicio Telnyx (proveedor de SMS) está hardcodeada directamente en el código fuente del servidor, visible para cualquier persona con acceso al repositorio.

**Ubicación:**
```
Archivo: server/index.js
Líneas: 41-42
```

**Código Afectado:**
```javascript
// ============================================
// TELNYX SMS CONFIGURATION (HARDCODED)
// ============================================
const TELNYX_API_KEY = 'KEY019BB55919322AD23E6BB43CF03090E7_cirYjuPOVNFgblLFbdAm7A';
const TELNYX_PHONE_NUMBER = '+19858539097';
```

**Impacto:**

| Tipo de Impacto | Descripción |
|-----------------|-------------|
| **Financiero** | Cualquier actor malicioso puede enviar SMS ilimitados cargados a esta cuenta |
| **Reputacional** | La cuenta podría usarse para spam/phishing, dañando la reputación del número |
| **Legal** | Posible responsabilidad por mensajes enviados fraudulentamente |
| **Operacional** | La cuenta podría ser suspendida por Telnyx, interrumpiendo el servicio |

**Causa Raíz:**
- Práctica de desarrollo insegura
- Falta de revisión de código pre-commit
- Ausencia de secretos en gestor de secretos

**Evidencia de Explotabilidad:**
```bash
# Cualquier persona con el código puede enviar SMS:
curl -X POST https://api.telnyx.com/v2/messages \
  -H "Authorization: Bearer KEY019BB55919322AD23E6BB43CF03090E7_cirYjuPOVNFgblLFbdAm7A" \
  -H "Content-Type: application/json" \
  -d '{"from": "+19858539097", "to": "+1XXXXXXXXXX", "text": "Mensaje malicioso"}'
```

**Remediación:**

1. **Inmediato (Hoy):**
   - Rotar la API key en el panel de Telnyx
   - Considerar la key actual como comprometida
   - Revisar logs de Telnyx por uso no autorizado

2. **Corto Plazo (Esta semana):**
   ```javascript
   // Cambiar a variable de entorno
   const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
   const TELNYX_PHONE_NUMBER = process.env.TELNYX_PHONE_NUMBER;

   // Validar en startup
   if (!TELNYX_API_KEY) {
     console.error('FATAL: TELNYX_API_KEY not configured');
     process.exit(1);
   }
   ```

3. **Mediano Plazo:**
   - Implementar gestor de secretos (AWS Secrets Manager, HashiCorp Vault)
   - Agregar pre-commit hook para detectar secretos (git-secrets, detect-secrets)
   - Documentar política de gestión de credenciales

**Prueba de Validación:**
```bash
# Verificar que la key no existe en el código
grep -r "KEY019BB55919322AD23E6BB43CF03090E7" .
# Esperado: Sin resultados

# Verificar que se usa variable de entorno
grep -r "process.env.TELNYX" server/
# Esperado: process.env.TELNYX_API_KEY encontrado
```

**Esfuerzo Estimado:** S (Small) - 2-4 horas

---

#### BLOCKER-02: AUTENTICACIÓN OPCIONAL - ENDPOINTS CRÍTICOS SIN PROTECCIÓN

| Campo | Valor |
|-------|-------|
| **ID** | BLOCKER-02 |
| **Severidad** | 🔴 BLOCKER |
| **Área** | Seguridad / Autorización |
| **CVSS Score** | 9.1 (Crítico) |
| **Estado** | Activo |

**Descripción:**

El middleware de autenticación está diseñado de forma permisiva: cuando no hay token válido, en lugar de rechazar la request, simplemente establece `req.user = null` y permite que continúe. Esto significa que cualquier endpoint que no verifique explícitamente la existencia de `req.user` es accesible públicamente.

**Ubicación:**
```
Archivo: server/index.js
Líneas: 2580-2612
```

**Código Afectado:**
```javascript
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ⚠️ PROBLEMA: No rechaza, solo marca como null y continúa
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();  // CONTINÚA SIN AUTENTICACIÓN
  }

  const token = authHeader.substring(7);

  try {
    const result = await pool.query(
      `SELECT u.* FROM users u
       JOIN oauth_tokens t ON u.id = t.user_id
       WHERE t.access_token = $1 AND t.expires_at > NOW()`,
      [token]
    );

    if (result.rows.length > 0) {
      req.user = result.rows[0];
    } else {
      req.user = null;  // ⚠️ Token inválido pero continúa
    }
  } catch (error) {
    console.error('Auth error:', error);
    req.user = null;  // ⚠️ Error pero continúa
  }

  next();
};

// Se aplica a TODAS las rutas
app.use(authenticateToken);
```

**Patrón Vulnerable en Endpoints:**
```javascript
// Muchos endpoints usan este patrón inseguro:
app.get('/api/v1/guests', async (req, res) => {
  const userId = req.user?.id;  // ⚠️ undefined si no autenticado

  // Si userId es null/undefined, la query puede retornar datos de otros usuarios
  // o todos los datos si la lógica no maneja el caso
  const result = await pool.query(
    'SELECT * FROM guests WHERE user_id = $1 OR user_id IS NULL',
    [userId]
  );
});
```

**Endpoints Potencialmente Afectados:**

| Endpoint | Riesgo |
|----------|--------|
| `GET /api/v1/guests` | Acceso a lista de invitados |
| `GET /api/v1/events` | Acceso a eventos |
| `GET /api/v1/sponsors` | Información de sponsors |
| `POST /api/v1/gpt/*` | Acceso a funciones GPT |
| `GET /api/v1/uploads` | Archivos subidos |

**Impacto:**

| Tipo | Descripción |
|------|-------------|
| **Confidencialidad** | Exposición de datos de clientes, eventos, finanzas |
| **Integridad** | Modificación no autorizada de datos |
| **Disponibilidad** | Posible DoS al no haber rate limiting |

**Remediación:**

1. **Crear middleware restrictivo:**
```javascript
// Middleware que REQUIERE autenticación
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'UNAUTHORIZED'
    });
  }
  next();
};

// Middleware que REQUIERE autenticación Y permisos específicos
const requireRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};
```

2. **Aplicar a rutas protegidas:**
```javascript
// Rutas públicas (sin middleware adicional)
app.get('/api/health', healthCheck);
app.get('/api/v1/version', getVersion);
app.post('/oauth/login', login);

// Rutas protegidas (requieren autenticación)
app.get('/api/v1/guests', requireAuth, getGuests);
app.post('/api/v1/guests', requireAuth, createGuest);
app.get('/api/v1/promoters', requireAuth, getPromoters);

// Rutas admin (requieren rol específico)
app.delete('/api/v1/events/all', requireRole(['admin']), deleteAllEvents);
```

**Prueba de Validación:**
```bash
# Test: Endpoint debe rechazar request sin token
curl -X GET https://api.example.com/api/v1/guests \
  -H "Content-Type: application/json"

# Esperado: 401 Unauthorized
# {"error": "Authentication required", "code": "UNAUTHORIZED"}

# Actual (problema): 200 OK con datos
```

**Esfuerzo Estimado:** M (Medium) - 1-2 días

---

#### BLOCKER-03: PATRÓN DE SQL INJECTION EN HEALTH CHECK

| Campo | Valor |
|-------|-------|
| **ID** | BLOCKER-03 |
| **Severidad** | 🔴 BLOCKER |
| **Área** | Seguridad / Datos |
| **CVSS Score** | 8.6 (Alto) |
| **Estado** | Latente - Patrón inseguro |

**Descripción:**

El endpoint de health check construye queries SQL interpolando nombres de tabla directamente en el string de la query. Aunque actualmente el array de tablas está hardcodeado, este patrón es peligroso porque:
1. Podría ser extendido para aceptar parámetros de usuario
2. Establece un precedente de código inseguro que otros desarrolladores podrían copiar

**Ubicación:**
```
Archivo: server/index.js
Líneas: 9898-9901
```

**Código Afectado:**
```javascript
// 3. Check table row counts (data integrity)
if (health.components.database?.status === 'healthy') {
  try {
    const counts = {};
    for (const table of ['guests', 'events', 'staff', 'vendors', 'sponsors']) {
      try {
        // ⚠️ PATRÓN INSEGURO: Interpolación directa
        const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        counts[table] = parseInt(result.rows[0].count);
      } catch {
        counts[table] = 'error';
      }
    }
    // ...
  }
}
```

**Escenario de Riesgo:**

Si este código se modifica para aceptar input del usuario:
```javascript
// ⚠️ Si alguien modifica a esto, es SQL injection directo
app.get('/api/v1/health/table/:tableName', async (req, res) => {
  const { tableName } = req.params;
  // VULNERABLE: El atacante puede enviar "users; DROP TABLE users;--"
  const result = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
});
```

**Impacto Potencial:**

| Ataque | Resultado |
|--------|-----------|
| `tableName = "users; DROP TABLE users;--"` | Eliminación de tabla |
| `tableName = "users UNION SELECT password_hash FROM users--"` | Exfiltración de datos |
| `tableName = "pg_sleep(10)"` | DoS por query lenta |

**Remediación:**

```javascript
// Opción 1: Lista blanca estricta
const ALLOWED_TABLES = new Set(['guests', 'events', 'staff', 'vendors', 'sponsors']);

async function getTableCount(tableName) {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Table '${tableName}' not in whitelist`);
  }

  // Aún así, usar query parametrizada cuando sea posible
  const result = await pool.query(
    'SELECT COUNT(*) FROM ' + pool.escapeIdentifier(tableName)
  );
  return parseInt(result.rows[0].count);
}

// Opción 2: Usar pg-format para escapar identificadores
import format from 'pg-format';

const result = await pool.query(
  format('SELECT COUNT(*) FROM %I', tableName)
);
```

**Prueba de Validación:**
```bash
# Buscar interpolaciones de SQL inseguras
grep -n '\`.*\${.*}\`' server/index.js | grep -i 'query\|sql'

# Verificar que todas las queries usan parámetros
grep -n "pool.query" server/index.js | grep -v '\$[0-9]' | head -20
```

**Esfuerzo Estimado:** S (Small) - 2-4 horas

---

### 5.2 SEVERIDAD ALTA

---

#### ALTA-01: SIN INTEGRIDAD REFERENCIAL - DATOS HUÉRFANOS GARANTIZADOS

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-01 |
| **Severidad** | 🟠 ALTA |
| **Área** | Datos / Integridad |
| **Estado** | Activo |

**Descripción:**

El esquema de base de datos carece completamente de FOREIGN KEY constraints. Los comentarios en el código confirman que esto es intencional pero problemático:

```javascript
// Línea 504: "Note: Creating without FK constraint due to potential type mismatch"
// Línea 718: "Create staff_assignments table - Staff assigned to events (no FK for compatibility)"
// Línea 748: "Create staff_payments table - Payment tracking (no FK for compatibility)"
```

**Tablas Sin Integridad Referencial:**

| Tabla Hija | Columna FK | Tabla Padre | Estado |
|------------|------------|-------------|--------|
| `event_timeline` | `event_id` | `events` | ❌ Sin FK |
| `event_checklist` | `event_id` | `events` | ❌ Sin FK |
| `guests` | `event_id` | `events` | ❌ Sin FK |
| `staff_assignments` | `staff_id` | `staff` | ❌ Sin FK |
| `staff_assignments` | `event_id` | `events` | ❌ Sin FK |
| `staff_payments` | `staff_id` | `staff` | ❌ Sin FK |
| `budget_items` | `budget_id` | `budgets` | ❌ Sin FK |
| `budget_items` | `category_id` | `budget_categories` | ❌ Sin FK |
| `promoter_sales` | `promoter_id` | `promoters` | ✅ Con FK |
| `vendor_quotes` | `vendor_id` | `vendors` | ❌ Sin FK |
| `vendor_contracts` | `vendor_id` | `vendors` | ❌ Sin FK |

**Impacto:**

1. **Datos Huérfanos:** Al eliminar un evento, quedan timeline items, checklist items, y guests asociados sin padre
2. **Inconsistencia Financiera:** Budget items pueden referenciar categorías inexistentes
3. **Reportes Incorrectos:** Joins pueden fallar silenciosamente o mostrar datos parciales
4. **Imposible Auditar:** No hay garantía de que los datos relacionados sean válidos

**Ejemplo de Problema:**
```sql
-- Escenario: Se borra un evento
DELETE FROM events WHERE id = 123;

-- Resultado: Datos huérfanos
SELECT * FROM event_timeline WHERE event_id = 123;  -- Sigue existiendo
SELECT * FROM guests WHERE event_id = 123;           -- Sigue existiendo
SELECT * FROM budget_items WHERE budget_id IN
  (SELECT id FROM budgets WHERE event_id = 123);     -- Sigue existiendo
```

**Remediación:**

1. **Migración para agregar FKs:**
```sql
-- Paso 1: Limpiar datos huérfanos existentes
DELETE FROM event_timeline WHERE event_id NOT IN (SELECT id FROM events);
DELETE FROM event_checklist WHERE event_id NOT IN (SELECT id FROM events);
DELETE FROM guests WHERE event_id IS NOT NULL AND event_id NOT IN (SELECT id FROM events);

-- Paso 2: Agregar constraints
ALTER TABLE event_timeline
  ADD CONSTRAINT fk_timeline_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE event_checklist
  ADD CONSTRAINT fk_checklist_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE guests
  ADD CONSTRAINT fk_guests_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

ALTER TABLE staff_assignments
  ADD CONSTRAINT fk_assignment_staff
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;

ALTER TABLE budget_items
  ADD CONSTRAINT fk_budget_items_budget
  FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE;
```

**Esfuerzo Estimado:** L (Large) - 1-2 semanas (requiere migración cuidadosa)

---

#### ALTA-02: TRANSACCIONES NO ATÓMICAS EN OPERACIONES FINANCIERAS

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-02 |
| **Severidad** | 🟠 ALTA |
| **Área** | Datos / Negocio |
| **Estado** | Activo |

**Descripción:**

Las operaciones financieras críticas (tracking de ventas, payouts, presupuestos) ejecutan múltiples queries SQL sin envolverlas en una transacción. Si una query falla después de que otra ha sido exitosa, los datos quedan en estado inconsistente.

**Ubicación:**
```
Archivo: server/index.js
Líneas: 6788-6793 (trackSale)
Líneas: 6830-6834 (payout)
```

**Código Afectado - trackSale:**
```javascript
case 'trackSale': {
  // Query 1: Insertar venta
  const saleResult = await pool.query(`
    INSERT INTO promoter_sales (promoter_id, event_id, guest_name, guest_email,
      sale_amount, commission_amount, commission_status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *
  `, [promoter.id, eventId, guestName, guestEmail, saleAmount, commissionAmount]);

  // ⚠️ Si esta query falla, la venta quedó registrada pero totales no actualizados
  await pool.query(`
    UPDATE promoters SET
      total_sales = total_sales + $1,
      total_commission = total_commission + $2,
      total_tickets_sold = total_tickets_sold + 1,
      last_sale_at = NOW()
    WHERE id = $3
  `, [saleAmount, commissionAmount, promoter.id]);
}
```

**Escenario de Fallo:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   INSERT OK     │────►│   UPDATE FAIL   │────►│   INCONSISTENCIA│
│ promoter_sales  │     │   promoters     │     │                 │
│ $500 registrado │     │ (timeout/error) │     │ Venta existe    │
│                 │     │                 │     │ Total no suma   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Impacto Financiero:**

| Escenario | Pérdida |
|-----------|---------|
| 1 fallo en 1000 ventas de $100 | $100 no contabilizados |
| Sistema bajo carga con 5% de fallos | Reportes de comisiones incorrectos |
| Payout basado en `total_commission` incorrecto | Pagos erróneos a promotores |

**Remediación:**

```javascript
case 'trackSale': {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Query 1: Insertar venta
    const saleResult = await client.query(`
      INSERT INTO promoter_sales (...) VALUES (...) RETURNING *
    `, [...]);

    // Query 2: Actualizar totales
    await client.query(`
      UPDATE promoters SET total_sales = total_sales + $1 ... WHERE id = $2
    `, [...]);

    await client.query('COMMIT');

    return res.json({ success: true, sale: saleResult.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction failed:', error);
    return res.status(500).json({ error: 'Failed to record sale' });

  } finally {
    client.release();
  }
}
```

**Esfuerzo Estimado:** M (Medium) - 3-5 días

---

#### ALTA-03: PAYOUT MARCA TODAS LAS COMISIONES COMO PAGADAS SIN VERIFICAR MONTO

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-03 |
| **Severidad** | 🟠 ALTA |
| **Área** | Negocio / Financiero |
| **Estado** | Activo - Riesgo de pérdida financiera |

**Descripción:**

El endpoint de payout a promotores marca TODAS las comisiones pendientes como "pagadas" sin verificar que el monto del payout sea suficiente para cubrir el total adeudado. Un pago parcial de $100 puede marcar $10,000 en comisiones como saldadas.

**Ubicación:**
```
Archivo: server/index.js
Líneas: 6826-6835
```

**Código Afectado:**
```javascript
case 'payout': {
  if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
  const { amount, paymentMethod, reference, notes } = data || {};

  if (!amount || !paymentMethod) {
    return res.status(400).json({ error: 'amount and paymentMethod required' });
  }

  // Registra el payout con el monto indicado
  const payoutResult = await pool.query(`
    INSERT INTO promoter_payouts (promoter_id, amount, payment_method, reference, notes, status, paid_at)
    VALUES ($1, $2, $3, $4, $5, 'completed', NOW()) RETURNING *
  `, [promoterId, amount, paymentMethod, reference, notes]);

  // ⚠️ PROBLEMA: Marca TODAS las comisiones pendientes como pagadas
  // Sin importar si $amount cubre el total
  await pool.query(`
    UPDATE promoter_sales
    SET commission_status = 'paid', paid_at = NOW()
    WHERE promoter_id = $1 AND commission_status = 'pending'
  `, [promoterId]);

  return res.json({
    success: true,
    payout: payoutResult.rows[0],
    message: 'Payout created and commissions marked as paid'
  });
}
```

**Escenario de Problema:**

```
Estado Inicial:
┌──────────────────────────────────────────────────────────────┐
│ Promoter: Juan                                                │
│ Comisiones Pendientes:                                        │
│   - Venta 1: $500 comisión                                   │
│   - Venta 2: $300 comisión                                   │
│   - Venta 3: $200 comisión                                   │
│   TOTAL PENDIENTE: $1,000                                    │
└──────────────────────────────────────────────────────────────┘

Acción: Payout de $100

Estado Final (INCORRECTO):
┌──────────────────────────────────────────────────────────────┐
│ Promoter: Juan                                                │
│ Payouts: $100                                                 │
│ Comisiones Pagadas: $1,000 ← TODAS marcadas como pagadas     │
│ PÉRDIDA: $900 que nunca se pagarán                           │
└──────────────────────────────────────────────────────────────┘
```

**Impacto:**

| Escenario | Pérdida Potencial |
|-----------|-------------------|
| Pago parcial por error administrativo | Total de comisiones pendientes |
| Pago de prueba de $1 | Todas las comisiones del promotor |
| Error de tipeo ($100 en lugar de $1000) | $900 no contabilizados |

**Remediación:**

```javascript
case 'payout': {
  if (!promoterId) return res.status(400).json({ error: 'promoterId required' });
  const { amount, paymentMethod, reference, notes, salesIds } = data || {};

  if (!amount || !paymentMethod) {
    return res.status(400).json({ error: 'amount and paymentMethod required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Obtener total pendiente
    const pendingResult = await client.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(commission_amount), 0) as total
      FROM promoter_sales
      WHERE promoter_id = $1 AND commission_status = 'pending'
    `, [promoterId]);

    const pendingTotal = parseFloat(pendingResult.rows[0].total);
    const payoutAmount = parseFloat(amount);

    // Opción A: Rechazar si el pago no cubre todo
    if (payoutAmount < pendingTotal) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Payout amount insufficient',
        pendingTotal,
        payoutAmount,
        shortfall: pendingTotal - payoutAmount
      });
    }

    // Opción B: Permitir pagos parciales con tracking
    // Solo marcar como pagadas las ventas cubiertas por el monto
    if (salesIds && salesIds.length > 0) {
      // Marcar solo las ventas específicas
      const salesTotal = await client.query(`
        SELECT SUM(commission_amount) as total
        FROM promoter_sales
        WHERE id = ANY($1) AND promoter_id = $2 AND commission_status = 'pending'
      `, [salesIds, promoterId]);

      if (parseFloat(salesTotal.rows[0].total) > payoutAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payout does not cover selected sales' });
      }

      await client.query(`
        UPDATE promoter_sales
        SET commission_status = 'paid', paid_at = NOW(), payout_id = $1
        WHERE id = ANY($2) AND promoter_id = $3 AND commission_status = 'pending'
      `, [payoutId, salesIds, promoterId]);
    }

    // Registrar payout con referencia a qué se pagó
    const payoutResult = await client.query(`
      INSERT INTO promoter_payouts (
        promoter_id, amount, payment_method, reference, notes,
        status, paid_at, sales_count, commission_total
      )
      VALUES ($1, $2, $3, $4, $5, 'completed', NOW(), $6, $7)
      RETURNING *
    `, [promoterId, amount, paymentMethod, reference, notes, salesCount, commissionTotal]);

    await client.query('COMMIT');

    return res.json({
      success: true,
      payout: payoutResult.rows[0],
      salesMarkedPaid: salesCount,
      totalCommissionPaid: commissionTotal
    });

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**Esfuerzo Estimado:** M (Medium) - 2-3 días

---

#### ALTA-04: ENCRYPTION KEY GENERADA DINÁMICAMENTE SI NO EXISTE

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-04 |
| **Severidad** | 🟠 ALTA |
| **Área** | Seguridad |
| **Estado** | Activo |

**Descripción:**

Si la variable de entorno `ENCRYPTION_KEY` no está configurada, el sistema genera una clave aleatoria en cada reinicio del servidor. Esto significa que todos los datos encriptados previamente (API keys de integraciones) se vuelven irrecuperables.

**Ubicación:**
```
Archivo: server/index.js
Línea: 85
```

**Código Afectado:**
```javascript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
```

**Escenario de Problema:**

```
Día 1: Servidor inicia sin ENCRYPTION_KEY
├── Se genera KEY_ABC123
├── Usuario conecta Eventbrite
└── API key encriptada con KEY_ABC123

Día 2: Servidor reinicia (deploy, crash, etc.)
├── Se genera KEY_XYZ789 (diferente)
├── Usuario intenta usar Eventbrite
└── ❌ Decryption falla - datos corruptos

Resultado: Todas las integraciones dejan de funcionar
```

**Impacto:**

| Escenario | Consecuencia |
|-----------|--------------|
| Reinicio del servidor | Pérdida de todas las API keys encriptadas |
| Escalado horizontal (múltiples instancias) | Cada instancia tiene key diferente |
| Migración/deploy | Integraciones rotas silenciosamente |

**Remediación:**

```javascript
// Validar que existe antes de arrancar
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error('═══════════════════════════════════════════════════');
  console.error('FATAL ERROR: ENCRYPTION_KEY environment variable not set');
  console.error('');
  console.error('This key is required to encrypt/decrypt sensitive data.');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('');
  console.error('Then set it in your environment:');
  console.error('  export ENCRYPTION_KEY=your_generated_key');
  console.error('═══════════════════════════════════════════════════');
  process.exit(1);
}

if (ENCRYPTION_KEY.length !== 32) {
  console.error('FATAL ERROR: ENCRYPTION_KEY must be exactly 32 characters');
  process.exit(1);
}
```

**Esfuerzo Estimado:** S (Small) - 1-2 horas

---

#### ALTA-05: SIN AUDIT LOG PARA OPERACIONES FINANCIERAS

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-05 |
| **Severidad** | 🟠 ALTA |
| **Área** | Negocio / Auditoría |
| **Estado** | Activo |

**Descripción:**

El sistema tiene una tabla `activity_log` pero prácticamente no se usa para operaciones críticas. Solo hay 6 inserciones en todo el código, todas relacionadas con sincronización de Eventbrite. Las operaciones financieras (payouts, ajustes de comisión, cambios de presupuesto) no dejan rastro auditable.

**Evidencia:**

```bash
# Búsqueda de inserciones en activity_log
grep -c "INSERT INTO activity_log" server/index.js
# Resultado: 1 (solo sync de Eventbrite)

grep -c "INSERT INTO eventbrite_sync_log" server/index.js
# Resultado: 5 (solo sync logs)
```

**Operaciones SIN Auditoría:**

| Operación | Riesgo |
|-----------|--------|
| Crear/modificar payout | No hay registro de quién pagó qué |
| Ajustar comisión de promotor | Cambios silenciosos |
| Modificar presupuesto | Alteraciones sin rastro |
| Eliminar eventos/guests/staff | Borrado sin evidencia |
| Cambiar permisos de usuario | Escalación de privilegios oculta |
| Modificar contratos de vendor | Cambios en acuerdos |

**Impacto:**

1. **Fraude Interno:** Empleados pueden manipular comisiones sin detección
2. **Disputas Legales:** Sin evidencia de quién hizo qué y cuándo
3. **Cumplimiento:** Posibles violaciones de normativas financieras
4. **Debugging:** Imposible rastrear origen de inconsistencias

**Remediación:**

```javascript
// Crear función de auditoría reutilizable
async function auditLog(client, {
  userId,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  metadata = {}
}) {
  await client.query(`
    INSERT INTO audit_log (
      user_id, action, entity_type, entity_id,
      old_value, new_value, metadata,
      ip_address, user_agent, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `, [
    userId,
    action,
    entityType,
    entityId,
    JSON.stringify(oldValue),
    JSON.stringify(newValue),
    JSON.stringify(metadata),
    metadata.ip,
    metadata.userAgent
  ]);
}

// Uso en operaciones críticas
case 'payout': {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ... lógica de payout ...

    // Registrar auditoría
    await auditLog(client, {
      userId: req.user.id,
      action: 'PROMOTER_PAYOUT_CREATED',
      entityType: 'promoter_payout',
      entityId: payoutResult.rows[0].id,
      oldValue: { pendingCommissions: pendingTotal },
      newValue: { payoutAmount: amount, salesMarkedPaid: salesCount },
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        promoterId,
        paymentMethod
      }
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
```

**Esquema de tabla de auditoría mejorado:**
```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para queries comunes
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

**Esfuerzo Estimado:** M (Medium) - 3-5 días

---

#### ALTA-06: DELETE SIN SOFT DELETE - PÉRDIDA DE DATOS PERMANENTE

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-06 |
| **Severidad** | 🟠 ALTA |
| **Área** | Datos / Negocio |
| **Estado** | Activo |

**Descripción:**

Todas las operaciones de eliminación en el sistema son destructivas (hard delete). No existe mecanismo de soft delete que permita recuperar datos borrados por error o mantener historial para auditoría.

**Ejemplos de Hard Delete:**

```javascript
// Línea 3003: Eliminar guest
const result = await pool.query('DELETE FROM guests WHERE id = $1 RETURNING *', [id]);

// Línea 6774: Eliminar promotor
await pool.query('DELETE FROM promoters WHERE id = $1', [promoterId]);

// Línea 5248: Eliminar sponsor
const result = await pool.query('DELETE FROM sponsors WHERE id = $1 RETURNING *', [id]);

// Línea 4674: Eliminar TODOS los tickets
const result = await pool.query('DELETE FROM tickets RETURNING id');

// Línea 4748: Eliminar TODOS los eventos
const result = await pool.query('DELETE FROM events RETURNING id');
```

**Impacto:**

| Escenario | Consecuencia |
|-----------|--------------|
| Error de usuario al borrar | Datos irrecuperables |
| Script malicioso ejecutado | Pérdida total de datos |
| Borrado accidental de promotor con ventas | Historial financiero huérfano |
| Requisito legal de retención | Imposible cumplir |

**Remediación:**

1. **Agregar columna de soft delete:**
```sql
ALTER TABLE guests ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE promoters ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sponsors ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE events ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE staff ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
-- etc.

CREATE INDEX idx_guests_deleted ON guests(deleted_at) WHERE deleted_at IS NULL;
```

2. **Modificar queries de delete:**
```javascript
// Antes (hard delete)
await pool.query('DELETE FROM guests WHERE id = $1', [id]);

// Después (soft delete)
await pool.query(
  'UPDATE guests SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
  [id]
);
```

3. **Modificar queries de select:**
```javascript
// Antes
const result = await pool.query('SELECT * FROM guests WHERE user_id = $1', [userId]);

// Después
const result = await pool.query(
  'SELECT * FROM guests WHERE user_id = $1 AND deleted_at IS NULL',
  [userId]
);
```

4. **Agregar endpoint de restauración:**
```javascript
app.post('/api/v1/guests/:id/restore', requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'UPDATE guests SET deleted_at = NULL WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Guest not found or not deleted' });
  }
  res.json({ success: true, guest: result.rows[0] });
});
```

**Esfuerzo Estimado:** M (Medium) - 3-5 días

---

#### ALTA-07: CONDICIÓN DE CARRERA EN CONTADOR DE PROMOTOR

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-07 |
| **Severidad** | 🟠 ALTA |
| **Área** | Datos / Concurrencia |
| **Estado** | Activo |

**Descripción:**

El sistema actualiza contadores denormalizados (total_sales, total_commission, total_tickets_sold) usando operaciones de incremento sin protección contra concurrencia. En escenarios de alta carga, múltiples transacciones simultáneas pueden causar pérdida de incrementos.

**Código Afectado:**
```javascript
// Línea 6792
await pool.query(`
  UPDATE promoters SET
    total_sales = total_sales + $1,
    total_commission = total_commission + $2,
    total_tickets_sold = total_tickets_sold + 1
  WHERE id = $3
`, [saleAmount, commissionAmount, promoter.id]);
```

**Escenario de Race Condition:**

```
Tiempo    Thread A                    Thread B
──────────────────────────────────────────────────────────────
T0        READ total_sales = 1000
T1                                    READ total_sales = 1000
T2        WRITE 1000 + 100 = 1100
T3                                    WRITE 1000 + 50 = 1050  ← SOBREESCRIBE
T4
          Esperado: 1150
          Actual: 1050
          Pérdida: $100
```

**Impacto:**

En un escenario con 1000 ventas concurrentes, la pérdida estadística podría ser del 5-10% de las transacciones, resultando en:
- Reportes de ventas incorrectos
- Comisiones mal calculadas
- Desconfianza en los datos del sistema

**Remediación:**

**Opción 1: SELECT FOR UPDATE (Lock pessimista)**
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Bloquear el registro del promotor
  const promoter = await client.query(
    'SELECT * FROM promoters WHERE id = $1 FOR UPDATE',
    [promoterId]
  );

  // Actualizar con valores calculados
  await client.query(`
    UPDATE promoters SET
      total_sales = $1,
      total_commission = $2,
      total_tickets_sold = $3
    WHERE id = $4
  `, [
    parseFloat(promoter.rows[0].total_sales) + saleAmount,
    parseFloat(promoter.rows[0].total_commission) + commissionAmount,
    promoter.rows[0].total_tickets_sold + 1,
    promoterId
  ]);

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

**Opción 2: Eliminar denormalización (mejor a largo plazo)**
```sql
-- Crear vista para calcular totales en tiempo real
CREATE VIEW promoter_totals AS
SELECT
  p.id,
  p.name,
  COALESCE(SUM(ps.sale_amount), 0) as total_sales,
  COALESCE(SUM(ps.commission_amount), 0) as total_commission,
  COUNT(ps.id) as total_tickets_sold
FROM promoters p
LEFT JOIN promoter_sales ps ON p.id = ps.promoter_id
GROUP BY p.id;

-- O vista materializada para rendimiento
CREATE MATERIALIZED VIEW promoter_totals_mv AS
SELECT ...
WITH DATA;

-- Refrescar periódicamente
REFRESH MATERIALIZED VIEW CONCURRENTLY promoter_totals_mv;
```

**Esfuerzo Estimado:** M (Medium) - 2-3 días

---

#### ALTA-08: VALIDACIÓN DE REDIRECT URI INSEGURA

| Campo | Valor |
|-------|-------|
| **ID** | ALTA-08 |
| **Severidad** | 🟠 ALTA |
| **Área** | Seguridad / OAuth |
| **Estado** | Activo |

**Descripción:**

La validación de redirect_uri en el flujo OAuth permite cualquier URL que contenga ciertas strings como substring, en lugar de validar la URL completa. Esto permite ataques de redirección abierta que podrían robar tokens OAuth.

**Ubicación:**
```
Archivo: server/index.js
Líneas: 2052-2055
```

**Código Afectado:**
```javascript
const isValidRedirectUri = (uri) => {
  if (!uri) return true; // ⚠️ Permite vacío
  return ALLOWED_REDIRECT_URIS.some(allowed =>
    uri.startsWith(allowed) ||
    uri.includes('chat.openai.com') ||  // ⚠️ Substring match
    uri.includes('chatgpt.com') ||       // ⚠️ Substring match
    uri.includes('localhost')            // ⚠️ Substring match
  );
};
```

**Vectores de Ataque:**

| URI Maliciosa | Bypass |
|---------------|--------|
| `https://evil.com?redirect=localhost` | Contiene "localhost" |
| `https://localhost.evil.com/steal` | Contiene "localhost" |
| `https://chatgpt.com.evil.com` | Contiene "chatgpt.com" |
| `https://evil.com/chat.openai.com/` | Contiene "chat.openai.com" |

**Escenario de Ataque:**
```
1. Atacante crea: https://evil.com?x=localhost
2. Víctima hace click en link OAuth con redirect_uri=https://evil.com?x=localhost
3. Sistema valida: "localhost" está presente ✓
4. Usuario se autentica
5. Token enviado a https://evil.com
6. Atacante captura token
```

**Remediación:**

```javascript
// Lista blanca estricta de dominios permitidos
const ALLOWED_REDIRECT_DOMAINS = new Set([
  'localhost',
  'localhost:3000',
  'localhost:5173',
  '127.0.0.1',
  '127.0.0.1:3000',
  'chat.openai.com',
  'chatgpt.com',
  'berry-dashboard.railway.app',
  'berrybly.com'
]);

const isValidRedirectUri = (uri) => {
  if (!uri) {
    return false; // No permitir vacío
  }

  try {
    const url = new URL(uri);
    const hostWithPort = url.port ? `${url.hostname}:${url.port}` : url.hostname;

    // Verificar que el protocolo sea válido
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    // Solo permitir http para localhost
    if (url.protocol === 'http:' && !url.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      return false;
    }

    // Verificar dominio exacto
    return ALLOWED_REDIRECT_DOMAINS.has(url.hostname) ||
           ALLOWED_REDIRECT_DOMAINS.has(hostWithPort);

  } catch (e) {
    // URL inválida
    return false;
  }
};
```

**Esfuerzo Estimado:** S (Small) - 2-4 horas

---

### 5.3 SEVERIDAD MEDIA

---

#### MEDIA-01: SIN LÍMITE DE RATE PARA ENDPOINTS SENSIBLES

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-01 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Seguridad |

**Descripción:**
No existe rate limiting en ningún endpoint del sistema.

**Impacto:**
- Vulnerable a ataques de fuerza bruta en login
- DoS posible en endpoints costosos (GPT, sync)
- Abuso de recursos

**Remediación:**
```javascript
import rateLimit from 'express-rate-limit';

// Rate limit general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100
});

// Rate limit estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts' }
});

app.use('/api/', generalLimiter);
app.use('/oauth/login', authLimiter);
app.use('/api/v1/gpt/', rateLimit({ windowMs: 60000, max: 10 }));
```

**Esfuerzo:** S

---

#### MEDIA-02: TOKENS SIN EXPIRACIÓN EXPLÍCITA AL CREAR

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-02 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Seguridad |

**Descripción:**
Los tokens OAuth no tienen una política de expiración consistente.

**Remediación:**
Establecer expiración máxima de 30 días e implementar refresh token flow.

**Esfuerzo:** M

---

#### MEDIA-03: ERROR HANDLING INCONSISTENTE

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-03 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Seguridad / UX |

**Descripción:**
Algunos endpoints exponen error.message directamente, revelando información interna.

**Remediación:**
```javascript
// Middleware de error centralizado
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Solo en desarrollo mostrar detalles
  const response = {
    error: 'An error occurred',
    code: err.code || 'INTERNAL_ERROR'
  };

  if (process.env.NODE_ENV === 'development') {
    response.details = err.message;
    response.stack = err.stack;
  }

  res.status(err.status || 500).json(response);
});
```

**Esfuerzo:** S

---

#### MEDIA-04: MONOLITO DE 16,000+ LÍNEAS

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-04 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Mantenibilidad |

**Descripción:**
`server/index.js` contiene toda la lógica en un solo archivo de 641KB.

**Impacto:**
- Difícil de mantener
- Code review imposible
- Alto riesgo de regresiones

**Remediación:**
Separar en módulos:
```
server/
├── index.js (entry point, ~100 líneas)
├── middleware/
│   ├── auth.js
│   ├── errorHandler.js
│   └── rateLimit.js
├── routes/
│   ├── auth.js
│   ├── guests.js
│   ├── events.js
│   ├── promoters.js
│   └── ...
├── services/
│   ├── email.js
│   ├── sms.js
│   └── eventbrite.js
└── db/
    ├── pool.js
    └── migrations/
```

**Esfuerzo:** L

---

#### MEDIA-05: UPLOADS SIN VALIDACIÓN DE CONTENIDO REAL

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-05 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Seguridad |

**Descripción:**
La validación de uploads solo verifica MIME type y extensión, no el contenido real del archivo.

**Remediación:**
```javascript
import { fileTypeFromBuffer } from 'file-type';

const validateFileContent = async (buffer, declaredMime) => {
  const detected = await fileTypeFromBuffer(buffer);

  if (!detected) {
    throw new Error('Could not detect file type');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedTypes.includes(detected.mime)) {
    throw new Error(`File type ${detected.mime} not allowed`);
  }

  return detected;
};
```

**Esfuerzo:** S

---

#### MEDIA-06: COMISIONES SIN VALIDACIÓN DE RANGO

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-06 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Negocio |

**Descripción:**
El campo `commission_rate` acepta cualquier valor sin validación de límites.

**Remediación:**
```sql
ALTER TABLE promoters
  ADD CONSTRAINT chk_commission_rate
  CHECK (commission_rate >= 0 AND commission_rate <= 100);
```

**Esfuerzo:** S

---

#### MEDIA-07: BUDGET ITEMS SIN VALIDACIÓN DE MONTOS

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-07 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Negocio |

**Descripción:**
Los montos de presupuesto pueden ser negativos.

**Remediación:**
```sql
ALTER TABLE budget_items
  ADD CONSTRAINT chk_amounts_positive
  CHECK (estimated_amount >= 0 AND (actual_amount IS NULL OR actual_amount >= 0));
```

**Esfuerzo:** S

---

#### MEDIA-08: MÚLTIPLES TABLAS CON DATOS DUPLICADOS

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-08 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Datos |

**Descripción:**
`promoters.total_sales` se mantiene manualmente vs `SUM(promoter_sales.sale_amount)`.

**Remediación:**
Usar triggers o vistas materializadas para mantener sincronía automática.

**Esfuerzo:** M

---

#### MEDIA-09: ESTADOS SIN MÁQUINA DE ESTADOS DEFINIDA

| Campo | Valor |
|-------|-------|
| **ID** | MEDIA-09 |
| **Severidad** | 🟡 MEDIA |
| **Área** | Negocio |

**Descripción:**
Los estados se cambian sin validar transiciones válidas.

**Remediación:**
```javascript
const STATE_MACHINES = {
  promoter_sale: {
    pending: ['paid', 'cancelled'],
    paid: [],  // Estado final
    cancelled: []  // Estado final
  }
};

function validateTransition(entity, currentState, newState) {
  const machine = STATE_MACHINES[entity];
  if (!machine) throw new Error(`No state machine for ${entity}`);

  const allowed = machine[currentState];
  if (!allowed || !allowed.includes(newState)) {
    throw new Error(`Invalid transition: ${currentState} -> ${newState}`);
  }
}
```

**Esfuerzo:** M

---

### 5.4 SEVERIDAD BAJA

---

#### BAJA-01: TIMESTAMPS SIN TIMEZONE

| Campo | Valor |
|-------|-------|
| **ID** | BAJA-01 |
| **Severidad** | 🟢 BAJA |
| **Área** | Datos |

**Descripción:**
Las columnas TIMESTAMP no especifican timezone.

**Remediación:**
Usar `TIMESTAMP WITH TIME ZONE` (TIMESTAMPTZ).

**Esfuerzo:** M

---

#### BAJA-02: ÍNDICES FALTANTES EN QUERIES FRECUENTES

| Campo | Valor |
|-------|-------|
| **ID** | BAJA-02 |
| **Severidad** | 🟢 BAJA |
| **Área** | Rendimiento |

**Descripción:**
Algunas columnas usadas en WHERE carecen de índice.

**Remediación:**
Ejecutar EXPLAIN ANALYZE y agregar índices necesarios.

**Esfuerzo:** S

---

#### BAJA-03: UI - ESTADOS DE CARGA INCONSISTENTES

| Campo | Valor |
|-------|-------|
| **ID** | BAJA-03 |
| **Severidad** | 🟢 BAJA |
| **Área** | UX |

**Descripción:**
El loading state es global, mostrando pantalla completa de carga para operaciones pequeñas.

**Remediación:**
Implementar loading states granulares por operación.

**Esfuerzo:** S

---

## 6. MATRIZ DE RIESGOS

```
                    IMPACTO
         Bajo    Medio    Alto    Crítico
       ┌────────┬────────┬────────┬────────┐
Muy    │        │        │ ALTA-06│BLOCKER │
Alta   │        │        │ ALTA-07│  -01   │
       │        │        │        │BLOCKER │
       │        │        │        │  -02   │
       ├────────┼────────┼────────┼────────┤
       │        │ MEDIA  │ ALTA-01│BLOCKER │
Alta   │        │ -04    │ ALTA-02│  -03   │
P      │        │ MEDIA  │ ALTA-03│ ALTA-04│
R      │        │ -08    │ ALTA-05│ ALTA-08│
O      ├────────┼────────┼────────┼────────┤
B      │ BAJA   │ MEDIA  │ MEDIA  │        │
A      │ -03    │ -01    │ -05    │        │
B      │        │ MEDIA  │ MEDIA  │        │
I      │        │ -02    │ -06    │        │
L      │        │ MEDIA  │ MEDIA  │        │
I      │        │ -03    │ -07    │        │
D      ├────────┼────────┼────────┼────────┤
A      │ BAJA   │ BAJA   │ MEDIA  │        │
D      │ -01    │ -02    │ -09    │        │
Baja   │        │        │        │        │
       └────────┴────────┴────────┴────────┘
```

---

## 7. PLAN DE REMEDIACIÓN PRIORIZADO

### 7.1 Fase 1: Críticos (24-48 horas)

| # | ID | Acción | Responsable | Estado |
|---|-----|--------|-------------|--------|
| 1 | BLOCKER-01 | Rotar API key de Telnyx, mover a env vars | DevOps | ⬜ Pendiente |
| 2 | BLOCKER-02 | Implementar middleware de auth restrictivo | Backend | ⬜ Pendiente |
| 3 | BLOCKER-03 | Refactorizar health check sin interpolación SQL | Backend | ⬜ Pendiente |

### 7.2 Fase 2: Alta Prioridad (Semana 1-2)

| # | ID | Acción | Responsable | Estado |
|---|-----|--------|-------------|--------|
| 4 | ALTA-04 | Validar ENCRYPTION_KEY en startup | Backend | ⬜ Pendiente |
| 5 | ALTA-08 | Corregir validación de redirect URI | Backend | ⬜ Pendiente |
| 6 | ALTA-03 | Corregir lógica de payout | Backend | ⬜ Pendiente |
| 7 | ALTA-02 | Envolver operaciones financieras en transacciones | Backend | ⬜ Pendiente |
| 8 | ALTA-05 | Implementar audit logging para operaciones críticas | Backend | ⬜ Pendiente |

### 7.3 Fase 3: Mejoras (Mes 1)

| # | ID | Acción | Responsable | Estado |
|---|-----|--------|-------------|--------|
| 9 | ALTA-06 | Implementar soft delete | Backend | ⬜ Pendiente |
| 10 | ALTA-07 | Corregir race conditions en contadores | Backend | ⬜ Pendiente |
| 11 | ALTA-01 | Agregar foreign key constraints | DBA | ⬜ Pendiente |
| 12 | MEDIA-01 | Implementar rate limiting | Backend | ⬜ Pendiente |
| 13 | MEDIA-04 | Refactorizar monolito en módulos | Backend | ⬜ Pendiente |

---

## 8. PRUEBAS DE VALIDACIÓN

### 8.1 Tests Automatizados Recomendados

```javascript
// tests/security/auth.test.js
describe('Authentication', () => {
  it('should reject requests without token to protected endpoints', async () => {
    const res = await request(app).get('/api/v1/guests');
    expect(res.status).toBe(401);
  });

  it('should reject invalid tokens', async () => {
    const res = await request(app)
      .get('/api/v1/guests')
      .set('Authorization', 'Bearer invalid_token');
    expect(res.status).toBe(401);
  });
});

// tests/security/sql-injection.test.js
describe('SQL Injection Prevention', () => {
  it('should not allow table name injection in health check', async () => {
    const res = await request(app)
      .get('/api/v1/health?table=users;DROP TABLE users;--');
    expect(res.status).not.toBe(500);
    // Verificar que la tabla users sigue existiendo
  });
});

// tests/financial/payout.test.js
describe('Payout Logic', () => {
  it('should not mark all commissions as paid for partial payout', async () => {
    // Setup: Crear promotor con $1000 en comisiones pendientes
    // Action: Intentar payout de $100
    // Assert: Debería fallar o solo marcar $100 como pagado
  });
});
```

### 8.2 Queries de Verificación

```sql
-- Verificar que no hay API keys en código
-- (Ejecutar en CI/CD)
-- grep -r "KEY0" . debe retornar vacío

-- Verificar integridad de comisiones
SELECT
  p.id,
  p.name,
  p.total_commission as stored_total,
  COALESCE(SUM(ps.commission_amount), 0) as calculated_total,
  ABS(p.total_commission - COALESCE(SUM(ps.commission_amount), 0)) as difference
FROM promoters p
LEFT JOIN promoter_sales ps ON p.id = ps.promoter_id
GROUP BY p.id
HAVING ABS(p.total_commission - COALESCE(SUM(ps.commission_amount), 0)) > 0.01;
-- Debe retornar 0 filas

-- Verificar datos huérfanos
SELECT 'event_timeline' as table_name, COUNT(*) as orphans
FROM event_timeline WHERE event_id NOT IN (SELECT id FROM events)
UNION ALL
SELECT 'guests', COUNT(*)
FROM guests WHERE event_id IS NOT NULL AND event_id NOT IN (SELECT id FROM events)
UNION ALL
SELECT 'staff_assignments', COUNT(*)
FROM staff_assignments WHERE staff_id NOT IN (SELECT id FROM staff);
-- Todas las filas deben tener orphans = 0

-- Verificar payouts vs comisiones pagadas
SELECT
  pp.promoter_id,
  SUM(pp.amount) as total_paid_out,
  (SELECT SUM(commission_amount)
   FROM promoter_sales
   WHERE promoter_id = pp.promoter_id AND commission_status = 'paid') as commissions_marked_paid
FROM promoter_payouts pp
GROUP BY pp.promoter_id
HAVING SUM(pp.amount) != (
  SELECT SUM(commission_amount)
  FROM promoter_sales
  WHERE promoter_id = pp.promoter_id AND commission_status = 'paid'
);
-- Debe retornar 0 filas (payouts deben igualar comisiones marcadas como pagadas)
```

---

## 9. CONCLUSIONES

### 9.1 Estado Actual

El sistema Berry Dashboard presenta vulnerabilidades de seguridad críticas que requieren atención inmediata. Los tres hallazgos bloqueantes (API key expuesta, autenticación permisiva, y patrones de SQL injection) representan riesgos activos que podrían resultar en:

- Compromiso de credenciales de terceros
- Acceso no autorizado a datos de clientes
- Posible pérdida de datos

### 9.2 Riesgo Financiero

El módulo de comisiones de promotores maneja flujos financieros significativos (tiers hasta $35,000+) sin los controles adecuados:

- Operaciones no atómicas pueden causar inconsistencias
- Payouts parciales pueden marcar todo como pagado
- Sin audit trail para disputas

### 9.3 Recomendaciones Inmediatas

1. **DETENER** cualquier operación de payout hasta corregir ALTA-03
2. **ROTAR** inmediatamente la API key de Telnyx (BLOCKER-01)
3. **IMPLEMENTAR** middleware de autenticación restrictivo (BLOCKER-02)
4. **AUDITAR** manualmente los últimos 30 días de payouts para verificar inconsistencias

### 9.4 Próximos Pasos

1. Programar sesión de trabajo para remediación de blockers (24-48h)
2. Crear tickets/issues para cada hallazgo
3. Establecer métricas de seguimiento
4. Programar re-auditoría en 30 días

---

## 10. ANEXOS

### 10.1 Glosario

| Término | Definición |
|---------|------------|
| **Hard Delete** | Eliminación permanente de registros de la base de datos |
| **Soft Delete** | Marcado de registros como eliminados sin borrarlos físicamente |
| **Race Condition** | Situación donde el resultado depende del timing de operaciones concurrentes |
| **FK (Foreign Key)** | Constraint que garantiza integridad referencial entre tablas |
| **Transacción Atómica** | Conjunto de operaciones que se ejecutan todas o ninguna |

### 10.2 Referencias

- OWASP Top 10 2021: https://owasp.org/Top10/
- PostgreSQL Security Best Practices: https://www.postgresql.org/docs/current/security.html
- Express.js Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html

### 10.3 Historial de Revisiones

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-01-16 | Sistema de Auditoría | Documento inicial |

---

**FIN DEL DOCUMENTO**

*Este documento contiene información confidencial sobre vulnerabilidades de seguridad. Distribuir solo a personal autorizado.*
