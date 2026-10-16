# Brechas técnicas

Solo se listan las brechas que siguen abiertas. Las que ya se cerraron se quitan de este documento. Actualizado el 2026-10-14.

Las que tienen una prueba ejecutable están marcadas con `gap()` (ver `tests/support/known-gap.ts`): en `npm test` cuentan como fallos esperados y `npm run test:gaps` las corre como pruebas normales para ver el fallo real. Cuando una brecha se corrija, su prueba pasará a rojo en `npm test` y hay que quitarle el marcador `gap`.

## Abiertas

| Id | Brecha | Detalle | Estado | Prueba |
|---|---|---|---|---|
| G2 | Typo extremo en insultos | Un término a más de 3 ediciones de la palabra objetivo (por ejemplo `idotoaia`: 4 ediciones de «idiota», razón 0.67) no lo atrapa la distancia de Levenshtein. Ampliar la tolerancia marcaría palabras reales: con razón ≤ 0.50 se marcan 38 palabras de distritos del INEI (`maria`, `pedro`, `escudero`…) y con ≤ 0.35 ya se marcaban distritos reales (`Tarata`, `Taraco`, hoy protegidos por una lista de nombres oficiales). Sin regla de distancia segura; lo que sí se atrapa son las evasiones estructurales (letras sueltas, puntos, números, sufijos, consonantes dobles) | Aceptada | `gap` en `tests/security/lexical-guard.stress.test.ts` (`idotoaia`) |
| G4 | Latencia del candado sin medir desde Vercel | Desde una red lejana (159 ms por viaje a la base) el candado tarda 340 ms de mediana en adquirirse (2 viajes: `BEGIN` y la sentencia del candado) y 134 ms en liberarse (`COMMIT`). Es distancia de red, no código, pero el presupuesto de 200 ms no está certificado. Falta medirlo desde una función de Vercel en la región de la base (Neon está en `us-east-1`; se espera `iad1`, confirmar la región de la función). Cómo medirlo: durante la sección 4 de la [guía de pruebas manuales](qa/guia-pruebas-manuales.md), buscar el evento `turn_lock.waited` con `layer: "database"` (`waitedMs` da la duración; solo se escribe si tarda 200 ms o más). La medida de punta a punta es `inbound.latency` (ver [observabilidad](observabilidad.md)). Si `lock` o `turn` salen altos, el siguiente paso es guardar la sesión con el cliente de la transacción y acortar su alcance, porque hoy la transacción del candado sigue abierta durante los envíos a Meta y `saveSession` pide una segunda conexión del pool | Sin medir | `npm run smoke:postgres` (mide el candado real desde red local) |
| G6 | Límite de ritmo por instancia | Los contadores viven en memoria de cada instancia; no hay Redis. Una inundación repartida entre varias instancias se cuenta por separado. Con una sola instancia (servidor MINSA en Docker) no se manifiesta | Abierta (solo con varias instancias) | `tests/lib/security/rate-limiter.test.ts` |
| G7 | Tope de 4 turnos con candado por instancia | Evita agotar el pool de 10 conexiones; el costo es que una instancia atiende como máximo 4 turnos a la vez y los demás esperan hasta 20 s. Ajustable con `TURN_LOCK_MAX_CONCURRENCY` | Abierta (decisión de diseño) | `tests/lib/fsm/session/turn-lock.test.ts` |

## Seguridad pendiente

Hallazgos de la auditoría del 2026-09-19 que quedaron fuera de alcance y no se han revisado de nuevo:

- Los endpoints del operador (bandeja web) no tienen autenticación; solo los protege la bandera `SANDBOX_PAGE_ENABLED` (en producción se deja sin definir).
- El campo `from` de `/api/sandbox` lo controla el cliente.

## Pendiente con la institución

Los canales oficiales de derivación (SAMU 106, Bomberos 116, SIS, línea 113…) no están confirmados con la institución. Ver [canales de derivación](canales-fuera-de-alcance.md).
