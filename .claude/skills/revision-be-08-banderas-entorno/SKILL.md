---
name: revision-be-08-banderas-entorno
description: Filtro 8 de 10 de revision-backend. Feature flags (un lector, apagada por omisión, todos los puntos de entrada) y variables de entorno (nombres en inglés, documentadas). Úsalo solo dentro de revision-backend.
---

# Filtro BE-08 · Banderas y entorno (R115-R122, R49-R51, R103-R104; G49-G63)

## Verifica si el diff agrega o toca una bandera o variable

- Se preguntó al responsable si la función lleva bandera y con qué valor por defecto (R115). Si no consta, preguntar; no decidir solo.
- Un solo lector en el módulo de configuración (`lib/config/`), con el literal `process.env.NOMBRE` en él; ningún otro archivo lo toca (R116, R49).
- Apagada por omisión, se enciende solo con `true` (normalizado: `trim`, minúsculas) y otro valor corta el arranque; nada de `!== "false"` salvo decisión escrita (R117). Las banderas actuales del bot no cortan el arranque con un valor inválido: es una excepción registrada en la sección 7b de las generales; una bandera nueva no la copia. Nombre `<ÁMBITO>_ENABLED`, en inglés y afirmativo (R118, R51).
- Documentada en el mismo cambio: `.env.example`, bloque de variables del README y tabla de `docs/despliegue-minsa.md` (sección 3.6), con qué ve la persona apagada, si se lee por petición o al arrancar, y valor por defecto (R50).
- Con la bandera apagada **todos** los puntos de entrada responden claro: menú o lista, texto escrito, botón de un mensaje viejo, IA clasificadora, ejecutor, sesión a medias, páginas y API (R119). Probado encendida, apagada y sin definir con `vi.stubEnv` (R121).
- Vocabulario de dominio en español, términos técnicos en inglés, sin partir palabras de dominio (R103). No se renombra lo existente solo por consistencia (R104); valores persistidos intactos (R41).

## Comandos

```bash
npx vitest run tests/integration/env-example.test.ts tests/security/sandbox-incidencias-disabled.test.ts
rg -n "process\.env" lib app --glob '!lib/config/**' --glob '!lib/db/**'
```

## Veredicto

PASA solo si la prueba de `.env.example` pasa y toda lectura de entorno fuera del módulo central está inventariada. FALLA con `archivo:línea` + regla. Con FALLA no pasar al filtro 9.
Siguiente: `revision-be-09-comentarios-formato`.
