# Diccionario de datos

> **Generado automáticamente** por `generar-diccionario.mjs` desde la base real (PostgreSQL 18.6). **No se edita a mano**: se cambia `diccionario.json` y se vuelve a generar. El script falla si falta la descripción de una tabla, una columna o una llave foránea.
> Convención: tablas y columnas en español y en singular; lo que viene de Meta en inglés. Fechas en UTC. Detalle del diseño en [[Base De Datos]].

## Esquemas

| Esquema | Para qué sirve |
|---|---|
| `catalogo` | Catálogos compartidos por todas las plataformas. Cada fila es un valor permitido; se usan con llave foránea en lugar de enumerados para poder agregar valores sin cambiar la estructura. |
| `chatbot` | Plataforma 1: recepción de incidencias del paciente por WhatsApp o web. Registra al usuario, sus mensajes, lo que reporta y las evidencias. |
| `gestion` | Plataforma 2: gestión de pacientes inconformes. Es la única que necesita usuarios internos y roles. |
| `ia` | Plataforma 3: aprendizaje de la IA. Recibe una copia de cada categoría que una persona revisó, ya sea corrigiéndola o confirmándola. |

## Resumen de tablas

| Tabla | Descripción |
|---|---|
| `catalogo.area` | Área que atiende incidencias: cada establecimiento de salud tiene la suya, y existen además áreas como OTRANS o la sede central. |
| `catalogo.canal_origen` | Canal por el que llegó la incidencia (WhatsApp o web). |
| `catalogo.categoria_incidencia` | Categoría que asigna la IA a una incidencia del paciente: denuncia por corrupción, queja, reclamo u otro (cuando el texto no encaja o la IA no puede clasificarlo con seguridad y decide una persona). |
| `catalogo.direccion_mensaje` | Sentido de un mensaje: entrante (del ciudadano al bot) o saliente (del bot al ciudadano). |
| `catalogo.establecimiento_salud` | Establecimiento de salud del padrón RENIPRESS. |
| `catalogo.estado_archivo` | Estados por los que pasa un archivo subido por el ciudadano: recibido, verificando, verificado o rechazado. |
| `catalogo.estado_conversacion` | Si la conversación con un usuario está abierta o cerrada. |
| `catalogo.estado_incidencia` | Estados por los que pasa una incidencia: registrado, clasificado (la IA ya asignó categoría), derivado (enviado al área competente), en gestión, resuelto y archivado (a los 3 días de resuelta, o cuando un caso abierto supera el plazo de atención). |
| `catalogo.estado_mensaje` | Estado de entrega de un mensaje enviado por WhatsApp (pendiente, enviado, entregado, leído, fallido). |
| `catalogo.motivo_archivo` | Por qué se archivó una incidencia: resuelta con la vigencia cumplida, vencida sin atender o con datos insuficientes para gestionarla. |
| `catalogo.nivel_atencion` | Nivel de atención de un establecimiento de salud (I, II o III). |
| `catalogo.tipo_area` | Tipo de área a la que se puede derivar una incidencia: establecimiento, OTRANS, DIRIS, instituto o sede central. |
| `catalogo.tipo_evidencia` | Tipo de archivo adjunto como evidencia (imagen, video, documento, audio). |
| `catalogo.tipo_mensaje` | Tipo de contenido de un mensaje (texto, imagen, audio, documento, ubicación, plantilla). |
| `chatbot.archivo_recibido` | Cada archivo que el ciudadano sube a través de una solicitud de carga, con su estado de verificación. |
| `chatbot.contador_codigo_incidencia` | Último correlativo usado en cada año para el código de las incidencias. |
| `chatbot.evidencia` | Archivo que el paciente adjunta a su reporte (imagen, video, documento o audio). |
| `chatbot.incidencia_analisis` | Análisis automático de una incidencia (puntaje y señales de las reglas, y lo que el relato menciona: cargo, área y nombre). |
| `chatbot.incidencia_paciente` | Incidencia que el paciente reporta al chatbot: denuncia por corrupción, queja o reclamo. |
| `chatbot.incidencia_paciente_auditoria` | Historial de cambios de cada incidencia de paciente: qué cambió, valor anterior y nuevo, quién y cuándo. |
| `chatbot.mensaje` | Mensaje de la conversación, entrante o saliente. |
| `chatbot.sesion_conversacion` | Estado temporal del flujo conversacional de cada usuario (en qué paso va y qué datos ha dado). |
| `chatbot.solicitud_carga` | Permiso temporal para que el ciudadano suba archivos de una incidencia desde la página de carga. |
| `chatbot.usuario` | Persona que escribe al chatbot, identificada por el id de su chat de WhatsApp. |
| `gestion.rol` | Rol que puede tener un usuario interno de la plataforma de gestión: administrador, gestor (revisa y deriva), OTRANS (denuncias por corrupción), establecimiento y DIRIS (esta última desactivada). |
| `gestion.rol_categoria` | Qué categorías de incidencia puede ver cada rol. |
| `gestion.sesion_usuario` | Sesión abierta por un usuario interno. |
| `gestion.usuario_interno` | Persona de la institución que gestiona los casos. |
| `gestion.usuario_rol` | Relación entre usuarios internos y roles: un usuario puede tener varios roles y un rol lo tienen varios usuarios. |
| `ia.entrenamiento_categoria` | Copia de cada categoría que una persona revisó (corrigiéndola o confirmándola): lo que dijo la IA, lo que se decidió y el texto del caso. |

### `catalogo.area`

Área que atiende incidencias: cada establecimiento de salud tiene la suya, y existen además áreas como OTRANS o la sede central. A una incidencia se la deriva a un área y los usuarios internos pertenecen a una. Las áreas pueden depender de otra (padre).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | integer | No |  | PK | Identificador numérico de la fila, generado por la base. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `tipo_area_id` | smallint | No |  | FK | Tipo del área. |
| `padre_id` | integer | Sí |  | FK | Área de la que depende, si tiene una (por ejemplo la DIRIS de un establecimiento). Nulo en la cima. No puede ser la misma área. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_area_padre` | `padre_id` | `catalogo.area` | Enlaza el área con la que depende. Sirve para recorrer la jerarquía. |
| `fk_area_tipo_area` | `tipo_area_id` | `catalogo.tipo_area` | Garantiza que el tipo sea uno del catálogo. Sirve para saber si el área recibe denuncias sensibles. |

**Restricciones**

- `ck_area_padre`: `CHECK ((padre_id <> id))`.

**Índices**

- `ix_area_padre`: `USING btree (padre_id)`.

**Reglas que aplica la base (disparadores)**

- `trg_area_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_area_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.canal_origen`

Canal por el que llegó la incidencia (WhatsApp o web). Permite unificar canales en un mismo lugar.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.canal_origen_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_canal_origen_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_canal_origen_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.categoria_incidencia`

Categoría que asigna la IA a una incidencia del paciente: denuncia por corrupción, queja, reclamo u otro (cuando el texto no encaja o la IA no puede clasificarlo con seguridad y decide una persona). Marca cuáles son sensibles. Es un catálogo con llave foránea para poder agregar categorías sin cambiar la estructura.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.categoria_incidencia_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |
| `es_sensible` | boolean | No | `false` |  | Verdadero si la categoría es sensible (hoy, la denuncia por corrupción): se atiende solo por un área que reciba casos sensibles (OTRANS) y siempre pasa por revisión humana. La base impide derivarla a un establecimiento. |

**Reglas que aplica la base (disparadores)**

- `trg_categoria_incidencia_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_categoria_incidencia_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.direccion_mensaje`

Sentido de un mensaje: entrante (del ciudadano al bot) o saliente (del bot al ciudadano).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.direccion_mensaje_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_direccion_mensaje_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_direccion_mensaje_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.establecimiento_salud`

Establecimiento de salud del padrón RENIPRESS. Es el origen de una incidencia (donde ocurrió el hecho) y se carga desde el padrón, no con la migración. Se busca por nombre sin tildes con un índice de similitud.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | integer | No |  | PK | Identificador numérico de la fila, generado por la base. |
| `codigo_renipress` | text | No |  |  | Código RENIPRESS del establecimiento: de uno a ocho dígitos, SIN ceros a la izquierda (forma canónica: 6206, no 00006206, igual que el catálogo de citas del bot). Es único. Quien cargue o lea el código debe quitar los ceros iniciales antes de guardar o comparar. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `nombre_busqueda` | text | Sí |  |  | Nombre sin tildes y en minúscula, que calcula la base. Es el que usa la búsqueda por similitud (índice de trigramas); no se escribe. |
| `nivel_atencion_id` | smallint | Sí |  | FK | Nivel de atención del establecimiento (I, II o III). Si la fuente no lo trae: los hospitales son de nivel II o III y los demás establecimientos de nivel I. |
| `categoria` | text | Sí |  |  | Categoría oficial del establecimiento (por ejemplo I-1, I-4, II-2, III-1, III-E). Texto libre porque la fuente es el MINSA y puede cambiar; el nivel de atención va aparte para filtrar. |
| `departamento` | text | Sí |  |  | Departamento donde queda el establecimiento. |
| `provincia` | text | Sí |  |  | Provincia donde queda el establecimiento. |
| `distrito` | text | Sí |  |  | Distrito donde queda el establecimiento. |
| `red` | text | Sí |  |  | Red de salud a la que pertenece el establecimiento. |
| `area_id` | integer | No |  | FK | Área propia del establecimiento, a la que se le derivan sus incidencias. Cada establecimiento tiene una sola área y cada área sirve a un solo establecimiento. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_establecimiento_salud_area` | `area_id` | `catalogo.area` | Enlaza el establecimiento con su área. Sirve para derivarle sus incidencias. |
| `fk_establecimiento_salud_nivel_atencion` | `nivel_atencion_id` | `catalogo.nivel_atencion` | Garantiza que el nivel sea uno del catálogo. Sirve para filtrar por complejidad. |

**Restricciones**

- `ck_establecimiento_salud_renipress`: `CHECK ((codigo_renipress ~ '^[1-9][0-9]{0,7}$'::text))`.

**Índices**

- `ix_establecimiento_salud_nombre_busqueda`: `USING gin (nombre_busqueda gin_trgm_ops)`.

**Reglas que aplica la base (disparadores)**

- `trg_establecimiento_salud_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_establecimiento_salud_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.estado_archivo`

Estados por los que pasa un archivo subido por el ciudadano: recibido, verificando, verificado o rechazado. Es un catálogo con llave foránea para distinguir lo que solo se recibió de lo que ya pasó las verificaciones.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.estado_archivo_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_estado_archivo_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_estado_archivo_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.estado_conversacion`

Si la conversación con un usuario está abierta o cerrada.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.estado_conversacion_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_estado_conversacion_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_estado_conversacion_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.estado_incidencia`

Estados por los que pasa una incidencia: registrado, clasificado (la IA ya asignó categoría), derivado (enviado al área competente), en gestión, resuelto y archivado (a los 3 días de resuelta, o cuando un caso abierto supera el plazo de atención). Anulado está retirado: anular es el borrado lógico. Los valores son provisionales hasta que la unidad usuaria confirme su flujo.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.estado_incidencia_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_estado_incidencia_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_estado_incidencia_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.estado_mensaje`

Estado de entrega de un mensaje enviado por WhatsApp (pendiente, enviado, entregado, leído, fallido).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.estado_mensaje_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_estado_mensaje_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_estado_mensaje_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.motivo_archivo`

Por qué se archivó una incidencia: resuelta con la vigencia cumplida, vencida sin atender o con datos insuficientes para gestionarla.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.motivo_archivo_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_motivo_archivo_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_motivo_archivo_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.nivel_atencion`

Nivel de atención de un establecimiento de salud (I, II o III).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.nivel_atencion_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_nivel_atencion_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_nivel_atencion_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.tipo_area`

Tipo de área a la que se puede derivar una incidencia: establecimiento, OTRANS, DIRIS, instituto o sede central. Define además qué tipos reciben denuncias sensibles y a qué tipo pertenece cada rol de gestión.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.tipo_area_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `recibe_sensibles` | boolean | No | `false` |  | Verdadero si las áreas de este tipo pueden recibir incidencias de categorías sensibles (hoy, solo OTRANS). La base impide derivar un caso sensible a un área cuyo tipo no lo reciba. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_tipo_area_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_tipo_area_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.tipo_evidencia`

Tipo de archivo adjunto como evidencia (imagen, video, documento, audio).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.tipo_evidencia_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_tipo_evidencia_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_tipo_evidencia_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `catalogo.tipo_mensaje`

Tipo de contenido de un mensaje (texto, imagen, audio, documento, ubicación, plantilla).

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('catalogo.tipo_mensaje_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Reglas que aplica la base (disparadores)**

- `trg_tipo_mensaje_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_tipo_mensaje_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `chatbot.archivo_recibido`

Cada archivo que el ciudadano sube a través de una solicitud de carga, con su estado de verificación. Un archivo nace RECIBIDO, pasa a VERIFICANDO y termina VERIFICADO o RECHAZADO; los estados finales no cambian. Los verificados se enlazan después a su evidencia definitiva. No se borra.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `solicitud_carga_id` | uuid | No |  | FK | Solicitud de carga con la que se subió el archivo. |
| `nombre_original` | text | Sí |  |  | Nombre que tenía el archivo en el dispositivo del ciudadano. Es un dato informativo y puede venir vacío. |
| `mime_declarado` | text | No |  |  | Tipo de archivo que declaró el navegador al subirlo. No es de fiar: se contrasta con el tipo detectado. |
| `mime_detectado` | text | Sí |  |  | Tipo real del archivo, según su firma interna (primeros bytes), que fija el proceso de verificación. Obligatorio para marcarlo verificado. |
| `tamano` | bigint | No |  |  | Tamaño del archivo en bytes. Debe ser mayor que cero. |
| `hash_archivo` | text | Sí |  |  | Huella SHA-256 del contenido, calculada por el proceso de verificación. Obligatoria para marcarlo verificado. |
| `ruta_cuarentena` | text | No |  |  | Ruta donde quedó el archivo mientras se verifica. Nada se sirve desde la cuarentena. |
| `estado_archivo_id` | smallint | No | `1` | FK | Estado actual de verificación del archivo. Nace en RECIBIDO. |
| `motivo_rechazo` | text | Sí |  |  | Por qué se rechazó el archivo. Es obligatorio si está rechazado y debe estar vacío en cualquier otro estado. |
| `verificado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que el archivo llegó a un estado final (verificado o rechazado). La llena la base. |
| `evidencia_id` | uuid | Sí |  | FK | Evidencia definitiva a la que se promovió el archivo verificado. Se enlaza una sola vez y es única. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_archivo_recibido_estado_archivo` | `estado_archivo_id` | `catalogo.estado_archivo` | Garantiza que el estado del archivo sea uno del catálogo. Sirve para distinguir lo recibido de lo verificado. |
| `fk_archivo_recibido_evidencia` | `evidencia_id` | `chatbot.evidencia` | Enlaza el archivo verificado con su evidencia definitiva. Sirve para rastrear de qué subida salió cada evidencia. |
| `fk_archivo_recibido_solicitud_carga` | `solicitud_carga_id` | `chatbot.solicitud_carga` | Cada archivo llegó por una solicitud de carga. Sirve para contar y listar los archivos de una solicitud. |

**Restricciones**

- `ck_archivo_recibido_cierre`: `CHECK (((estado_archivo_id = ANY (ARRAY[3, 4])) = (verificado_en IS NOT NULL)))`.
- `ck_archivo_recibido_rechazo`: `CHECK (((estado_archivo_id = 4) = (motivo_rechazo IS NOT NULL)))`.
- `ck_archivo_recibido_tamano`: `CHECK ((tamano > 0))`.
- `ck_archivo_recibido_verificado`: `CHECK (((estado_archivo_id <> 3) OR ((mime_detectado IS NOT NULL) AND (hash_archivo IS NOT NULL))))`.

**Índices**

- `ix_archivo_recibido_pendiente`: `USING btree (fecha_creacion) WHERE (estado_archivo_id = ANY (ARRAY[1, 2]))`.
- `ix_archivo_recibido_solicitud_estado`: `USING btree (solicitud_carga_id, estado_archivo_id)`.

**Reglas que aplica la base (disparadores)**

- `trg_archivo_recibido_a_reglas` (Antes de modificar): Hace cumplir el recorrido del archivo: recibido, verificando y verificado o rechazado, sin saltos; los datos de lo recibido no cambian, los estados finales no se modifican y la fecha de verificación la fija la base.
- `trg_archivo_recibido_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_archivo_recibido_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_archivo_recibido_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.

### `chatbot.contador_codigo_incidencia`

Último correlativo usado en cada año para el código de las incidencias. Una fila por año, que la base incrementa dentro de la misma transacción de la inserción: si la transacción se revierte el número no se gasta y dos inserciones simultáneas esperan su turno. Solo avanza y nunca se borra.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `anio` | smallint | No |  | PK | Año del código (zona America/Lima), de cuatro dígitos. Es la clave: hay una fila por año. |
| `ultimo` | integer | No | `0` |  | Último correlativo entregado ese año. El próximo código usa este valor más uno. Solo puede subir. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se creó la fila del año, es decir, cuando llegó la primera incidencia de ese año. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) del último código entregado ese año. La llena un disparador. |

**Restricciones**

- `ck_contador_codigo_incidencia_anio`: `CHECK (((anio >= 1000) AND (anio <= 9999)))`.
- `ck_contador_codigo_incidencia_ultimo`: `CHECK ((ultimo >= 0))`.

**Reglas que aplica la base (disparadores)**

- `trg_contador_codigo_incidencia_a_reglas` (Antes de borrar o modificar): Impide borrar filas del contador de códigos, cambiar su año o bajar el último correlativo.
- `trg_contador_codigo_incidencia_b_fecha` (Antes de modificar): Al modificar: actualiza la fecha de modificación.

### `chatbot.evidencia`

Archivo que el paciente adjunta a su reporte (imagen, video, documento o audio). El archivo vive en el servicio de imágenes; aquí solo queda su ruta. Solo se inserta: nunca se modifica ni se borra.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `incidencia_paciente_id` | uuid | No |  | FK | Reporte al que pertenece la evidencia. |
| `mensaje_id` | uuid | Sí |  | FK | Mensaje de WhatsApp del que vino el archivo. Opcional. |
| `media_id` | text | Sí |  |  | Id del archivo en Meta (dato de Meta). |
| `tipo_evidencia_id` | smallint | No |  | FK | Tipo de archivo. |
| `mime_type` | text | No |  |  | Tipo MIME del archivo. |
| `nombre_archivo` | text | Sí |  |  | Nombre original, si Meta lo entrega. |
| `tamano` | integer | No |  |  | Tamaño en bytes. Debe ser mayor que cero. |
| `ruta` | text | No |  |  | Ruta que devolvió el servicio de imágenes. Nunca el archivo ni un data URI. |
| `hash_archivo` | text | Sí |  |  | Huella SHA-256 del archivo, para integridad y detección de duplicados. Queda vacía en la primera etapa. |
| `fecha_recepcion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se recibió el archivo. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_evidencia_incidencia_paciente` | `incidencia_paciente_id` | `chatbot.incidencia_paciente` | Cada evidencia pertenece a un reporte. Sirve para listar los archivos de un caso. |
| `fk_evidencia_mensaje` | `mensaje_id` | `chatbot.mensaje` | Enlaza la evidencia con el mensaje de WhatsApp del que vino. Sirve para rastrear su origen. Si el mensaje se depura, queda en nulo. |
| `fk_evidencia_tipo_evidencia` | `tipo_evidencia_id` | `catalogo.tipo_evidencia` | Garantiza que el tipo de archivo sea uno del catálogo. Sirve para decidir cómo mostrarlo. |

**Restricciones**

- `ck_evidencia_tamano`: `CHECK ((tamano > 0))`.

**Índices**

- `ix_evidencia_incidencia_paciente`: `USING btree (incidencia_paciente_id)`.

**Reglas que aplica la base (disparadores)**

- `trg_evidencia_b_auditoria_ins` (Antes de insertar): Al insertar: llena la fecha y el usuario de creación.
- `trg_evidencia_bloqueo` (Antes de borrar o modificar): Tabla de solo inserción: bloquea modificar y borrar.

### `chatbot.incidencia_analisis`

Análisis automático de una incidencia (puntaje y señales de las reglas, y lo que el relato menciona: cargo, área y nombre). Uno por incidencia; solo se inserta. El nombre mencionado vive aquí y no en la incidencia para que no se copie al historial de cambios.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `incidencia_paciente_id` | uuid | No |  | PK, FK | Incidencia analizada. Es la llave de la tabla: hay un análisis por incidencia. |
| `version_reglas` | text | No |  |  | Versión del conjunto de reglas que produjo el análisis. Sin ella, los puntajes de versiones distintas no se pueden comparar. |
| `puntaje` | smallint | No |  |  | Puntaje que dieron las reglas al caso. Sirve para ordenar la revisión. |
| `senales` | jsonb | No |  |  | Señales que detectaron las reglas, en JSON. No lleva índice: solo se lee junto con el caso. |
| `cargo_mencionado` | text | Sí |  |  | Cargo de la persona señalada en el relato, si el texto lo menciona. |
| `area_mencionada_id` | integer | Sí |  | FK | Área que el relato menciona, si se pudo reconocer. |
| `nombre_mencionado` | text | Sí |  |  | Nombre de la persona señalada en el relato, si el texto lo menciona. Está aquí y no en la incidencia a propósito, para que no pase al historial de cambios. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_incidencia_analisis_area_mencionada` | `area_mencionada_id` | `catalogo.area` | Garantiza que el área mencionada sea una del catálogo. Sirve para ubicar el área señalada. |
| `fk_incidencia_analisis_incidencia_paciente` | `incidencia_paciente_id` | `chatbot.incidencia_paciente` | Cada análisis pertenece a una incidencia. Sirve para unir el análisis con el caso. |

**Reglas que aplica la base (disparadores)**

- `trg_incidencia_analisis_b_auditoria_ins` (Antes de insertar): Al insertar: llena la fecha y el usuario de creación.
- `trg_incidencia_analisis_bloqueo` (Antes de borrar o modificar): Tabla de solo inserción: bloquea modificar y borrar.

### `chatbot.incidencia_paciente`

Incidencia que el paciente reporta al chatbot: denuncia por corrupción, queja o reclamo. Es el registro central. Nace con la categoría vacía y datos mínimos; luego la IA asigna la categoría y una persona la corrige o la confirma, una sola vez. Los datos de origen no se pueden modificar. Cada incidencia lleva un código legible (MINSA-AAAA-NNNNNN) que asigna la base. Puede llevar el establecimiento de origen (que no cambia) y el área de destino; la derivación, la toma en gestión y el archivado registran con quién y cuándo, y lo llena la base. Un caso de categoría sensible solo puede estar en un área que reciba casos sensibles. Nunca se borra: se desactiva.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `canal_origen_id` | smallint | No |  | FK | Canal por el que llegó (WhatsApp o web). |
| `usuario_id` | uuid | No |  | FK | Usuario que presentó el reporte. |
| `mensaje_id` | uuid | Sí |  | FK | Mensaje del chat del que nació el reporte. Opcional. |
| `wa_id` | text | No |  |  | Id del chat (dato de Meta). Copia del usuario para filtrar sin unir tablas y para enlazar el reporte con el chat. |
| `es_anonimo` | boolean | No |  |  | Verdadero si el paciente eligió no dar su DNI ni su nombre. El id del chat se guarda igual. |
| `dni_reclamante` | text | Sí |  |  | DNI del paciente al momento de presentar el reporte (foto fija: no cambia si el usuario se actualiza después). Nulo si es anónimo. |
| `nombre_reclamante` | text | Sí |  |  | Nombre del paciente al momento de presentar el reporte. Nulo si es anónimo. |
| `descripcion` | text | No |  |  | Relato del paciente. Es el texto que analiza la IA. No se puede modificar. |
| `estado_incidencia_id` | smallint | No | `1` | FK | Estado actual de la incidencia. Nace en REGISTRADO; la base lo pasa a CLASIFICADO cuando la IA asigna la categoría y a RESUELTO cuando se registra la resolución, y solo permite las transiciones definidas. DERIVADO y EN_GESTION exigen que la IA ya haya asignado categoría y que haya área de destino. ARCHIVADO exige un motivo: desde RESUELTO (pasó la vigencia de la resolución); desde un estado abierto cuyo plazo de atención venció, solo por el sistema; o, desde REGISTRADO o CLASIFICADO, por datos insuficientes, que archiva el filtro del sistema o una persona. |
| `trace_id` | text | No |  |  | Identificador del turno del chat que lo originó. Es único: una reentrega de Meta no duplica el reporte. |
| `categoria_id` | smallint | Sí |  | FK | Categoría vigente: la que asignó la IA o, si una persona la corrigió, la corregida. |
| `categoria_ia_id` | smallint | Sí |  | FK | Categoría que asignó la IA. Se asigna una sola vez y no se modifica; queda para medir cuánto se equivoca el modelo. |
| `categoria_confianza` | numeric(5,2) | Sí |  |  | Puntaje de confianza (0 a 100) que dio la IA a su categoría. No es una probabilidad calibrada: sirve para ordenar la revisión y para medir al modelo. Se asigna una sola vez. |
| `version_clasificador` | text | Sí |  |  | Versión del clasificador (modelo e instrucciones) que produjo la categoría y la confianza. Se asigna junto con ellas y no se modifica; sin ella, los puntajes de modelos distintos no se pueden comparar. |
| `categoria_asignada_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que la IA asignó la categoría. La llena la base. |
| `categoria_corregida_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) de la corrección humana. Nulo si nadie corrigió. La llena la base; solo se puede corregir una vez y no si ya se confirmó. |
| `categoria_corregida_por` | text | Sí |  |  | Quién corrigió la categoría. La llena la base. |
| `categoria_confirmada_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que una persona confirmó la categoría de la IA. La aplicación solo indica la confirmación; la fecha la fija la base. Se confirma una sola vez y no si ya fue corregida. |
| `categoria_confirmada_por` | text | Sí |  |  | Quién confirmó la categoría. La llena la base. |
| `resolucion` | text | Sí |  |  | Resolución que se dio al asunto. Se registra una sola vez. |
| `resuelto_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que se registró la resolución. La llena la base. |
| `resuelto_por` | text | Sí |  |  | Quién registró la resolución. La llena la base. |
| `establecimiento_id` | integer | Sí |  | FK | Establecimiento de salud donde ocurrió el hecho (dato de origen). Opcional. Una vez asignado no se puede cambiar; solo la carga de datos de la migración puede completarlo cuando estaba vacío. |
| `area_destino_id` | integer | Sí |  | FK | Área a la que se derivó o se asignó el caso. La base la asigna sola cuando la categoría es sensible y existe una única área que las recibe; solo se reasigna mientras el caso está CLASIFICADO o DERIVADO, y un caso sensible solo puede estar en un área que reciba casos sensibles. |
| `derivado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que el caso pasó a DERIVADO (o se reasignó su área). La llena la base. |
| `derivado_por` | text | Sí |  |  | Quién derivó el caso. La llena la base con el actor declarado. |
| `tomado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que el caso pasó a EN_GESTION. La llena la base. |
| `tomado_por` | text | Sí |  |  | Quién tomó el caso en gestión. La llena la base con el actor declarado. |
| `motivo_archivo_id` | smallint | Sí |  | FK | Por qué se archivó el caso. Nulo mientras no esté archivado. La base lo deduce (resuelto: vigencia cumplida; vencido sin resolución: sin atender); solo el archivado por datos insuficientes lo indica quien archiva. |
| `archivado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que el caso pasó a ARCHIVADO. La llena la base. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `eliminado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa. |
| `eliminado_por` | text | Sí |  |  | Quién hizo el borrado lógico. Nulo mientras la fila está activa. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |
| `codigo` | text | No | `''::text` |  | Código legible del caso, con el formato MINSA-AAAA-NNNNNN: AAAA es el año de llegada (zona America/Lima) y NNNNNN el correlativo de ese año, que reinicia cada año. Es único y sirve para nombrar el caso por teléfono o en un oficio. Lo genera la base al insertar (lo que se envíe se descarta) y no se puede modificar; las incidencias anteriores a su creación lo recibieron en orden de llegada. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_incidencia_paciente_area_destino` | `area_destino_id` | `catalogo.area` | Garantiza que el área de destino sea una del catálogo. Sirve para listar lo que debe atender cada área. |
| `fk_incidencia_paciente_canal_origen` | `canal_origen_id` | `catalogo.canal_origen` | Garantiza que el canal sea uno del catálogo. Sirve para unificar reportes de varios canales. |
| `fk_incidencia_paciente_categoria` | `categoria_id` | `catalogo.categoria_incidencia` | Garantiza que la categoría vigente sea una del catálogo. Sirve para dirigir el caso según sea denuncia, queja o reclamo. |
| `fk_incidencia_paciente_categoria_ia` | `categoria_ia_id` | `catalogo.categoria_incidencia` | Garantiza que la categoría original de la IA sea una del catálogo. Sirve para medir cuánto se equivoca el modelo. |
| `fk_incidencia_paciente_establecimiento_salud` | `establecimiento_id` | `catalogo.establecimiento_salud` | Garantiza que el establecimiento de origen sea uno del padrón. Sirve para listar los casos por establecimiento. |
| `fk_incidencia_paciente_estado_incidencia` | `estado_incidencia_id` | `catalogo.estado_incidencia` | Garantiza que el estado sea uno del catálogo. Sirve para listar lo pendiente de cada etapa. |
| `fk_incidencia_paciente_mensaje` | `mensaje_id` | `chatbot.mensaje` | Enlaza el reporte con el mensaje del chat del que nació. Sirve para reconstruir el contexto de la conversación. |
| `fk_incidencia_paciente_motivo_archivo` | `motivo_archivo_id` | `catalogo.motivo_archivo` | Garantiza que el motivo sea uno del catálogo. Sirve para saber por qué se archivó un caso. |
| `fk_incidencia_paciente_usuario` | `usuario_id` | `chatbot.usuario` | Cada reporte lo presenta un usuario. Sirve para ver todo lo que reportó una persona. |

**Restricciones**

- `ck_incidencia_paciente_anonimo`: `CHECK (((NOT es_anonimo) OR ((dni_reclamante IS NULL) AND (nombre_reclamante IS NULL))))`.
- `ck_incidencia_paciente_archivo`: `CHECK (((archivado_en IS NULL) = (motivo_archivo_id IS NULL)))`.
- `ck_incidencia_paciente_codigo`: `CHECK ((codigo ~ '^MINSA-[0-9]{4}-[0-9]{6,}$'::text))`.
- `ck_incidencia_paciente_confianza`: `CHECK (((categoria_confianza IS NULL) OR ((categoria_confianza >= (0)::numeric) AND (categoria_confianza <= (100)::numeric))))`.
- `ck_incidencia_paciente_derivacion`: `CHECK (((derivado_en IS NULL) = (derivado_por IS NULL)))`.
- `ck_incidencia_paciente_eliminacion`: `CHECK (((activo AND (eliminado_en IS NULL) AND (eliminado_por IS NULL)) OR ((NOT activo) AND (eliminado_en IS NOT NULL) AND (eliminado_por IS NOT NULL))))`.
- `ck_incidencia_paciente_estado`: `CHECK (((estado_incidencia_id = ANY (ARRAY[1, 4, 5, 7])) OR (categoria_ia_id IS NOT NULL)))`.
- `ck_incidencia_paciente_motivo_archivo`: `CHECK (((estado_incidencia_id = 7) = (motivo_archivo_id IS NOT NULL)))`.
- `ck_incidencia_paciente_resolucion`: `CHECK ((((resolucion IS NULL) = (resuelto_en IS NULL)) AND ((resolucion IS NULL) = (resuelto_por IS NULL))))`.
- `ck_incidencia_paciente_revision`: `CHECK ((((categoria_confirmada_en IS NULL) = (categoria_confirmada_por IS NULL)) AND ((categoria_confirmada_en IS NULL) OR (categoria_corregida_en IS NULL))))`.
- `ck_incidencia_paciente_toma`: `CHECK (((tomado_en IS NULL) = (tomado_por IS NULL)))`.

**Índices**

- `ix_incidencia_paciente_abierta`: `USING btree (area_destino_id, fecha_creacion) WHERE (activo AND (estado_incidencia_id = ANY (ARRAY[1, 2, 3, 6])))`.
- `ix_incidencia_paciente_categoria`: `USING btree (categoria_id)`.
- `ix_incidencia_paciente_cursor`: `USING btree (fecha_creacion DESC, id DESC) WHERE activo`.
- `ix_incidencia_paciente_destino_cursor`: `USING btree (area_destino_id, fecha_creacion DESC, id DESC) WHERE activo`.
- `ix_incidencia_paciente_destino_estado_fecha`: `USING btree (area_destino_id, estado_incidencia_id, fecha_creacion DESC) INCLUDE (categoria_id) WHERE activo`.
- `ix_incidencia_paciente_estado_fecha`: `USING btree (estado_incidencia_id, fecha_creacion)`.
- `ix_incidencia_paciente_origen_fecha`: `USING btree (establecimiento_id, fecha_creacion)`.
- `ix_incidencia_paciente_pendiente_ia`: `USING btree (fecha_creacion) WHERE ((categoria_ia_id IS NULL) AND activo)`.
- `ix_incidencia_paciente_pendiente_revision`: `USING btree (categoria_confianza, fecha_creacion) WHERE ((categoria_ia_id IS NOT NULL) AND (categoria_corregida_en IS NULL) AND (categoria_confirmada_en IS NULL) AND activo)`.
- `ix_incidencia_paciente_usuario_fecha`: `USING btree (usuario_id, fecha_creacion)`.

**Reglas que aplica la base (disparadores)**

- `trg_incidencia_paciente_a_reglas` (Antes de modificar): Hace cumplir las reglas de la incidencia: datos de origen (incluido el establecimiento) que no cambian, categoría de la IA y su revisión una sola vez, resolución una sola vez, máquina de estados, área de destino (obligatoria al derivar o tomar, y asignada sola para los casos sensibles) y motivo de archivado. Llena las fechas y actores que son de la base.
- `trg_incidencia_paciente_a_reglas_ins` (Antes de insertar): Al crear una incidencia valida que el establecimiento de origen exista y esté activo, y que nazca sin área de destino ni fechas de derivación, toma o archivado.
- `trg_incidencia_paciente_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_incidencia_paciente_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_incidencia_paciente_b_codigo_ins` (Antes de insertar): Al insertar una incidencia le pone su código y descarta el que haya enviado quien inserta.
- `trg_incidencia_paciente_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.
- `trg_incidencia_paciente_c_historial` (Después de insertar o modificar): Después de insertar o modificar, guarda el cambio en el historial.
- `trg_incidencia_paciente_d_entrenamiento` (Después de modificar): Cuando una persona corrige o confirma la categoría, copia el caso a la tabla de entrenamiento marcando cuál de las dos fue.

### `chatbot.incidencia_paciente_auditoria`

Historial de cambios de cada incidencia de paciente: qué cambió, valor anterior y nuevo, quién y cuándo. Solo se agrega; nunca se modifica ni se borra. La llena un disparador.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | bigint | No | `nextval('chatbot.incidencia_paciente_auditoria_id_seq'::regclass)` | PK | Número secuencial del evento; da el orden de los cambios. |
| `incidencia_paciente_id` | uuid | No |  | FK | Incidencia a la que corresponde el cambio. |
| `operacion` | character varying(16) | No |  |  | CREACION (guarda la fila completa) o ACTUALIZACION (guarda solo lo que cambió). |
| `cambios` | jsonb | No |  |  | Detalle en JSON. En una actualización, cada campo con su valor anterior y el nuevo. Hereda la sensibilidad de la tabla de origen. |
| `actor` | text | No |  |  | Quién hizo el cambio. |
| `version_fila` | integer | No |  |  | Versión que tenía la incidencia después del cambio. |
| `fecha_hora` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) del cambio, con el reloj de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_incidencia_paciente_auditoria_incidencia_paciente` | `incidencia_paciente_id` | `chatbot.incidencia_paciente` | Cada evento del historial pertenece a una incidencia. Sirve para reconstruir la vida completa de un reporte. |

**Restricciones**

- `ck_incidencia_paciente_auditoria_operacion`: `CHECK (((operacion)::text = ANY ((ARRAY['CREACION'::character varying, 'ACTUALIZACION'::character varying])::text[])))`.

**Índices**

- `ix_incidencia_paciente_auditoria_incidencia_fecha`: `USING btree (incidencia_paciente_id, fecha_hora)`.

**Reglas que aplica la base (disparadores)**

- `trg_incidencia_paciente_auditoria_bloqueo` (Antes de borrar o modificar): Tabla de solo inserción: bloquea modificar y borrar.

### `chatbot.mensaje`

Mensaje de la conversación, entrante o saliente. Es la tabla de mayor volumen: se estiman decenas de millones de filas por mes.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `usuario_id` | uuid | No |  | FK | Usuario dueño de la conversación a la que pertenece el mensaje. |
| `direccion_mensaje_id` | smallint | No |  | FK | Sentido del mensaje (entrante o saliente). |
| `tipo_mensaje_id` | smallint | No |  | FK | Tipo de contenido del mensaje. |
| `contenido` | text | Sí |  |  | Texto del mensaje, cuando aplica. |
| `media_id` | text | Sí |  |  | Id del archivo en Meta (dato de Meta). No es una URL. |
| `wa_message_id` | text | Sí |  |  | Id del mensaje en WhatsApp (dato de Meta). Es único: evita procesar dos veces una reentrega de Meta. |
| `estado_mensaje_id` | smallint | No | `1` | FK | Estado de entrega del mensaje. Lo actualiza Meta con sus avisos de entrega. |
| `fecha_hora` | timestamp(3) with time zone | No |  |  | Momento real del mensaje según WhatsApp. Es la fecha del evento y no se confunde con fecha_creacion, que es la de inserción. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_mensaje_direccion_mensaje` | `direccion_mensaje_id` | `catalogo.direccion_mensaje` | Garantiza que el sentido sea entrante o saliente. Sirve para distinguir lo que dijo el ciudadano de lo que respondió el bot. |
| `fk_mensaje_estado_mensaje` | `estado_mensaje_id` | `catalogo.estado_mensaje` | Garantiza que el estado de entrega sea uno del catálogo. Sirve para reintentar o reportar mensajes fallidos. |
| `fk_mensaje_tipo_mensaje` | `tipo_mensaje_id` | `catalogo.tipo_mensaje` | Garantiza que el tipo de contenido sea uno conocido. Sirve para decidir cómo mostrar o procesar el mensaje. |
| `fk_mensaje_usuario` | `usuario_id` | `chatbot.usuario` | Cada mensaje pertenece a un usuario. Sirve para armar la conversación de un usuario en orden. |

**Índices**

- `ix_mensaje_fallido`: `USING btree (usuario_id, fecha_hora) WHERE (estado_mensaje_id = 5)`.
- `ix_mensaje_fecha_hora_brin`: `USING brin (fecha_hora)`.
- `ix_mensaje_usuario_fecha_hora`: `USING btree (usuario_id, fecha_hora)`.

**Reglas que aplica la base (disparadores)**

- `trg_mensaje_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_mensaje_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `chatbot.sesion_conversacion`

Estado temporal del flujo conversacional de cada usuario (en qué paso va y qué datos ha dado). Es efímera: se reescribe en cada turno y se purga cuando queda inactiva. No guarda imágenes.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `wa_id` | text | No |  |  | Id del chat. Único: hay una sesión por usuario. No tiene llave foránea hacia usuario porque la sesión puede existir antes que el usuario. |
| `estado` | text | No |  |  | Estado actual del flujo conversacional (por ejemplo cita_awaiting_dni). Es texto y no catálogo porque lo define el código del bot y tiene más de 60 valores. |
| `slots` | jsonb | No |  |  | Datos recolectados durante el flujo, en JSON. La forma la garantiza el código del bot. |
| `contadores` | jsonb | No |  |  | Contadores internos del flujo (reintentos, intentos de código), en JSON. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última actividad. Sirve para purgar sesiones inactivas. La llena un disparador. |

**Índices**

- `ix_sesion_conversacion_fecha_modificacion`: `USING btree (fecha_modificacion)`.

**Reglas que aplica la base (disparadores)**

- `trg_sesion_conversacion_b_fecha` (Antes de modificar): Al modificar: actualiza la fecha de modificación.

### `chatbot.solicitud_carga`

Permiso temporal para que el ciudadano suba archivos de una incidencia desde la página de carga. Cada fila corresponde a un enlace firmado emitido por el bot: guarda a qué incidencia pertenece, cuándo vence y cuántos archivos y bytes se permiten. Nunca guarda el token, solo su huella. No se borra: se cierra.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `incidencia_paciente_id` | uuid | Sí |  | FK | Incidencia a la que se le agregarán los archivos. Nulo mientras el ciudadano aún está armando el reporte en el chat; se enlaza una sola vez cuando la incidencia se crea. |
| `sesion_id` | uuid | Sí |  |  | Sesión de conversación (borrador del reporte) para la que se emitió el enlace antes de que existiera la incidencia. Sin llave foránea a propósito: la purga de sesiones inactivas borra la sesión. Obligatoria mientras no haya incidencia. |
| `usuario_id` | uuid | No |  | FK | Usuario (ciudadano) al que se le emitió el enlace. |
| `hash_token` | text | No |  |  | Huella SHA-256 del token del enlace. Es única y permite reconocer el enlace sin guardar el token. |
| `vence_en` | timestamp(3) with time zone | No |  |  | Fecha y hora (UTC) en que el enlace deja de servir. Debe ser posterior a la creación y no se puede cambiar. |
| `cerrada_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que se cerró la solicitud (el ciudadano terminó o la dio por concluida). La fija la base y solo se cierra una vez. |
| `max_archivos` | smallint | No |  |  | Cantidad máxima de archivos que se permiten subir con este enlace. Debe ser mayor que cero. |
| `max_bytes_archivo` | integer | No |  |  | Tamaño máximo en bytes de cada archivo. Debe ser mayor que cero. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_solicitud_carga_incidencia_paciente` | `incidencia_paciente_id` | `chatbot.incidencia_paciente` | Cada solicitud de carga termina perteneciendo a una incidencia (hasta entonces queda nula y se identifica por la sesión). Sirve para saber qué archivos corresponden a qué reclamo. |
| `fk_solicitud_carga_usuario` | `usuario_id` | `chatbot.usuario` | Cada solicitud se emite a un usuario. Sirve para vincular el enlace con el ciudadano que escribió al bot. |

**Restricciones**

- `ck_solicitud_carga_destino`: `CHECK (((incidencia_paciente_id IS NOT NULL) OR (sesion_id IS NOT NULL)))`.
- `ck_solicitud_carga_limites`: `CHECK (((max_archivos > 0) AND (max_bytes_archivo > 0)))`.
- `ck_solicitud_carga_vencimiento`: `CHECK ((vence_en > fecha_creacion))`.

**Índices**

- `ix_solicitud_carga_abierta`: `USING btree (vence_en) WHERE (cerrada_en IS NULL)`.
- `ix_solicitud_carga_incidencia_paciente`: `USING btree (incidencia_paciente_id)`.
- `ix_solicitud_carga_sesion_sin_incidencia`: `USING btree (sesion_id) WHERE ((incidencia_paciente_id IS NULL) AND (cerrada_en IS NULL))`.

**Reglas que aplica la base (disparadores)**

- `trg_solicitud_carga_a_reglas` (Antes de modificar): Hace cumplir las reglas de la solicitud de carga: los datos de emisión (incidencia, usuario, huella del token, vencimiento y límites) no cambian y la solicitud se cierra una sola vez, con la fecha de la base.
- `trg_solicitud_carga_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_solicitud_carga_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_solicitud_carga_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.

### `chatbot.usuario`

Persona que escribe al chatbot, identificada por el id de su chat de WhatsApp. Reúne sus datos de contacto y el estado de su conversación. Nunca se borra: se desactiva.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `wa_id` | text | No |  |  | Id del chat de WhatsApp (dato de Meta; es un identificador opaco, no un teléfono). Es la clave de negocio del usuario. |
| `profile_name` | text | Sí |  |  | Nombre de perfil de WhatsApp (dato de Meta). Opcional. |
| `phone_number` | text | Sí |  |  | Teléfono (dato de Meta). Casi siempre vacío porque la cuenta usa identificadores BSUID. Nunca se usa como clave. |
| `dni` | text | Sí |  |  | DNI del usuario, cuando lo da y se valida. No es único: una misma persona puede escribir desde dos chats. |
| `nombre_completo` | text | Sí |  |  | Nombre completo devuelto por RENIEC al validar el DNI. |
| `estado_conversacion_id` | smallint | No | `1` | FK | Estado de la conversación (abierta o cerrada). |
| `ultimo_mensaje_en` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) del último mensaje, entrante o saliente. Ordena la bandeja de conversaciones. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `eliminado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa. |
| `eliminado_por` | text | Sí |  |  | Quién hizo el borrado lógico. Nulo mientras la fila está activa. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_usuario_estado_conversacion` | `estado_conversacion_id` | `catalogo.estado_conversacion` | Garantiza que el estado de la conversación sea uno del catálogo. Sirve para saber si el usuario tiene una conversación abierta. |

**Restricciones**

- `ck_usuario_eliminacion`: `CHECK (((activo AND (eliminado_en IS NULL) AND (eliminado_por IS NULL)) OR ((NOT activo) AND (eliminado_en IS NOT NULL) AND (eliminado_por IS NOT NULL))))`.

**Índices**

- `ix_usuario_dni`: `USING btree (dni)`.
- `ix_usuario_ultimo_mensaje_en`: `USING btree (ultimo_mensaje_en)`.

**Reglas que aplica la base (disparadores)**

- `trg_usuario_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_usuario_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_usuario_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.

### `gestion.rol`

Rol que puede tener un usuario interno de la plataforma de gestión: administrador, gestor (revisa y deriva), OTRANS (denuncias por corrupción), establecimiento y DIRIS (esta última desactivada). Un rol desactivado no se asigna a nadie. Si el rol tiene tipo de área, solo lo puede tener un usuario de un área de ese tipo. Es la única plataforma con roles. Los valores son provisionales hasta que el área usuaria los confirme.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | smallint | No | `nextval('gestion.rol_id_seq'::regclass)` | PK | Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas. |
| `codigo` | text | No |  |  | Código estable y único del valor. Es el que usa el código de la aplicación. |
| `nombre` | text | No |  |  | Nombre legible del valor, para mostrar en pantalla. |
| `descripcion` | text | Sí |  |  | Explicación opcional de qué significa el valor. |
| `tipo_area_id` | smallint | Sí |  | FK | Tipo de área a la que pertenece el rol. Nulo para los roles que valen en cualquier área (administrador y gestor). Si el usuario tiene área, el tipo del rol debe coincidir con el de su área. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_rol_tipo_area` | `tipo_area_id` | `catalogo.tipo_area` | Garantiza que el tipo de área del rol sea uno del catálogo. Sirve para exigir que el área del usuario sea de ese tipo. |

**Reglas que aplica la base (disparadores)**

- `trg_rol_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_rol_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.

### `gestion.rol_categoria`

Qué categorías de incidencia puede ver cada rol. OTRANS ve solo las denuncias por corrupción (que además solo ve el administrador); el gestor ve lo no sensible para revisarlo y derivarlo; establecimiento y DIRIS ven quejas y reclamos. La base rechaza dar una categoría sensible a un rol de establecimiento o de DIRIS. Solo se inserta (no se modifica ni se borra); la aplicación aplica la regla al listar.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `rol_id` | smallint | No |  | PK, FK | Rol al que se le permite ver la categoría. |
| `categoria_incidencia_id` | smallint | No |  | PK, FK | Categoría de incidencia que el rol puede ver. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_rol_categoria_categoria_incidencia` | `categoria_incidencia_id` | `catalogo.categoria_incidencia` | Garantiza que la categoría sea una del catálogo. Sirve para saber qué roles ven una categoría. |
| `fk_rol_categoria_rol` | `rol_id` | `gestion.rol` | Cada permiso pertenece a un rol. Sirve para saber qué categorías ve un rol. |

**Reglas que aplica la base (disparadores)**

- `trg_rol_categoria_a_reglas_ins` (Antes de insertar): Impide dar una categoría sensible a un rol de establecimiento o de DIRIS.
- `trg_rol_categoria_b_auditoria_ins` (Antes de insertar): Al insertar: llena la fecha y el usuario de creación.
- `trg_rol_categoria_bloqueo` (Antes de borrar o modificar): Tabla de solo inserción: bloquea modificar y borrar.

### `gestion.sesion_usuario`

Sesión abierta por un usuario interno. Su id es lo único que viaja en la cookie (firmada): ni roles ni datos de la persona salen de la base. La base impide crearla vencida o para un usuario desactivado, fija la fecha de revocación y cierra todas las sesiones de un usuario cuando se desactiva. No se borra: queda como historial de accesos.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `usuario_interno_id` | uuid | No |  | FK | Usuario interno dueño de la sesión. No cambia. |
| `ultima_actividad_en` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última petición con esta sesión. La aplicación la actualiza para calcular el vencimiento por inactividad; no puede retroceder. |
| `vence_en` | timestamp(3) with time zone | No |  |  | Fecha y hora (UTC) en que la sesión vence de forma absoluta, aunque haya actividad. Se fija al crearla y no cambia. |
| `revocada_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) en que se cerró la sesión (cierre del usuario, cierre por un administrador o desactivación del usuario). La fija la base una sola vez; nulo mientras está abierta. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_sesion_usuario_usuario_interno` | `usuario_interno_id` | `gestion.usuario_interno` | Cada sesión pertenece a un usuario interno. Sirve para listar o cerrar todas las sesiones de una persona. |

**Índices**

- `ix_sesion_usuario_usuario_revocada`: `USING btree (usuario_interno_id, revocada_en)`.

**Reglas que aplica la base (disparadores)**

- `trg_sesion_usuario_a_reglas_ins` (Antes de insertar): Hace cumplir las reglas de la sesión: nace vigente, sin revocar y para un usuario activo; el usuario y el vencimiento no cambian; la actividad no retrocede; la revocación se registra una sola vez con la fecha de la base y una sesión revocada no se modifica.
- `trg_sesion_usuario_a_reglas_upd` (Antes de modificar): Hace cumplir las reglas de la sesión: nace vigente, sin revocar y para un usuario activo; el usuario y el vencimiento no cambian; la actividad no retrocede; la revocación se registra una sola vez con la fecha de la base y una sesión revocada no se modifica.
- `trg_sesion_usuario_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_sesion_usuario_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_sesion_usuario_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.

### `gestion.usuario_interno`

Persona de la institución que gestiona los casos. Es distinta del usuario de WhatsApp. Inicia sesión con su correo y su clave: de la clave solo se guarda su huella Argon2id. Nunca se borra: se desactiva, y al desactivarla o cambiarle el área se cierran todas sus sesiones.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `nombre_completo` | text | No |  |  | Nombre completo de la persona. |
| `correo` | text | No |  |  | Correo institucional, siempre en minúscula. Es único y es lo que la persona escribe para iniciar sesión. |
| `area_id` | integer | Sí |  | FK | Área a la que pertenece el usuario. Opcional. Cambiarla cierra las sesiones abiertas del usuario, y su tipo debe coincidir con el de sus roles que tengan tipo de área. |
| `activo` | boolean | No | `true` |  | Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica. |
| `eliminado_en` | timestamp(3) with time zone | Sí |  |  | Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa. |
| `eliminado_por` | text | Sí |  |  | Quién hizo el borrado lógico. Nulo mientras la fila está activa. |
| `version_fila` | integer | No | `1` |  | Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |
| `fecha_modificacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) de la última modificación. La llena un disparador. |
| `usuario_modificacion` | text | No | `CURRENT_USER` |  | Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador. |
| `password_hash` | text | No |  |  | Huella Argon2id de la clave, en formato PHC (empieza con $argon2id$). Nunca se guarda la clave; la base rechaza cualquier valor que no tenga ese formato. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_usuario_interno_area` | `area_id` | `catalogo.area` | Ubica al usuario interno en un área del catálogo. Sirve para dirigirle los casos de su área. |

**Restricciones**

- `ck_usuario_interno_correo_minusculas`: `CHECK ((correo = lower(correo)))`.
- `ck_usuario_interno_eliminacion`: `CHECK (((activo AND (eliminado_en IS NULL) AND (eliminado_por IS NULL)) OR ((NOT activo) AND (eliminado_en IS NOT NULL) AND (eliminado_por IS NOT NULL))))`.
- `ck_usuario_interno_password_hash`: `CHECK (starts_with(password_hash, '$argon2id$'::text))`.

**Índices**

- `ix_usuario_interno_area`: `USING btree (area_id)`.

**Reglas que aplica la base (disparadores)**

- `trg_usuario_interno_a_reglas_area` (Antes de modificar): Impide darle a un usuario interno un área cuyo tipo no coincide con el de sus roles que tienen tipo de área.
- `trg_usuario_interno_b_auditoria_ins` (Antes de insertar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_usuario_interno_b_auditoria_upd` (Antes de modificar): Al insertar o modificar: llena fecha y usuario de creación y de modificación y sube la versión de la fila.
- `trg_usuario_interno_bloqueo_borrado` (Antes de borrar): Bloquea el borrado físico; se debe usar el borrado lógico.
- `trg_usuario_interno_c_cerrar_sesiones` (Después de modificar): Al desactivar un usuario interno o cambiarle el área, revoca todas sus sesiones abiertas.
- `trg_usuario_interno_c_cerrar_sesiones_area` (Después de modificar): Al desactivar un usuario interno o cambiarle el área, revoca todas sus sesiones abiertas.

### `gestion.usuario_rol`

Relación entre usuarios internos y roles: un usuario puede tener varios roles y un rol lo tienen varios usuarios. Solo se inserta.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `usuario_interno_id` | uuid | No |  | PK, FK | Usuario interno que recibe el rol. |
| `rol_id` | smallint | No |  | PK, FK | Rol que se le asigna. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_usuario_rol_rol` | `rol_id` | `gestion.rol` | Enlaza la asignación con el rol. Sirve para saber qué personas tienen un rol. |
| `fk_usuario_rol_usuario_interno` | `usuario_interno_id` | `gestion.usuario_interno` | Enlaza la asignación con el usuario interno. Sirve para saber qué roles tiene una persona. |

**Reglas que aplica la base (disparadores)**

- `trg_usuario_rol_a_reglas_ins` (Antes de insertar): Impide asignar un rol desactivado a un usuario interno y un rol cuyo tipo de área no coincide con el área del usuario.
- `trg_usuario_rol_b_auditoria_ins` (Antes de insertar): Al insertar: llena la fecha y el usuario de creación.

### `ia.entrenamiento_categoria`

Copia de cada categoría que una persona revisó (corrigiéndola o confirmándola): lo que dijo la IA, lo que se decidió y el texto del caso. Registrar también las confirmaciones permite medir cuánto acierta el modelo y calibrar su puntaje. La llena un disparador y solo se inserta.

**Columnas**

| Columna | Tipo | Nulo | Por defecto | Clave | Descripción |
|---|---|---|---|---|---|
| `id` | uuid | No | `uuidv7()` | PK | Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación. |
| `incidencia_paciente_id` | uuid | No |  | FK | Incidencia cuya categoría se revisó. |
| `texto_entrenamiento` | text | No |  |  | Copia del relato del paciente en el momento de la revisión. En la primera etapa va sin depurar; ver la lista de la segunda etapa. |
| `categoria_ia_id` | smallint | No |  | FK | Categoría que había asignado la IA. |
| `categoria_final_id` | smallint | No |  | FK | Categoría que quedó tras la revisión: la misma de la IA si se confirmó, otra si se corrigió. |
| `fue_corregida` | boolean | No |  |  | Verdadero si la persona corrigió la categoría de la IA; falso si la confirmó. |
| `categoria_confianza` | numeric(5,2) | Sí |  |  | Puntaje de confianza que había dado la IA a su categoría. |
| `version_clasificador` | text | Sí |  |  | Versión del clasificador que produjo la categoría de la IA. |
| `revisado_por` | text | No |  |  | Quién revisó, con el formato tipo:detalle. |
| `fecha_revision` | timestamp(3) with time zone | No |  |  | Fecha y hora (UTC) de la revisión. |
| `fecha_creacion` | timestamp(3) with time zone | No | `CURRENT_TIMESTAMP` |  | Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base. |
| `usuario_creacion` | text | No | `CURRENT_USER` |  | Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base. |

**Llaves foráneas** (qué relaciona y para qué)

| Restricción | Columna | Apunta a | Por qué y para qué |
|---|---|---|---|
| `fk_entrenamiento_categoria_categoria_final` | `categoria_final_id` | `catalogo.categoria_incidencia` | Garantiza que la categoría decidida sea una del catálogo. Es la respuesta correcta con la que se mejora el modelo. |
| `fk_entrenamiento_categoria_categoria_ia` | `categoria_ia_id` | `catalogo.categoria_incidencia` | Garantiza que la categoría de la IA sea una del catálogo. Sirve para medir errores del modelo. |
| `fk_entrenamiento_categoria_incidencia_paciente` | `incidencia_paciente_id` | `chatbot.incidencia_paciente` | Enlaza la copia de entrenamiento con el caso original. Sirve para volver al expediente completo. |

**Índices**

- `ix_entrenamiento_categoria_fecha_revision`: `USING btree (fecha_revision)`.
- `ix_entrenamiento_categoria_incidencia_paciente`: `USING btree (incidencia_paciente_id)`.

**Reglas que aplica la base (disparadores)**

- `trg_entrenamiento_categoria_b_auditoria_ins` (Antes de insertar): Al insertar: llena la fecha y el usuario de creación.
- `trg_entrenamiento_categoria_bloqueo` (Antes de borrar o modificar): Tabla de solo inserción: bloquea modificar y borrar.

