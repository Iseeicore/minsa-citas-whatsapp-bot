---
name: revision-be-04-constantes
description: Filtro 4 de 10 de revision-backend. Textos, regex, prompts, límites, palabras clave y estados según su umbral; enums sin strings sueltos y sin alias. Úsalo solo dentro de revision-backend.
---

# Filtro BE-04 · Constantes (R38-R51, R129-R131, R194, R201-R202; G03, G04, G05, G76)

Antes de dictaminar G03, G04 y R45, leer la regla vigente en el vault. Este archivo no copia su texto.

## Verifica

- Mensajes del bot al ciudadano (`lib/fsm`, whatsapp-bot y Chat-bot) y textos legales en `lib/constants/textos/` (un archivo por flujo); los que llevan dato y se usan en dos o más lugares son funciones. Cualquier otro texto al usuario de un solo uso va en línea salvo que cumpla uno de los siete motivos de G03 (R45). Un mensaje existe una sola vez; unificar redacciones distintas es decisión del responsable.
- Palabras que escribe el usuario: constantes (`*_KEYWORD`) (R46).
- Números con regla: constantes en `lib/constants/limits/`; un texto que menciona un límite se arma con la constante (R42, R43).
- Regex solo en `lib/constants/regex/`, con nombre; patrones largos armados con partes con nombre (R47, R129).
- Prompts de IA en `lib/constants/prompts/`, uno por tarea (R48).
- Un identificador técnico es constante solo si lo usan dos o más archivos o es un contrato entre quien lo escribe y quien lo lee; el código de una librería que el código compara es contrato y va con la constante de la librería o una propia tipada con su tipo (G04, R38). Con un solo uso y sin contrato va en línea.
- Una constante es un valor: sin derivadas ni envoltorios de un solo consumidor, y nunca un alias que solo renombra, tampoco con la excepción del segundo consumidor de G04 (R44).
- Estados, motivos y discriminantes que cruzan archivos, se guardan o discriminan un resultado son enums, uno por archivo; un conjunto cerrado que usa un solo archivo puede ser una unión local. Tipos con el enum directo y `switch` sin `default` salvo error de programación (R38, R39, R40). La carpeta de enums va por dominio (`lib/enums/<dominio>/`, sección 7b de las generales); la mudanza está pendiente y no es hallazgo.
- Valores persistidos (estados de sesión, claves de slots, ids de botón) no se renombran (R41).
- Un enum se importa una sola vez y con su propio nombre, sin `as XEnum` (G76).
- Configuración tipada y centralizada; `.env.example` sincronizado; sin secretos en código (R49, R50, R51, R91).

## Comandos

```bash
npx vitest run tests/integration/textos-location.test.ts tests/integration/regex-location.test.ts
rg -n "=== \"[a-z_]+\"|!== \"[a-z_]+\"" lib app
rg -n '\.code === "[a-z_]+"' app lib
rg -n "import \{ \w+ as \w+Enum \}" app lib
rg -n "^(export )?const [A-Z][A-Z0-9_]* = [A-Za-z_][A-Za-z0-9_.]*;$" lib
```

La última búsqueda da candidatos a alias: cada uno que solo renombra otro valor es FALLA (R44).

## Veredicto

PASA solo si las pruebas de ubicación pasan y las coincidencias de `rg` están justificadas. FALLA con `archivo:línea` + regla. La abstracción mínima de G03 y G04 se informa como `no verificable con herramienta — revisado a mano: sí/no`. Con FALLA no pasar al filtro 5.
Siguiente: `revision-be-05-utilitarias-errores`.
