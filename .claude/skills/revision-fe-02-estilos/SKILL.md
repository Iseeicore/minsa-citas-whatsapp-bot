---
name: revision-fe-02-estilos
description: Filtro 2 de 5 de revision-frontend. Tokens @theme sin valores arbitrarios de Tailwind, sin emojis ni svg inline, cn() para componer clases, variantes de contenedor. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-02 · Estilos y tokens (reglas 17-21, 54-56)

## Verifica

- Sin emojis en las vistas; íconos desde `app/components/icons/` vía componente genérico, sin `<svg>` inline (17, 18).
- Colores, tamaños, radios y sombras como tokens en `@theme` (`app/globals.css`, Tailwind v4); sin `bg-[#hex]`, `bg-[var(--x)]`, `text-[10px]`, `text-[0.8rem]`, `shadow-[...]`, `clamp(...)` entre corchetes (19, 20, 56).
- Sin gradientes decorativos; si existen, `bg-linear-*`, no `bg-gradient-*` (20).
- Una sola definición de botón con variantes por props; nadie copia su cadena de clases (21).
- Clases compuestas con `cn` (`clsx` + `tailwind-merge`), nunca con plantillas de texto, concatenación ni `.trim()`; `leading-*` al final (54).
- Listas de clases ilegibles partidas en constantes con nombre (55). Tamaños que dependen del contenedor usan `@md:`/`@xl:` sobre un padre `@container`, no `sm:`/`xl:` (56).

## Comandos

```bash
rg -n "\[#[0-9a-fA-F]{3,8}\]|text-\[|shadow-\[|bg-\[var|bg-gradient-|<svg" app
rg -n "className=\{`|className=\{.*\+ " app
npx vitest run tests/integration/ui-design-rules.test.ts
```

## Veredicto

PASA solo con cero coincidencias (salvo los propios íconos de `app/components/icons/`) y la prueba en verde. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 3.
Siguiente: `revision-fe-03-datos-backend`.
