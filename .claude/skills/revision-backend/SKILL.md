---
name: revision-backend
description: Revisión secuencial del backend (app/api, app/webhook, lib/, prisma/) contra "Reglas del Backend — Calidad de Código" (R01-R204) y las generales (G01-G76). Úsala al revisar o antes de abrir un PR o un MR que toque backend. Corre 10 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Backend

Fuente de las reglas: `Obsidian Vault/Documentacion-Chatbot/Reglas/Reglas del Backend — Calidad de Código.md` (R) y `Obsidian Vault/Documentacion-Chatbot/Reglas/Generales/Reglas Generales — Calidad y Entrega.md` (G). Los valores concretos del bot están en la sección 7b de las generales. Solo se citan esos identificadores; la numeración de `Reglas/Retirados/` ya no rige (G24).

## Procedimiento

1. Delimitar el alcance, según el destino:
   - **Modo PR** (destino `origin/main`): `git diff --name-only <destino>...HEAD -- app/api app/webhook lib prisma scripts tests`. Si no hay diff, revisar los archivos que el usuario indique. Se revisan las líneas cambiadas; lo previo se informa aparte y no bloquea.
   - **Modo MR** (destino `gitlab/develop`, o un MR que junta varios PR): la lista sale de `git diff --name-only gitlab/develop...HEAD` con las mismas carpetas, aunque la rama venga de `origin/main`. Se lee **el archivo completo** de cada uno: lo que el diff no toca se informa como `MR (lo verá el revisor)` y bloquea igual que una FALLA. Es el mismo modo de `/revisar-reglas`.
2. Ejecutar los filtros **en este orden**, cada uno invocando su skill:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-be-01-arquitectura` | R01-R12, R163-R177, R203 (sección 1) |
| 2 | `revision-be-02-errores-http` | R13-R24, R196 (sección 2), R42 para los códigos HTTP |
| 3 | `revision-be-03-validacion-datos-externos` | R25-R37, R128 (sección 3), G09-G11 |
| 4 | `revision-be-04-constantes` | R38-R51, R129-R131, R194, R201-R202 (sección 4), G03, G04, G05, G76 |
| 5 | `revision-be-05-utilitarias-errores` | R52-R55 (sección 5), R56-R66 (sección 6), G45-G47 |
| 6 | `revision-be-06-seguridad-fiabilidad` | R84-R100, R140-R142, R158-R161, R190, R199-R200 (secciones 10 y 11) |
| 7 | `revision-be-07-datos-migraciones` | R03 (SQL crudo), R70-R83, R132-R139, R178-R189, R191, R204 (secciones 8 y 9) |
| 8 | `revision-be-08-banderas-entorno` | R115-R122 (sección 15), R49-R51, G49-G63 |
| 9 | `revision-be-09-comentarios-formato` | R101-R104, R143-R144, R198 (sección 12), R113-R114 (sección 14) |
| 10 | `revision-be-10-git-entrega` | G16-G18, G33-G40, G64-G74 (generales secciones 2d y 5), R123-R127, R145-R146 (sección 16) |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` y la regla violada).
4. **FALLA detiene la secuencia.** No se evalúa el filtro siguiente hasta corregir y repetir el mismo filtro hasta PASA. Los hallazgos de filtros posteriores que se noten de paso se anotan como «pendiente», no se corrigen (R125, G65).
5. Una regla que ninguna herramienta verifica (la abstracción mínima de G03, G04 y R62, el motivo del SQL crudo de R03) nunca se informa como PASA: se informa `no verificable con herramienta — revisado a mano: sí` o `revisado a mano: no`.
6. Al terminar los 10 en PASA, correr el cierre: `npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npm run format:check && npx vitest run`, y `npm run test:perf` por separado.

## Reporte final

Una tabla `filtro | veredicto | hallazgos`, la lista de reglas sin herramienta con su estado `revisado a mano: sí/no`, y la lista de pendientes que no se corrigieron. En modo MR, los hallazgos `MR (lo verá el revisor)` van en la tabla y bloquean. Una regla que dependa de decisión del responsable (bandera, contenido de textos, contrato de otro equipo) se pregunta; no se decide solo.
