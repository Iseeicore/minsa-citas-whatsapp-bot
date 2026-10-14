---
name: revision-backend
description: Revisión secuencial del backend (app/api, app/webhook, lib/, prisma/) contra "Reglas de Desarrollo — Backend". Úsala al revisar o antes de abrir un PR que toque backend. Corre 10 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Backend

Fuente de las reglas: `Obsidian Vault/Minsa/Minsa_code/Reglas de Desarrollo — Backend.md`. Cada filtro cita los números de regla de ese archivo.

## Procedimiento

1. Delimitar el alcance: `git diff --name-only <rama destino>...HEAD`. Si no hay diff, revisar los archivos que el usuario indique.
2. Ejecutar los filtros **en este orden**, cada uno invocando su skill:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-be-01-arquitectura` | 1-6, 52 |
| 2 | `revision-be-02-errores-http` | 7-13 |
| 3 | `revision-be-03-validacion-datos-externos` | 14-17, 88-92 |
| 4 | `revision-be-04-constantes` | 18-24, 65-76 |
| 5 | `revision-be-05-utilitarias-errores` | 77-87 |
| 6 | `revision-be-06-seguridad-fiabilidad` | 29-42, 100 |
| 7 | `revision-be-07-datos-migraciones` | 25-28, 93-99, 101 |
| 8 | `revision-be-08-banderas-entorno` | 120-141 |
| 9 | `revision-be-09-comentarios-formato` | 43-47, 64, 102-110 |
| 10 | `revision-be-10-git-entrega` | 54-58, 111-119 |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` y la regla violada).
4. **FALLA detiene la secuencia.** No se evalúa el filtro siguiente hasta corregir y repetir el mismo filtro hasta PASA. Los hallazgos de filtros posteriores que se noten de paso se anotan como "pendiente", no se corrigen (regla 112).
5. Al terminar los 10 en PASA, correr el cierre: `npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npm run format:check && npx vitest run`, y `npm run test:perf` por separado.

## Reporte final

Una tabla `filtro | veredicto | hallazgos`, más la lista de pendientes que no se corrigieron. Una regla que dependa de decisión del responsable (bandera, contenido de textos, contrato de otro equipo) se pregunta; no se decide solo.
