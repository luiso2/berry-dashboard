# 🐛 Reporte de Análisis de Bugs - Berry Dashboard

**Fecha:** 2026-01-20  
**Status Compilación:** ✅ BUILD SUCCESS (pero con warnings/errors)  
**Total Bugs Encontrados:** 14 principales + 10 warnings

---

## 📊 Resumen

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| 🔴 **CRÍTICO** | 1 | ⚠️ Activo |
| 🟠 **ERROR** | 9 | ⚠️ Activo |
| 🟡 **WARNING** | 10 | ⚠️ Activo |
| **TOTAL** | **20** | **Detectados** |

---

## 🔴 BUGS CRÍTICOS

### 1. React Impure Function - DashboardLayout.tsx:227
**Severidad:** CRÍTICO  
**Archivo:** [src/components/layout/DashboardLayout.tsx](src/components/layout/DashboardLayout.tsx#L227)  
**Problema:** `Date.now()` llamado durante render (función impura)  
**Línea:** 227  
**Código:**
```tsx
<span>Updated {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s ago</span>
```
**Impacto:** Re-renders inestables, violación de reglas de React  
**Solución:** Mover a useEffect o usar estado

---

### 2. setState Sincrónico en Effect - AuthContext.tsx:39
**Severidad:** CRÍTICO  
**Archivo:** [src/context/AuthContext.tsx](src/context/AuthContext.tsx#L39)  
**Problema:** `setState` sincrónico dentro de useEffect  
**Línea:** 39-42  
**Código:**
```tsx
if (storedToken && storedUser) {
  setToken(storedToken);
  setUser(JSON.parse(storedUser));
}
```
**Impacto:** Renders en cascada, problemas de rendimiento  
**Solución:** Usar callback o consolidar en un solo setState

---

## 🟠 ERRORES DE ESLINT

### 3. Fast Refresh - app/layout.tsx:5
- **Problema:** Exports no son solo componentes
- **Solución:** Mover constantes a archivo separado

### 4. Fast Refresh - src/components/QRCode.tsx:38, 48
- **Problema:** Multiple non-component exports
- **Solución:** Crear archivo separado para constantes

### 5. Fast Refresh - src/context/AppContext.tsx:113, 122, 130
- **Problema:** Multiple non-component exports
- **Solución:** Crear archivo separado para constantes

### 6. Unused Imports - app/page.tsx:6-10, 20
- **Variables no utilizadas:**
  - `AnimatePresence` (línea 6)
  - `Globe` (línea 8)
  - `Play` (línea 8)
  - `Calendar` (línea 9)
  - `FileText` (línea 10)
  - `formatCurrency` (línea 20)
- **Solución:** Remover importes no usados

### 7. Unused Variables - src/components/eventbrite/CheckInScanner.tsx:128
- **Variable:** `err` (nunca usado)
- **Solución:** Remover o usar con prefijo `_`

### 8. Unused Variables - src/components/eventbrite/EmailComposer.tsx:144
- **Variable:** `err` (nunca usado)
- **Solución:** Remover o usar con prefijo `_`

### 9. Unused Variables - src/components/eventbrite/SMSComposer.tsx:112
- **Variable:** `err` (nunca usado)
- **Solución:** Remover o usar con prefijo `_`

### 10. Unused Variables - src/components/eventbrite/EventCreator.tsx:85
- **Variable:** `_createdEventId` (nunca usado)
- **Solución:** Remover o usar con prefijo `_`

---

## 🟡 WARNINGS (React Hooks Dependencies)

### 11. Missing Dependency - src/App.tsx:71
- **Hook:** `useEffect`
- **Missing:** `actions`, `state`
- **Impacto:** Puede causar bugs de stale closures

### 12. Missing Dependency - src/context/AppContext.tsx:35
- **Hook:** `useEffect`
- **Missing:** `actions`, `state`
- **Impacto:** Puede causar bugs de stale closures

### 13. Missing Dependency - src/context/AppContext.tsx:54
- **Hook:** `useEffect`
- **Missing:** `actions`
- **Impacto:** Puede causar bugs de stale closures

### 14. Missing Dependency - app/page.tsx:94
- **Hook:** `useEffect`
- **Missing:** `displayValue`
- **Impacto:** Puede no ejecutarse cuando `displayValue` cambia

---

## 📋 Otros Issues Detectados

### 15. Multiple useCallback Missing Dependencies
- **Archivos:** AlertsManager, CheckInScanner, OrdersFeed, PromoCodesManager, RefundManager, ReportsExport
- **Missing:** `headers` variable
- **Impacto:** Callbacks pueden tener stale closures

### 16. Missing useEffect Dependency
- **Archivo:** EventComparisonView.tsx:46
- **Missing:** `fetchComparison`
- **Impacto:** Effect puede no ejecutarse correctamente

---

## ✅ RECOMENDACIONES

### Prioridad 1 (CRÍTICA)
- [ ] Fijar `Date.now()` en DashboardLayout.tsx (usar useEffect)
- [ ] Fijar setState sincrónico en AuthContext.tsx (consolidar setState)

### Prioridad 2 (ALTA)
- [ ] Remover imports no utilizados
- [ ] Remover variables no utilizadas
- [ ] Fijar fast refresh en app/layout.tsx

### Prioridad 3 (MEDIA)
- [ ] Agregar dependencias faltantes en useEffect
- [ ] Agregar dependencias faltantes en useCallback
- [ ] Refactorizar AppContext.tsx (separar constantes)

---

## 🔧 Compilación Status

### Build Result
```
✓ 2176 modules transformed
✓ built in 2.50s
⚠️ Some chunks are larger than 500 kB (consider code-splitting)
```

**Conclusión:** El proyecto compila, pero con warnings que pueden causar bugs en producción.

---

## 📝 Notas

- TypeScript compila correctamente
- Vite build completa sin errores fatales
- ESLint encuentra 20 problemas (4 críticos, 9 errores, 7 warnings)
- Chunks grandes pueden afectar performance

---

**Recomendación:** ✅ El proyecto es funcional pero requiere correcciones de bugs antes de producción.
