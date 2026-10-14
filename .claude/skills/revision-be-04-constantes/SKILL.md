---
name: revision-be-04-constantes
description: Filtro 4 de 10 de revision-backend. Textos, regex, prompts, límites, palabras clave y estados fuera de la lógica; enums sin strings sueltos. Úsalo solo dentro de revision-backend.
---

# Filtro BE-04 · Constantes (reglas 18-24, 65-76)

## Verifica

- Ningún texto al ciudadano, botón o fila dentro de un archivo de lógica: vive en `lib/constants/textos/` (un archivo por flujo); los que llevan dato son funciones (65, 66). Un mensaje existe una sola vez (67); unificar redacciones distintas es decisión del responsable.
- Palabras que escribe el usuario: constantes (`*_KEYWORD`) (68).
- Números con regla: constantes en `lib/constants/limits/`; un texto que menciona un límite se arma con la constante (19, 69).
- Regex solo en `lib/constants/regex/`, con nombre; patrones largos armados con partes con nombre (70).
- Prompts de IA en `lib/constants/prompts/`, uno por tarea (71).
- Sin alias que solo renombran un valor (72). Estados, motivos y discriminantes son enums de `lib/enums/` (uno por archivo), tipos con el enum directo, `switch` sin `default` salvo error de programación (73-75).
- Valores persistidos (estados de sesión, claves de slots, ids de botón) no se renombran (76).
- Configuración tipada y centralizada; `.env.example` sincronizado; sin secretos en código (21-24).

## Comandos

```bash
npx vitest run tests/integration/textos-location.test.ts tests/integration/regex-location.test.ts
rg -n "=== \"[a-z_]+\"|!== \"[a-z_]+\"" lib/fsm lib/whatsapp
rg -n "\b(const|let) \w+ = (\w+\.)+\w+;$" lib | rg "Id\.|Button"
```

## Veredicto

PASA solo si las pruebas de ubicación pasan y las coincidencias de `rg` están justificadas. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 5.
Siguiente: `revision-be-05-utilitarias-errores`.
