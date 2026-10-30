# Flujo de incidencia

Cómo empieza y avanza una incidencia (reclamo, queja, denuncia o corrupción: el ciudadano ve «denuncia anticorrupción», y dentro del flujo «tu denuncia»). Código en `lib/fsm/flows/incidencia/`; cita tiene su propio árbol en [flujo-cita.md](flujo-cita.md).

## Entradas

Todas llegan al mismo primer paso: la autorización de datos. Existen solo con `INCIDENCIAS_ENABLED=true` (apagada por defecto): sin ella ninguna entrada abre el flujo y el bot responde que por ahora solo agenda citas y consulta referencias, con el menú de dos filas.

| Entrada | Cómo se reconoce | Dónde |
|---|---|---|
| **QR** del establecimiento | Mensaje con la etiqueta `CODIGO-IPRESS` y un valor: `Hola quiero presentar una incidencia {Nombre} - CODIGO-IPRESS {código}`. Va **antes** de saludo, emergencia, fuera de alcance y cita | `parseInicioIncidencia` |
| Texto que la anuncia | Empieza con «quiero presentar / reportar / registrar una incidencia» o «… una denuncia» (con o sin «anticorrupción»). Lo que sigue se toma como nombre candidato | `parseInicioIncidencia` |
| Menú | Fila «Denuncia anticorrupción», o `2` (con la bandera encendida) | `main-menu.ts`, `first-contact.ts` |
| Palabra suelta | `incidencia`, `reclamo`, `queja`, `denuncia`, `anticorrupción`, `corrupción`, `coima`, `soborno` (y plurales), y los insultos con queja de servicio | `menu-shortcuts.ts`, `lexical-guard-routing.ts` |

La parte precargada por el QR no pasa por el filtro de insultos ni por el de emergencia (hay centros que se llaman «C.S.M.»): solo cuenta lo que la persona agregó después del código (`textoDeLaPersona`).

## Pasos

```
entrada ─► consentimiento ─► aviso+ubicación ─► documento/anónimo ─► relato ─► evidencia ─► registro
```

Toda entrada pasa por `beginIncidencia` (`inicio.ts`), que guarda en el slot `incidenciaInicio` el código, el nombre y el saludo de la entrada («¡Hola!», «Lamentamos lo ocurrido.») y consulta si la persona ya autorizó.

0. **Consentimiento** (`consentimiento.ts`). Si la persona ya autorizó antes (`chatbot.usuario.consentimiento_aceptado_en`; sin base, un almacén en la memoria del proceso), se salta. Si no, el bot manda **un solo** efecto de consentimiento: en el Chat-bot es un modal «Autorización de datos» con el aviso de privacidad, el botón **Acepto, autorizo mis datos** y **No autorizo** (el globo dice «Para registrar tu denuncia necesitamos tu autorización.» y el botón **Revisar autorización** lo vuelve a abrir); en WhatsApp es un mensaje con el aviso, «¿Autorizas el tratamiento de tus datos?» y los botones **Sí, autorizo** / **No autorizo**. El saludo de la entrada va delante de ese primer mensaje. «Autorizo» escrito vale igual que el botón y queda registrado; «No autorizo» cierra sin guardar nada.
1. **Aviso y ubicación** (`ubicacion.ts`). Sin código ni nombre, un solo mensaje une el saludo (si el consentimiento se saltó), el aviso de emergencia propio de la denuncia (**SAMU: 106** y **Bomberos: 116** en negrita, sin la línea de acudir al establecimiento, que sigue solo en el corte real de emergencia) y «Vamos, cuéntame, ¿en qué establecimiento de salud ocurrió? *Escribe su nombre o su código IPRESS*.». Con código se busca por código; con nombre, por parecido sobre el padrón (`lib/establecimientos/`, `pg_trgm`, con los sinónimos posta, c.s. y p.s.). Con QR o nombre, el aviso va encima de la primera respuesta de la búsqueda, en el mismo mensaje (`withPrefixedFirstMessage`).
   - Un resultado claro: `¿Estás seguro de esa ubicación?` con **Sí, es ese** / **No, es otro**.
   - De 2 a 5 parecidos: lista para elegir, con **Ninguno de estos**.
   - Demasiados o ninguno: se pide el nombre completo o el código IPRESS.
   - Tres intentos fallidos, «no sé», «omitir» o una base que no responde: `¿Quieres continuar sin indicar el establecimiento?`. Con «Sí» sigue sin establecimiento.
2. **Documento o anónimo**. Va en el mismo mensaje que acepta el establecimiento: «Perfecto, registraremos tu denuncia en *X*. ¿Deseas registrarla con tu número de documento o prefieres que sea anónima?», con **Con mi documento** / **Prefiero ser anónimo**. Si se siguió sin establecimiento, o hay que repetirla, la pregunta es «¿Deseas registrar tu denuncia con tu número de documento o prefieres que sea anónima?». Con documento, el bot lo **infiere por su largo, sin preguntar el tipo**: 8 dígitos es un DNI y 9 un carnet de extranjería (`DNI_OR_CARNET_DIGITS`); otra cosa se rechaza con «Documento inválido…» y el botón **Continuar anónimo**. El tope es de 12 caracteres (`DOCUMENTO_MAX_LENGTH`). **No se consulta RENIEC ni se pide nombre**: el número se guarda en `dni_reclamante` y el nombre lo completará después el backend de incidencias. El resumen final muestra «Identificado con documento terminado en NNNN».
3. **Relato** (`borrador.ts`, mínimo 20 y máximo 1000 caracteres; un texto más corto se pide ampliar). Si la persona ya escribió algo aprovechable (20 caracteres o más, sin ruido) junto a la frase de inicio, se le muestra y pregunta **Usar así** / **Agregar más**; si no, se le pide siempre. «Agregar más» une lo nuevo al borrador (hasta 1000 caracteres).
4. **Evidencia** (opcional, siempre se ofrece) y **registro** en la base, con el establecimiento confirmado (`establecimiento_id`; nulo si la persona siguió sin él). Se aceptan **hasta 5 imágenes** de hasta 5 MB: después de cada una el bot confirma («Recibimos tu imagen (2 de 5)…») y ofrece enviar otra o tocar **Listo, continuar** (también vale escribir `LISTO`); al llegar a la quinta pasa solo a confirmar. Si una imagen no se guarda, el bot **dice por qué** (pesa más de 5 MB, no se pudo descargar de WhatsApp, no es una imagen válida o ya la había enviado) y deja seguir. Un PDF u otro documento todavía no se guarda y el bot lo dice. Las imágenes se guardan en la propia base, en base64, salvo que haya un servicio de imágenes (`MEDIA_STORAGE_BASE_URL`). Con `OMITIR`, un «no» o un texto que lo diga (la IA lo entiende) se sigue sin evidencia. Al cerrar, **con establecimiento se entrega el código de seguimiento** (`MINSA-AAAA-NNNNNN`, o `MINSA-AAAA-A-NNNNNN` si la incidencia es anónima; lo asigna la base, con un correlativo por año y por serie, de 6 dígitos o más) y sin él solo se agradece. Una reentrega del mismo mensaje no duplica la incidencia y devuelve el mismo código. Los stickers, audios y demás no son archivos y se ignoran en silencio, igual que cualquier imagen o PDF enviado fuera de este paso.

## Cancelar y límites

- **«Quiero cerrar»** (mensaje completo, también «cerrar», «cerrar sesión» o «terminar la sesión») cancela desde cualquier paso: no se guarda nada, se limpia la sesión y el siguiente mensaje empieza de nuevo. Un relato que solo contiene la frase no cancela.
- **Tope diario:** un teléfono puede registrar hasta **5 incidencias por día** (día de Lima; constante `MAX_INCIDENCIAS_POR_DIA` en `lib/recepcion/dto.ts`, cifra provisional). La sexta recibe «Hoy ya registraste el máximo de incidencias permitido. Podrás registrar otra mañana.» y no se guarda. La reentrega de la última incidencia permitida no se rechaza. Desde el Chat-bot cuenta por el campo `from`: para probar de nuevo, usar otro.

## Lo que todavía no hace

- El canal de origen se guarda siempre como WhatsApp, también cuando la conversación viene del Chat-bot.
- La IA no entra todavía como entrada: el texto ambiguo de reclamo sigue yendo a «no claro».
