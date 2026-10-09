# Flujo de incidencia

Cómo empieza y avanza una incidencia (reclamo, queja o denuncia: el ciudadano ve una sola palabra, «incidencia»). Código en `lib/fsm/flows/incidencia/`; cita tiene su propio árbol en [flujo-cita.md](flujo-cita.md).

## Entradas

Todas llegan al mismo paso: la ubicación.

| Entrada | Cómo se reconoce | Dónde |
|---|---|---|
| **QR** del establecimiento | Mensaje con la etiqueta `CODIGO-IPRESS` y un valor: `Hola quiero presentar una incidencia {Nombre} - CODIGO-IPRESS {código}`. Va **antes** de saludo, emergencia, fuera de alcance y cita | `parseInicioIncidencia` |
| Texto que la anuncia | Empieza con «quiero presentar / reportar / registrar una incidencia». Lo que sigue se toma como nombre candidato | `parseInicioIncidencia` |
| Menú | Fila «Registrar una incidencia», o `2` en el primer mensaje | `main-menu.ts`, `first-contact.ts` |
| Palabra suelta | `incidencia`, `reclamo`, `queja`, `denuncia` (y plurales), y los insultos con queja de servicio | `menu-shortcuts.ts`, `lexical-guard-routing.ts` |

La parte precargada por el QR no pasa por el filtro de insultos ni por el de emergencia (hay centros que se llaman «C.S.M.»): solo cuenta lo que la persona agregó después del código (`textoDeLaPersona`).

## Pasos

```
entrada ─► ubicación ─► nombre o anónimo ─► relato ─► foto ─► registro
```

1. **Ubicación** (`ubicacion.ts`). Con código se busca por código; con nombre, por parecido sobre el padrón (`lib/establecimientos/`, `pg_trgm`, con los sinónimos posta, c.s. y p.s.).
   - Un resultado claro: `¿Estás seguro de esa ubicación?` con **Sí, es ese** / **No, es otro**.
   - De 2 a 5 parecidos: lista para elegir, con **Ninguno de estos**.
   - Demasiados o ninguno: se pide el nombre completo o el código IPRESS.
   - Tres intentos fallidos, «no sé», «omitir» o una base que no responde: `¿Quieres continuar sin indicar el establecimiento?`. Con «Sí» sigue sin establecimiento.
2. **Nombre o anónimo**.
3. **Relato** (`borrador.ts`). Si la persona ya escribió algo aprovechable (20 caracteres o más, sin ruido) junto a la frase de inicio, se le muestra y pregunta **Usar así** / **Agregar más**; si no, se le pide siempre. «Agregar más» une lo nuevo al borrador (hasta 1000 caracteres).
4. **Foto** (solo con servicio de imágenes) y **registro** en la base.

## Lo que todavía no hace

- No guarda el establecimiento en la incidencia: queda en la sesión (`incidenciaEstablecimiento*`).
- No devuelve el código de seguimiento al cerrar.
- La IA no entra todavía como entrada: el texto ambiguo de reclamo sigue yendo a «no claro».
- El nombre se pide escrito, sin consultar RENIEC.
