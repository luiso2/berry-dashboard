# Berry Dashboard Backend - Refactored Architecture

## 🏗️ Nueva Estructura Modular

El backend ha sido refactorizado de un monolito de **17,600+ líneas** a una arquitectura modular escalable.

### Árbol de Directorios

```
server/
├── index.js                    # Original (mantener mientras se migra)
├── index-refactored.js         # Nuevo punto de entrada refactorizado
├── config.js                   # Configuración centralizada
├── package.json
│
├── middleware/
│   └── auth.js                 # Autenticación y autorización
│
├── modules/                    # Módulos de funcionalidad
│   ├── auth.js                 # Rutas OAuth 2.0
│   └── guests.js               # Rutas de gestión de invitados
│
├── utils/                      # Funciones reutilizables
│   ├── database.js             # Configuración de pool PostgreSQL
│   ├── dbInit.js               # Inicialización de tablas
│   ├── encryption.js           # Encriptación de claves API
│   ├── password.js             # Hash y validación de contraseñas
│   ├── email.js                # Integración con Resend
│   ├── sms.js                  # Integración con Telnyx
│   ├── upload.js               # Configuración de multer
│   └── validators.js           # Validadores generales
│
└── uploads/                    # Archivos subidos por usuarios
```

## 📦 Módulos Principales

### 1. **Autenticación** (`modules/auth.js`)
- Endpoints OAuth 2.0
- Login y registro
- Generación de tokens
- Validación de códigos de autorización

**Rutas:**
- `GET /oauth/authorize` - Página de autorización
- `POST /oauth/login` - Login de usuario
- `POST /oauth/register` - Registro de usuario
- `POST /oauth/token` - Intercambio de token

### 2. **Gestión de Invitados** (`modules/guests.js`)
- CRUD de invitados
- Envío de invitaciones
- Categorización de invitados
- Tracking de estado

**Rutas:**
- `GET /api/v1/guests` - Listar invitados
- `POST /api/v1/guests` - Crear invitado
- `PUT /api/v1/guests/:id` - Actualizar invitado
- `DELETE /api/v1/guests/:id` - Eliminar invitado
- `POST /api/v1/guests/:id/send-invitation` - Enviar invitación

## 🔐 Utilidades

### Encriptación (`utils/encryption.js`)
- AES-256-CBC para claves API
- Funciones: `encryptApiKey()`, `decryptApiKey()`, `maskApiKey()`

### Contraseñas (`utils/password.js`)
- Bcrypt para hash seguro
- Soporte legado SHA256
- Funciones: `hashPassword()`, `comparePassword()`, `generateToken()`

### Base de Datos (`utils/database.js`)
- Pool PostgreSQL centralizado
- Funciones: `initializePool()`, `getPool()`, `closePool()`

### Email (`utils/email.js`)
- Integración con Resend
- Tracking de eventos de email
- Confirmaciones administrativas

### SMS (`utils/sms.js`)
- Integración con Telnyx API
- Formateo automático de números

## 🚀 Migración

### Paso 1: Usar el Nuevo Servidor
```bash
# Cambiar punto de entrada en package.json
"scripts": {
  "start": "node index-refactored.js",
  "dev": "node --watch index-refactored.js"
}
```

### Paso 2: Variables de Entorno Requeridas
```bash
DATABASE_URL=postgres://...
RESEND_API_KEY=re_...
TELNYX_API_KEY=...
ENCRYPTION_KEY=<32 caracteres hexadecimales>
ADMIN_EMAIL=admin@example.com
PORT=8080
```

### Paso 3: Mantener Compatibilidad
- El `index.js` original sigue disponible
- Migrar módulos gradualmente
- Pruebas exhaustivas antes de cambiar a producción

## 📊 Beneficios de la Refactorización

| Aspecto | Antes | Después |
|--------|-------|--------|
| **Líneas de código** | 17,600+ | ~300 (index) + módulos especializados |
| **Mantenibilidad** | Baja | Alta |
| **Testabilidad** | Difícil | Fácil (cada módulo aislado) |
| **Escalabilidad** | Limitada | Alta (agregar módulos nuevos fácil) |
| **Reutilización** | Baja | Alta (utilidades comunes) |

## 🔄 Flujo de Datos Típico

```
Request → CORS & Auth Middleware
  ↓
Route Handler (módulo específico)
  ↓
Utilidad (database, email, etc.)
  ↓
Response
```

## 📝 Próximos Pasos

1. **Crear módulos faltantes:**
   - `modules/events.js` - Gestión de eventos
   - `modules/tickets.js` - Gestión de tickets
   - `modules/sponsors.js` - Gestión de patrocinadores
   - `modules/eventbrite.js` - Sincronización Eventbrite

2. **Mejorar validación:**
   - Crear validadores de entrada
   - Middleware de validación

3. **Logging y Monitoreo:**
   - Sistema de logging centralizado
   - Tracking de errores

4. **Testing:**
   - Tests unitarios para módulos
   - Tests de integración

## 🛠️ Desarrollo

Para crear un nuevo módulo:

```javascript
// modules/my-feature.js
import express from 'express';

export const createMyFeatureRoutes = (pool) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    // Tu lógica aquí
  });

  return router;
};
```

Luego agregarlo en `index-refactored.js`:

```javascript
import { createMyFeatureRoutes } from './modules/my-feature.js';

const myRoutes = createMyFeatureRoutes(pool);
app.use('/api/v1/my-feature', myRoutes);
```

## 📞 Contacto

Para preguntas sobre la arquitectura, consultar la documentación de cada módulo.
