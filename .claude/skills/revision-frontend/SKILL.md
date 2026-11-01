---
name: revision-frontend
description: Revisión secuencial del frontend React del bot (app/, excepto app/api y app/webhook) contra "Reglas del Frontend — Calidad de Código" (F01-F88) y las generales (G01-G76). Úsala al revisar o antes de abrir un PR que toque UI. Corre 5 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Frontend

Fuente: `Obsidian Vault/Documentacion-Chatbot/Reglas/Reglas del Frontend — Calidad de Código.md` (F) y `Obsidian Vault/Documentacion-Chatbot/Reglas/Generales/Reglas Generales — Calidad y Entrega.md` (G). La sección 10 (Angular) pertenece a `minsa-incidencias-frontend` y **no se evalúa aquí**. La numeración vieja es la de `Reglas/Retirados/` y ya no rige.

## Procedimiento

1. Alcance: `git diff --name-only <destino>...HEAD -- app tests/app lib/utils`.
2. Ejecutar en orden:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-fe-01-estructura-componentes` | F01-F19 (secciones 1 a 3), F46-F50 (sección 9), F88, G03, G75, G76 |
| 2 | `revision-fe-02-estilos` | F35-F45 (secciones 7 y 8) |
| 3 | `revision-fe-03-datos-backend` | F20-F34, F77-F78, F87 (secciones 4 a 6) |
| 4 | `revision-fe-04-comentarios-mocks-formato` | F50, F55-F63 (secciones 9 y 11) |
| 5 | `revision-fe-05-entrega` | F55-F63 (sección 11), G16-G18, G33-G40 |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` + regla). **FALLA detiene la secuencia**: se corrige y se repite el mismo filtro antes de pasar al siguiente. Lo que se note de otros filtros se anota como pendiente.
4. Cierre con los 5 en PASA: `npx next typegen && npx tsc --noEmit && npx eslint app tests && npx vitest run tests/integration/ui-design-rules.test.ts`.
5. Cualquier cambio de maquetación se verifica en el navegador a 375 px (`scrollWidth === clientWidth`, `scrollHeight === innerHeight`); jsdom no basta. Si no se pudo abrir un navegador, declararlo "no verificado".

## Reporte final

Tabla `filtro | veredicto | hallazgos` y pendientes sin corregir.
