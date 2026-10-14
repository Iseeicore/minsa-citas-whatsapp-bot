---
name: revision-frontend
description: Revisión secuencial del frontend React del bot (app/, excepto app/api y app/webhook) contra "Reglas de Desarrollo — Frontend", Partes A y C. Úsala al revisar o antes de abrir un PR que toque UI. Corre 5 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Frontend

Fuente: `Obsidian Vault/Minsa/Minsa_code/Reglas de Desarrollo — Frontend.md`. Aplican **Parte A** (generales) y **Parte C** (panel y sandbox en React). La **Parte B** (Angular 22) pertenece a `minsa-incidencias-frontend` y **no se evalúa aquí**.

## Procedimiento

1. Alcance: `git diff --name-only <destino>...HEAD -- app tests/app lib/utils`.
2. Ejecutar en orden:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-fe-01-estructura-componentes` | 1-8, 52, 53, 57-59 |
| 2 | `revision-fe-02-estilos` | 17-21, 54-56 |
| 3 | `revision-fe-03-datos-backend` | 9-16, 60-64 |
| 4 | `revision-fe-04-comentarios-mocks-formato` | 22-27, 65 |
| 5 | `revision-fe-05-entrega` | 28-32, 66-71 |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` + regla). **FALLA detiene la secuencia**: se corrige y se repite el mismo filtro antes de pasar al siguiente. Lo que se note de otros filtros se anota como pendiente.
4. Cierre con los 5 en PASA: `npx next typegen && npx tsc --noEmit && npx eslint app tests && npx vitest run tests/integration/ui-design-rules.test.ts`.
5. Cualquier cambio de maquetación se verifica en el navegador a 375 px (`scrollWidth === clientWidth`, `scrollHeight === innerHeight`); jsdom no basta. Si no se pudo abrir un navegador, declararlo "no verificado".

## Reporte final

Tabla `filtro | veredicto | hallazgos` y pendientes sin corregir.
