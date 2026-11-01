---
name: revision-backend
description: Revisión secuencial del backend (app/api, app/webhook, lib/, prisma/) contra "Reglas del Backend — Calidad de Código" (R01-R203) y las generales (G01-G76). Úsala al revisar o antes de abrir un PR que toque backend. Corre 10 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Backend

Fuente de las reglas: `Obsidian Vault/Documentacion-Chatbot/Reglas/Reglas del Backend — Calidad de Código.md` (R) y `Obsidian Vault/Documentacion-Chatbot/Reglas/Generales/Reglas Generales — Calidad y Entrega.md` (G). La numeración vieja (1-141) es la de `Reglas/Retirados/` y ya no rige.

## Procedimiento

1. Delimitar el alcance: `git diff --name-only <rama destino>...HEAD`. Si no hay diff, revisar los archivos que el usuario indique.
2. Ejecutar los filtros **en este orden**, cada uno invocando su skill:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-be-01-arquitectura` | R01-R12, R163-R177, R203 (sección 1) |
| 2 | `revision-be-02-errores-http` | R13-R24, R196 (sección 2), R42 para los códigos HTTP |
| 3 | `revision-be-03-validacion-datos-externos` | R25-R37, R128 (sección 3), G09-G11 |
| 4 | `revision-be-04-constantes` | R38-R51, R129-R131, R194, R201-R202 (sección 4), G03, G76 |
| 5 | `revision-be-05-utilitarias-errores` | R52-R55 (sección 5), R56-R66 (sección 6), G45-G47 |
| 6 | `revision-be-06-seguridad-fiabilidad` | R84-R100, R140-R142, R158-R161, R190, R199-R200 (secciones 10 y 11) |
| 7 | `revision-be-07-datos-migraciones` | R70-R83, R132-R139, R178-R189, R191 (secciones 8 y 9) |
| 8 | `revision-be-08-banderas-entorno` | R115-R122 (sección 15), G49-G63 |
| 9 | `revision-be-09-comentarios-formato` | R101-R104, R143-R144, R198 (sección 12), R113-R114 (sección 14) |
| 10 | `revision-be-10-git-entrega` | G16-G18, G33-G40 (generales sección 5), R123-R127 (sección 16) |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` y la regla violada).
4. **FALLA detiene la secuencia.** No se evalúa el filtro siguiente hasta corregir y repetir el mismo filtro hasta PASA. Los hallazgos de filtros posteriores que se noten de paso se anotan como "pendiente", no se corrigen (G64 a G74).
5. Al terminar los 10 en PASA, correr el cierre: `npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npm run format:check && npx vitest run`, y `npm run test:perf` por separado.

## Reporte final

Una tabla `filtro | veredicto | hallazgos`, más la lista de pendientes que no se corrigieron. Una regla que dependa de decisión del responsable (bandera, contenido de textos, contrato de otro equipo) se pregunta; no se decide solo.
