---
name: revision-be-08-banderas-entorno
description: Filtro 8 de 10 de revision-backend. Feature flags (un lector, apagada por omisión, todos los puntos de entrada) y variables de entorno (nombres en inglés, documentadas). Úsalo solo dentro de revision-backend.
---

# Filtro BE-08 · Banderas y entorno (reglas 120-141)

## Verifica si el diff agrega o toca una bandera o variable

- Se preguntó al responsable si la función lleva bandera y con qué valor por defecto (120). Si no consta, preguntar; no decidir solo.
- Un solo lector en `lib/config/features.ts`, con el literal `process.env.NOMBRE` en él; ningún otro archivo lo toca (121, 139).
- Apagada por omisión, se enciende solo con `true` (normalizado: `trim`, minúsculas); nada de `!== "false"` salvo decisión escrita (122). Nombre `<ÁMBITO>_ENABLED`, en inglés, afirmativo (123, 129).
- Documentada en el mismo cambio: `.env.example`, tabla de variables del README, qué ve la persona apagada, si se lee por petición o al arrancar, y valor por defecto (124, 140, 141).
- Con la bandera apagada **todos** los puntos de entrada responden claro (125): menú/lista, texto escrito, botón de mensaje viejo, IA clasificadora, ejecutor, sesión a medias, páginas y API. Probado encendida, apagada y sin definir con `vi.stubEnv`, en archivos `*-disabled.test.ts` (126, 127).
- Vocabulario de dominio en español, términos técnicos en inglés, sin partir palabras de dominio (130). No se renombra lo existente solo por consistencia (132); valores persistidos intactos (133).

## Comandos

```bash
npx vitest run tests/integration/env-example.test.ts tests/security/sandbox-incidencias-disabled.test.ts
rg -n "process\.env" lib app --glob '!lib/config/**' --glob '!lib/db/**'
```

## Veredicto

PASA solo si la prueba de `.env.example` pasa y toda lectura de entorno fuera del módulo central está inventariada. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 9.
Siguiente: `revision-be-09-comentarios-formato`.
