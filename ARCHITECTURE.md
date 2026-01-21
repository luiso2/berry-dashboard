# Arquitectura Refactorizada - Berry Dashboard Backend

## 📐 Visión General

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MIDDLEWARE LAYER                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  CORS Handler    │  │ Auth Middleware  │  │ JSON Parser  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ROUTING LAYER                                 │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ Auth Routes    │  │ Guest Routes    │  │ [Future Routes]  │ │
│  │ (OAuth 2.0)    │  │ (CRUD)          │  │ (Events, etc)    │ │
│  └────────────────┘  └─────────────────┘  └──────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              UTILITIES (Reutilizable)                    │   │
│  │  ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌────────┐  │   │
│  │  │Database  │ │Email   │ │SMS   │ │Crypto│ │Validate│  │   │
│  │  └──────────┘ └────────┘ └──────┘ └──────┘ └────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL   │  │ Resend (API) │  │ Telnyx (API)        │  │
│  │ (guests db)  │  │ (emails)     │  │ (SMS)               │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ Estructura de Directorios Detallada

```
server/
│
├── 📄 index-refactored.js          # Punto de entrada (nuevo)
├── 📄 index.js                     # Original (mantener)
├── 📄 config.js                    # Configuración centralizada
├── 📄 package.json
├── 📄 REFACTORING.md               # Documentación técnica
│
├── middleware/
│   └── 📄 auth.js                  # Validación de tokens, CORS
│
├── modules/                        # Lógica de negocio por dominio
│   ├── 📄 auth.js                  # OAuth 2.0, login, registro
│   └── 📄 guests.js                # Gestión de invitados
│
├── utils/                          # Funciones reutilizables
│   ├── 📄 database.js              # Pool PostgreSQL
│   ├── 📄 dbInit.js                # Creación de tablas
│   ├── 📄 encryption.js            # AES-256-CBC
│   ├── 📄 password.js              # Bcrypt + SHA256 legacy
│   ├── 📄 email.js                 # Integración Resend
│   ├── 📄 sms.js                   # Integración Telnyx
│   ├── 📄 upload.js                # Multer config
│   └── 📄 validators.js            # Validación de datos
│
└── uploads/                        # Archivos temporales
```

## 🔄 Flujo de Solicitud Típico

### 1. Registro de Usuario
```
POST /oauth/register
  │
  ├─→ Middleware: CORS, Body Parser
  │
  ├─→ Validación de entrada
  │
  ├─→ utils/password.js: hashPassword()
  │
  ├─→ utils/database.js: INSERT usuario
  │
  ├─→ Generar token
  │
  └─→ Response: { token, user }
```

### 2. Envío de Invitación
```
POST /api/v1/guests/:id/send-invitation
  │
  ├─→ Middleware: Autenticación
  │
  ├─→ modules/guests.js: Buscar invitado
  │
  ├─→ utils/email.js: sendEmail()
  │   │
  │   └─→ Resend API: enviar email
  │
  ├─→ utils/database.js: Guardar evento de email
  │
  └─→ Response: { emailId, success }
```

## 🔌 Integraciones Externas

### PostgreSQL
- **Uso**: Almacenamiento principal
- **Utilidad**: `utils/database.js`
- **Tablas**: usuarios, invitados, eventos de email, tokens

### Resend (Email)
- **Uso**: Envío de correos
- **Utilidad**: `utils/email.js`
- **Capacidades**: Tracking de entregas, webhooks

### Telnyx (SMS)
- **Uso**: Envío de mensajes SMS
- **Utilidad**: `utils/sms.js`
- **Capacidades**: Mensajería bidireccional

## 🔐 Seguridad

### Autenticación
- **Método**: Token Bearer
- **Validación**: Middleware `auth.js`
- **Duración**: 24 horas

### Contraseñas
```javascript
// Nuevo: Bcrypt (recomendado)
hashPassword(password) → $2b$12$...

// Legacy: SHA256 (solo lectura)
comparePassword(password, hash) → boolean
```

### API Keys
```javascript
// Encriptación AES-256-CBC
encryptApiKey(key) → iv:encrypted
decryptApiKey(encrypted) → key
```

## 📊 Patrones de Código

### Crear Nuevo Módulo

```javascript
// modules/my-feature.js
import express from 'express';

export const createMyFeatureRoutes = (pool) => {
  const router = express.Router();

  // GET
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM my_table');
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST
  router.post('/', async (req, res) => {
    // Tu lógica...
  });

  return router;
};
```

### Registrar en index-refactored.js

```javascript
import { createMyFeatureRoutes } from './modules/my-feature.js';

const myRoutes = createMyFeatureRoutes(pool);
app.use('/api/v1/my-feature', myRoutes);
```

## 🧪 Testing

### Test Manual (curl)

```bash
# Health check
curl http://localhost:8080/api/v1/health

# Registro
curl -X POST http://localhost:8080/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# Login
curl -X POST http://localhost:8080/oauth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'

# Listar invitados
curl http://localhost:8080/api/v1/guests \
  -H "Authorization: Bearer TOKEN"
```

### Test Unitario (Patrón)

```javascript
// tests/utils/password.test.js
import { hashPassword, comparePassword } from '../utils/password.js';

describe('Password Utils', () => {
  it('should hash password correctly', async () => {
    const hash = await hashPassword('test123');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('test123');
  });

  it('should compare password correctly', async () => {
    const password = 'test123';
    const hash = await hashPassword(password);
    const match = await comparePassword(password, hash);
    expect(match).toBe(true);
  });
});
```

## 📈 Escalabilidad

### Horizontalmente
```
┌──────────────────────┐
│  Load Balancer       │
├──────────────────────┤
│  Instance 1 (puerto 8080)
│  Instance 2 (puerto 8081)
│  Instance 3 (puerto 8082)
├──────────────────────┤
│  PostgreSQL (shared)
│  Redis (optional cache)
└──────────────────────┘
```

### Verticalmente
- Agregar módulos sin afectar otros
- Separar en microservicios si es necesario
- Usar caching en capas

## 🚀 Deployment

### Desarrollo
```bash
npm install
npm run dev
```

### Producción
```bash
npm install --only=production
npm start
```

### Docker (Futuro)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install --only=production
EXPOSE 8080
CMD ["node", "index-refactored.js"]
```

## 📝 Checklist de Calidad

- [ ] Código sin errores de linting
- [ ] Tests unitarios pasan
- [ ] Tests de integración pasan
- [ ] Documentation completa
- [ ] Performance aceptable
- [ ] Security review completado
- [ ] Manejo de errores robusto
- [ ] Logging adecuado

## 🔮 Roadmap

### Sprint 1 (Actual)
- ✅ Refactorizar auth
- ✅ Refactorizar guests
- [ ] Testing

### Sprint 2
- [ ] Refactorizar events
- [ ] Refactorizar tickets
- [ ] Refactorizar sponsors

### Sprint 3
- [ ] Eventbrite sync
- [ ] Promoters
- [ ] Advanced analytics

---

**Última actualización**: 2026-01-20  
**Versión**: 3.15.2-refactored
