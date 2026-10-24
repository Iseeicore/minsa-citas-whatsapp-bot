<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Versión del proyecto

| Campo | Valor |
|---|---|
| Fase | **Piloto: solo cita médica, incidencias apagadas** |
| Actualizado | 2026-10-14 |
| Último hito | PR #83: servicio **Consultar referencia**, sin bandera (fila solo en el Chat-bot; la palabra «referencia» funciona en whatsapp-bot y en el Chat-bot). Antes, PR #82: bandera `INCIDENCIAS_ENABLED` |
| Sincronía con GitLab | `develop` d67f443 (PR #81) |

**Qué gestiona la fase:** la variable de entorno `INCIDENCIAS_ENABLED`, leída en `lib/config/features.ts`.

- Apagada (sin definir, vacía o con cualquier valor distinto de `true`): el menú ofrece solo **Agendar una cita médica** y **Consultar Referencias** (la referencia no lleva bandera y su fila está en los dos canales). El código `MINSA-AAAA-NNNNNN`, las palabras clave, el `3`/`4` escritos y las sesiones que quedaron a medias en incidencia no llegan a esos flujos: el bot responde que por ahora solo agenda citas y consulta referencias, y muestra el menú.
- Encendida (`true`, sin distinguir mayúsculas ni espacios): ofrece también **Registrar una incidencia** y **Consultar una incidencia**.
- Se lee en cada mensaje: cambiarla exige reiniciar el proceso, no recompilar. Vitest la fuerza a `true` para probar los dos flujos.
- Cambiar de fase = cambiar esta variable (con aviso a infraestructura, regla 100 de las reglas de backend) y actualizar esta tabla en el mismo PR.

## Cómo se carga este archivo

Claude Code lee `AGENTS.md` por sí solo desde la v2.1.277, **solo si no existe ningún `CLAUDE.md`** en el directorio de trabajo ni por encima (documentación oficial: <https://code.claude.com/docs/en/memory>). Por eso:

1. **No existe `CLAUDE.md` en este repo, ni `.claude/CLAUDE.md`, ni `CLAUDE.local.md`.** Cualquiera de los tres haría que Claude dejara de leer este archivo. Para instrucciones personales usar `~/.claude/CLAUDE.md` (no cuenta).
2. **No hace falta una regla de "léelo al abrir"**: se carga en cada sesión. Lo que sí hace falta es mantenerlo: cuando cambie la fase, un comando o la arquitectura, se actualiza aquí en el mismo PR.
3. **No se corre `/init`**: genera un `CLAUDE.md` y ese archivo taparía este. Si hay que regenerar contenido, se le pide a Claude que actualice `AGENTS.md` directamente.
4. **Las skills de `.claude/skills/` son independientes** de esta carga y siguen funcionando igual.

Si una sesión no carga este archivo (versión de Claude Code anterior, subagente sin instrucciones de proyecto), crear un `CLAUDE.md` que contenga solo `@AGENTS.md`.

# Revisión secuencial por filtros

Las reglas de desarrollo viven en `Obsidian Vault/Minsa/Minsa_code/` (`Reglas de Desarrollo — Backend.md` y `Reglas de Desarrollo — Frontend.md`). Cada filtro es una skill de `.claude/skills/`.

- Código en `app/api`, `app/webhook`, `lib/` o `prisma/` → skill `revision-backend` (filtros `revision-be-01` a `revision-be-10`).
- Código en `app/` (UI) → skill `revision-frontend` (filtros `revision-fe-01` a `revision-fe-05`). La Parte B de las reglas (Angular) no aplica a este repo.
- Los filtros se corren **en orden**. Un filtro en FALLA detiene la revisión: se corrige y se repite ese filtro antes de pasar al siguiente. Lo que se note de otros filtros se anota como pendiente, no se corrige de paso.
- Una regla que depende de decisión del responsable (bandera, redacción de textos, contrato de otro equipo) se pregunta; no se decide solo.
- **Al generar código nuevo**, antes de escribirlo se aplican las instrucciones «no generes esto, implementa así» y se responde la confirmación previa de los manuales: backend sección 20 (P1-P8) y frontend sección 19 (PF1-PF4). Los patrones que aún tiene el código y no se han corregido están en `Obsidian Vault/Minsa/Correcciones_detectadas/Correcciones detectadas.md`.
- `AGENTS.md` y `.claude/skills/` se versionan en GitHub. **No** deben llegar al repositorio institucional de GitLab: verificar el diff antes de preparar cualquier envío hacia allá (regla 118).

# Idioma de la documentación

- Los archivos `.md` de este repo están en español, con nombre en kebab-case, minúsculas y sin acentos (regla 134 de las reglas de backend). El título y el nombre del archivo dicen lo mismo.
- **Antes de crear un `.md` nuevo, preguntar al usuario si se redacta en español o en inglés.** Aplica a todo `.md` salvo `README.md`, `AGENTS.md` y siglas de herramienta como `ci.md`. Se hace una sola pregunta y se espera la respuesta; no se asume el idioma.
- El ambiente solo sugiere el valor por defecto: en este repo, español. Otro proyecto u otro ambiente puede pedir inglés, y lo decide el usuario.
- Al renombrar un `.md`, buscar también quién lo lee por ruta en `tests/` y `scripts/`, no solo los enlaces.

# Qué es este proyecto

Bot del MINSA (Perú) con dos canales, **whatsapp-bot** (WhatsApp Business Cloud API) y **Chat-bot** (el chat web; en el código sigue como `SANDBOX_*`, `/api/sandbox` y `/sandbox`): agenda citas médicas, consulta referencias, registra y consulta incidencias (según la fase), y deriva urgencias y consultas fuera de alcance a los canales oficiales. Next.js 16 (App Router) + Prisma/PostgreSQL + Gemini para interpretar texto libre. Documentación, textos al ciudadano y pruebas están en español.

# Comandos

```bash
npm run dev                 # servidor de desarrollo
npm test                    # suite completa de vitest (almacenes en memoria y fakes, sin secretos ni base)
npx vitest run tests/lib/fsm/flows/cita/hora-choice.test.ts   # un archivo
npx vitest run -t "nombre"  # una prueba por nombre
npm run test:perf           # rendimiento y ReDoS; corre solo, en paralelo con la suite falla sin motivo real
npm run test:gaps           # modo estricto para brechas conocidas (tests/support/known-gap.ts)
npm run smoke:postgres      # requiere PostgreSQL real: DATABASE_URL + DATABASE_ENABLED=true
npm run db:test             # base desechable + prisma/tests/*.sql (requiere psql)
npm run build               # prisma migrate deploy + next build --webpack
npm run build:no-db         # build sin migraciones (imagen Docker)
npm run docker:up           # construye y espera el healthcheck
```

Chequeo equivalente al CI (`docs/ci.md`):

```bash
npx next typegen && npx tsc --noEmit && npx eslint lib app tests && npm run format:check && npx vitest run && npm run test:perf
```

`npx next typegen` es necesario en un checkout limpio antes de `tsc`. Vitest fija `DATABASE_URL=""`, `DATABASE_ENABLED=true`, `INCIDENCIAS_ENABLED=true` (`vitest.config.ts`); nunca correr la suite principal con un `DATABASE_URL` real.

# Arquitectura

**Ruta de una petición.** `app/webhook/whatsapp/route.ts` (Meta) y `app/api/sandbox/route.ts` (widget web) son delgados y alimentan el mismo pipeline. Webhook: perímetro de `lib/security/` (firma HMAC, filtro de payload, rate limiter, guardia léxica) → `lib/whatsapp/webhook/` (mapeo del payload, dedupe, persistencia, candado de turno por ciudadano) → `lib/fsm/` → respuesta por `lib/whatsapp/`.

**FSM (`lib/fsm/`).** La conversación es una máquina de estados organizada **por flujo, no por capa**: `core/` (ejecutor, despachador de turnos `handle`), `session/` (almacén de estado, expiración, reverificación, candado), `routing/` (primer contacto, bienvenida, menú, guardia léxica), `parsing/` (lectura de texto libre; `ai/` contiene el puerto `llm.ts`, el proveedor lo elige `llm-registry.ts`, los adaptadores están en `providers/`) y `flows/{cita,incidencia,referencia,emergency,out-of-scope}/`. El flujo de cita enruta cada estado a un módulo de `flows/cita/steps/<responsabilidad>/`. Estados y tipos son enums reales de `lib/enums/`, no strings.

**Dos modos de persistencia, un solo camino de código.** `DATABASE_ENABLED=false` (valor exacto) → sin Prisma: sesión, dedupe y candado en memoria (sesión de 1 h), las incidencias no se pueden guardar, la bandeja responde 503. Cualquier otro valor → PostgreSQL (`chatbot.sesion_conversacion`, advisory lock, `wa_message_id` único). El modo en memoria es de una sola instancia. `lib/db/prisma.ts` carga el cliente de forma diferida; nunca instanciar Prisma fuera de él.

**Integraciones (`lib/integrations/`).** Cliente del MINSA separado por endpoint (identidad, catálogo, reserva) con fakes. `SANDBOX_USE_REAL_MINSA` alterna fake y real; el webhook real también lee la del MINSA. `MINSA_DIGITAL_APP_URL` no tiene valor por defecto en el código (de ella salen los botones al portal y las cabeceras `Origin`/`Referer`); una prueba prohíbe escribir esa URL a mano.

**Base de datos (`prisma/`).** Cuatro esquemas (`catalogo`, `chatbot`, `gestion`, `ia`). Reglas, disparadores, funciones y semillas viven en el SQL de las migraciones, no en `schema.prisma`. Nunca se edita una migración aplicada: se crea una nueva (`prisma migrate dev --create-only`). Toda tabla y columna lleva `COMMENT ON` (agregar a `prisma/diccionario/diccionario.json` y correr `npm run db:diccionario`); cada regla nueva lleva su prueba SQL en `prisma/tests/`. Roles y valores de catálogo se retiran con `activo = false`, no se borran. Detalle: `prisma/README.md`.

# Convenciones que hacen cumplir ESLint y las pruebas

- Imports siempre con el alias `@/`; los relativos se rechazan. Sin ciclos de imports (`import/no-cycle`).
- Tests en espejo: `lib/<ruta>/x.ts` → `tests/lib/<misma ruta>/x.test.ts`. Las suites transversales viven en `tests/{security,stress,integration,smoke}`.
- Sin comentarios ni docstrings en código, migraciones ni SQL de pruebas (solo directivas de herramienta como `eslint-disable`); la intención va en los nombres y en `docs/`.
- Textos al ciudadano → `lib/constants/textos/` (un archivo por flujo); prompts de IA → `lib/constants/prompts/`; regex → `lib/constants/regex/` como constantes con nombre; palabras clave → `lib/constants/palabras-clave.ts`. Sin archivos índice. Las pruebas `*-location` fallan si no se cumple.
- Lógica pura sin hooks de React → `lib/utils/` con su prueba.
- UI (`app/components`): sin valores arbitrarios de Tailwind (`bg-[#hex]`, `text-[10px]`), tokens en `@theme` de `app/globals.css`; sin emojis en las vistas (íconos de `app/components/icons/`); bloques de clases repetidos pasan a `app/components/ui/`. Lo hace cumplir `ui-design-rules.test.ts`.
- Prettier: 140 columnas, comillas dobles, punto y coma, coma final. Cubre `lib/`, `tests/`, `scripts/` y la configuración de la raíz; `app/` aún no se formatea (`.prettierignore`).
- `.env.example` es solo la lista de variables; `tests/integration/env-example.test.ts` falla si se desvía de lo que lee el código o de lo documentado en el README. Al agregar una variable se actualizan ambos.
- Agregar o cambiar un comando, opción o mensaje exige actualizar `README.md` y `docs/` (`docs/flujo-cita.md` refleja las ramas del FSM).

# Ramas y remotos

`main` está protegida por el ruleset "main: CI must pass" (check `types, lint and tests`): los cambios entran por PR, no por push directo. El repo se sincroniza con el `develop` de GitLab (`.gitlab-ci.yml` convive con `.github/workflows/ci.yml`).
