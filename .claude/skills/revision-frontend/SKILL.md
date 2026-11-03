---
name: revision-frontend
description: Revisión secuencial del frontend React del bot (app/, excepto app/api y app/webhook, y lo de lib/ que usa app/) contra "Reglas del Frontend — Calidad de Código" (F01-F90) y las generales (G01-G76). Úsala al revisar o antes de abrir un PR o un MR que toque UI. Corre 5 filtros en orden; un filtro en FALLA detiene la revisión.
---

# Revisión secuencial — Frontend

Fuente: `Obsidian Vault/Documentacion-Chatbot/Reglas/Reglas del Frontend — Calidad de Código.md` (F) y `Obsidian Vault/Documentacion-Chatbot/Reglas/Generales/Reglas Generales — Calidad y Entrega.md` (G). Los valores concretos del bot están en la sección 12b del frontend y en la 7b de las generales. La sección 10 (Angular) pertenece a `minsa-incidencias-frontend` y **no se evalúa aquí**. Solo se citan esos identificadores; la numeración de `Reglas/Retirados/` ya no rige (G24).

## Procedimiento

1. Alcance, según el destino:
   - **Modo PR** (destino `origin/main`): `git diff --name-only <destino>...HEAD -- app tests/app lib/constants lib/enums lib/http lib/types lib/utils`. De `lib/` entran solo los archivos que importa algo de `app/`. Se revisan las líneas cambiadas; lo previo de esos archivos se informa aparte y no bloquea.
   - **Modo MR** (destino `gitlab/develop`, o un MR que junta varios PR): la lista sale de `git diff --name-only gitlab/develop...HEAD` con las mismas carpetas, aunque la rama venga de `origin/main`. Se lee **el archivo completo** de cada uno, no solo los cambios: lo que el diff no toca se informa como `MR (lo verá el revisor)` y bloquea igual que una FALLA, porque en GitLab se revisan archivos completos. Es el mismo modo de `/revisar-reglas`.
2. Ejecutar en orden:

| # | Skill | Reglas |
|---|---|---|
| 1 | `revision-fe-01-estructura-componentes` | F01-F10, F15-F19, F46-F50, F88-F90, G03, G04, G05, G75, G76, R44 |
| 2 | `revision-fe-02-estilos` | F11-F14, F35-F45 |
| 3 | `revision-fe-03-datos-backend` | F20-F34, F77-F78, F87, G11, G46, G47 |
| 4 | `revision-fe-04-comentarios-mocks-formato` | F30, F50, F61 |
| 5 | `revision-fe-05-entrega` | F58-F60, F66, G16-G18, G33-G40, G64-G74 |

3. Cada filtro termina en **PASA** o **FALLA** (con `archivo:línea` + regla). **FALLA detiene la secuencia**: se corrige y se repite el mismo filtro antes de pasar al siguiente. Lo que se note de otros filtros se anota como pendiente.
4. Una regla que ninguna herramienta verifica (F06, F89, F90, la abstracción mínima de F01, F02, G03 y G04, el HTML semántico) nunca se informa como PASA: se informa `no verificable con herramienta — revisado a mano: sí` (alguien leyó el código para esa regla) o `revisado a mano: no`.
5. Cierre con los 5 en PASA: `npx next typegen && npx tsc --noEmit && npx eslint app tests && npx vitest run tests/integration/ui-design-rules.test.ts`.
6. Cualquier cambio de maquetación se verifica en el navegador a 375 px (`scrollWidth === clientWidth`, `scrollHeight === innerHeight`); jsdom no basta (F44, F57). Si no se pudo abrir un navegador, declararlo «no verificado».

## Reporte final

Tabla `filtro | veredicto | hallazgos`, la lista de reglas sin herramienta con su estado `revisado a mano: sí/no`, y los pendientes sin corregir. En modo MR, los hallazgos `MR (lo verá el revisor)` van en la tabla y bloquean.
