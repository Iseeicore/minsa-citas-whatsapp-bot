---
name: revision-fe-02-estilos
description: Filtro 2 de 5 de revision-frontend. Tokens @theme sin valores arbitrarios de Tailwind, sin emojis ni svg fuera del kit de iconos, cn() para componer clases, variantes de contenedor, maquetación y scroll. Úsalo solo dentro de revision-frontend.
---

# Filtro FE-02 · Estilos y tokens (F11-F14, F35-F45)

## Verifica

- Sin emojis en las vistas (F35). Iconos solo desde `app/components/icons/`, un componente por icono (convención del bot, sección 12b); ningún `<svg>` en línea fuera de ese archivo (F36).
- Colores, tamaños, radios y sombras como tokens en `@theme` (`app/globals.css`, Tailwind v4); sin `bg-[#hex]`, `bg-[var(--x)]`, `text-[10px]`, `text-[0.8rem]`, `shadow-[...]` ni `clamp(...)` entre corchetes (F37, F38, F39).
- Sin gradientes decorativos; si existen, `bg-linear-*`, no `bg-gradient-*` (F39).
- Los componentes reutilizables piden su aspecto por propiedades de un conjunto cerrado, con un `Record` de clases fuera del componente; nadie copia su cadena de clases (F11).
- Clases compuestas con `cn` (`clsx` + `tailwind-merge`), nunca con plantillas de texto, concatenación ni `.trim()` (F12). Listas de clases ilegibles partidas en constantes con nombre (F13). Tamaños que dependen del contenedor usan `@md:`/`@xl:` sobre un padre `@container` (F14).
- Un solo scroll vertical; scroll horizontal solo en `ScrollArea`; contenedor `overflow-*` con hijos `absolute` es `relative`; hijos de flex o grid con tablas llevan `min-w-0` (F40 a F43). Un cambio de maquetación se verifica en el navegador (F44).

## Comandos

```bash
rg -n "\[#[0-9a-fA-F]{3,8}\]|text-\[|shadow-\[|bg-\[var|bg-gradient-" app
rg -n "<svg" app --glob '!app/components/icons/**'
rg -n "className=\{`|className=\{.*\+ " app
npx vitest run tests/integration/ui-design-rules.test.ts
```

## Veredicto

PASA solo con cero coincidencias y la prueba en verde. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 3.
Siguiente: `revision-fe-03-datos-backend`.
