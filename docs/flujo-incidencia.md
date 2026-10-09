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
2. **Nombre o anónimo**. Con nombre se pide el número de documento. **Por ahora solo se acepta el DNI** (8 dígitos): se valida en RENIEC y de ahí sale el nombre completo (`RENIEC_LOOKUP_BASE_URL` y `SANDBOX_USE_REAL_RENIEC=true`; sin ellas solo el DNI de prueba). Quien escribe 9 dígitos (carnet de extranjería) recibe «Por ahora este canal solo valida el DNI» con el botón **Continuar anónimo**. Si RENIEC no encuentra el DNI o no responde, se disculpa y pide un nombre o alias; el DNI tecleado se guarda aunque no se haya podido validar.
3. **Relato** (`borrador.ts`, mínimo 20 y máximo 1000 caracteres; un texto más corto se pide ampliar). Si la persona ya escribió algo aprovechable (20 caracteres o más, sin ruido) junto a la frase de inicio, se le muestra y pregunta **Usar así** / **Agregar más**; si no, se le pide siempre. «Agregar más» une lo nuevo al borrador (hasta 1000 caracteres).
4. **Evidencia** (opcional, siempre se ofrece) y **registro** en la base, con el establecimiento confirmado (`establecimiento_id`; nulo si la persona siguió sin él). Al cerrar, **con establecimiento se entrega el código de seguimiento** (`MINSA-AAAA-NNNNNN`, lo asigna la base) y sin él solo se agradece. Una reentrega del mismo mensaje no duplica la incidencia y devuelve el mismo código. Si llega un archivo (imagen o PDF) se acusa recibo («Ok, se registró tu evidencia.») pero **no se descarga ni se guarda**; con `OMITIR`, un «no» o un texto que lo diga (la IA lo entiende) se sigue sin él. Los stickers, audios y demás no son archivos y se ignoran en silencio, igual que cualquier imagen o PDF enviado fuera de este paso.

## Cancelar y límites

- **«Quiero cerrar»** (mensaje completo, también «cerrar», «cerrar sesión» o «terminar la sesión») cancela desde cualquier paso: no se guarda nada, se limpia la sesión y el siguiente mensaje empieza de nuevo. Un relato que solo contiene la frase no cancela.
- **Tope diario:** un teléfono puede registrar hasta **5 incidencias por día** (día de Lima; constante `MAX_INCIDENCIAS_POR_DIA` en `lib/recepcion/dto.ts`, cifra provisional). La sexta recibe «Hoy ya registraste el máximo de incidencias permitido. Podrás registrar otra mañana.» y no se guarda. La reentrega de la última incidencia permitida no se rechaza. Desde el sandbox cuenta por el campo `from`: para probar de nuevo, usar otro.

## Lo que todavía no hace

- El canal de origen se guarda siempre como WhatsApp, también desde el sandbox.
- La IA no entra todavía como entrada: el texto ambiguo de reclamo sigue yendo a «no claro».
