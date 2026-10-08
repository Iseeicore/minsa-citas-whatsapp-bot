COMMENT ON SCHEMA catalogo IS 'Catálogos compartidos por todas las plataformas. Cada fila es un valor permitido; se usan con llave foránea en lugar de enumerados para poder agregar valores sin cambiar la estructura.';
COMMENT ON SCHEMA chatbot IS 'Plataforma 1: recepción de incidencias del paciente por WhatsApp o web. Registra al usuario, sus mensajes, lo que reporta y las evidencias.';
COMMENT ON SCHEMA gestion IS 'Plataforma 2: gestión de pacientes inconformes. Es la única que necesita usuarios internos y roles.';
COMMENT ON SCHEMA ia IS 'Plataforma 3: aprendizaje de la IA. Recibe una copia de cada categoría que una persona revisó, ya sea corrigiéndola o confirmándola.';
COMMENT ON COLUMN catalogo.area.id IS 'Identificador numérico de la fila, generado por la base.';
COMMENT ON COLUMN catalogo.area.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.area.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.area.tipo_area_id IS 'Tipo del área.';
COMMENT ON COLUMN catalogo.area.padre_id IS 'Área de la que depende, si tiene una (por ejemplo la DIRIS de un establecimiento). Nulo en la cima. No puede ser la misma área.';
COMMENT ON COLUMN catalogo.area.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.area.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.area.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.area.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.area.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.area.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.area IS 'Área que atiende incidencias: cada establecimiento de salud tiene la suya, y existen además áreas como OTRANS o la sede central. A una incidencia se la deriva a un área y los usuarios internos pertenecen a una. Las áreas pueden depender de otra (padre).

Relaciones:
- padre_id → catalogo.area: Enlaza el área con la que depende. Sirve para recorrer la jerarquía.
- tipo_area_id → catalogo.tipo_area: Garantiza que el tipo sea uno del catálogo. Sirve para saber si el área recibe denuncias sensibles.';
COMMENT ON COLUMN catalogo.canal_origen.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.canal_origen.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.canal_origen.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.canal_origen.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.canal_origen.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.canal_origen.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.canal_origen.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.canal_origen.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.canal_origen.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.canal_origen.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.canal_origen IS 'Canal por el que llegó la incidencia (WhatsApp o web). Permite unificar canales en un mismo lugar.';
COMMENT ON COLUMN catalogo.categoria_incidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.categoria_incidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.categoria_incidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.categoria_incidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.categoria_incidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.categoria_incidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.categoria_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.categoria_incidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.categoria_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.categoria_incidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON COLUMN catalogo.categoria_incidencia.es_sensible IS 'Verdadero si la categoría es sensible (hoy, la denuncia por corrupción): se atiende solo por un área que reciba casos sensibles (OTRANS) y siempre pasa por revisión humana. La base impide derivarla a un establecimiento.';
COMMENT ON TABLE catalogo.categoria_incidencia IS 'Categoría que asigna la IA a una incidencia del paciente: denuncia por corrupción, queja, reclamo u otro (cuando el texto no encaja o la IA no puede clasificarlo con seguridad y decide una persona). Marca cuáles son sensibles. Es un catálogo con llave foránea para poder agregar categorías sin cambiar la estructura.';
COMMENT ON COLUMN catalogo.direccion_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.direccion_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.direccion_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.direccion_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.direccion_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.direccion_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.direccion_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.direccion_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.direccion_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.direccion_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.direccion_mensaje IS 'Sentido de un mensaje: entrante (del ciudadano al bot) o saliente (del bot al ciudadano).';
COMMENT ON COLUMN catalogo.establecimiento_salud.id IS 'Identificador numérico de la fila, generado por la base.';
COMMENT ON COLUMN catalogo.establecimiento_salud.codigo_renipress IS 'Código RENIPRESS del establecimiento: de uno a ocho dígitos, SIN ceros a la izquierda (forma canónica: 6206, no 00006206, igual que el catálogo de citas del bot). Es único. Quien cargue o lea el código debe quitar los ceros iniciales antes de guardar o comparar.';
COMMENT ON COLUMN catalogo.establecimiento_salud.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.establecimiento_salud.nombre_busqueda IS 'Nombre sin tildes y en minúscula, que calcula la base. Es el que usa la búsqueda por similitud (índice de trigramas); no se escribe.';
COMMENT ON COLUMN catalogo.establecimiento_salud.nivel_atencion_id IS 'Nivel de atención del establecimiento (I, II o III). Si la fuente no lo trae: los hospitales son de nivel II o III y los demás establecimientos de nivel I.';
COMMENT ON COLUMN catalogo.establecimiento_salud.categoria IS 'Categoría oficial del establecimiento (por ejemplo I-1, I-4, II-2, III-1, III-E). Texto libre porque la fuente es el MINSA y puede cambiar; el nivel de atención va aparte para filtrar.';
COMMENT ON COLUMN catalogo.establecimiento_salud.departamento IS 'Departamento donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.provincia IS 'Provincia donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.distrito IS 'Distrito donde queda el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.red IS 'Red de salud a la que pertenece el establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.area_id IS 'Área propia del establecimiento, a la que se le derivan sus incidencias. Cada establecimiento tiene una sola área y cada área sirve a un solo establecimiento.';
COMMENT ON COLUMN catalogo.establecimiento_salud.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.establecimiento_salud.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.establecimiento_salud.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.establecimiento_salud.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.establecimiento_salud.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.establecimiento_salud.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.establecimiento_salud IS 'Establecimiento de salud del padrón RENIPRESS. Es el origen de una incidencia (donde ocurrió el hecho) y se carga desde el padrón, no con la migración. Se busca por nombre sin tildes con un índice de similitud.

Relaciones:
- area_id → catalogo.area: Enlaza el establecimiento con su área. Sirve para derivarle sus incidencias.
- nivel_atencion_id → catalogo.nivel_atencion: Garantiza que el nivel sea uno del catálogo. Sirve para filtrar por complejidad.';
COMMENT ON COLUMN catalogo.estado_archivo.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_archivo.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_archivo.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_archivo.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_archivo.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_archivo.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_archivo.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_archivo.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_archivo.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_archivo.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_archivo IS 'Estados por los que pasa un archivo subido por el ciudadano: recibido, verificando, verificado o rechazado. Es un catálogo con llave foránea para distinguir lo que solo se recibió de lo que ya pasó las verificaciones.';
COMMENT ON COLUMN catalogo.estado_conversacion.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_conversacion.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_conversacion.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_conversacion.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_conversacion.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_conversacion.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_conversacion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_conversacion.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_conversacion.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_conversacion.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_conversacion IS 'Si la conversación con un usuario está abierta o cerrada.';
COMMENT ON COLUMN catalogo.estado_incidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_incidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_incidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_incidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_incidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_incidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_incidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_incidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_incidencia IS 'Estados por los que pasa una incidencia: registrado, clasificado (la IA ya asignó categoría), derivado (enviado al área competente), en gestión, resuelto y archivado (a los 3 días de resuelta, o cuando un caso abierto supera el plazo de atención). Anulado está retirado: anular es el borrado lógico. Los valores son provisionales hasta que la unidad usuaria confirme su flujo.';
COMMENT ON COLUMN catalogo.estado_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.estado_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.estado_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.estado_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.estado_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.estado_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.estado_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.estado_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.estado_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.estado_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.estado_mensaje IS 'Estado de entrega de un mensaje enviado por WhatsApp (pendiente, enviado, entregado, leído, fallido).';
COMMENT ON COLUMN catalogo.motivo_archivo.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.motivo_archivo.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.motivo_archivo.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.motivo_archivo.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.motivo_archivo.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.motivo_archivo.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.motivo_archivo.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.motivo_archivo.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.motivo_archivo.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.motivo_archivo.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.motivo_archivo IS 'Por qué se archivó una incidencia: resuelta con la vigencia cumplida, vencida sin atender (ambos automáticos), con datos insuficientes para gestionarla o porque no corresponde (ambos manuales, con justificación escrita).';
COMMENT ON COLUMN catalogo.nivel_atencion.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.nivel_atencion.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.nivel_atencion.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.nivel_atencion.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.nivel_atencion.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.nivel_atencion.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.nivel_atencion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.nivel_atencion.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.nivel_atencion.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.nivel_atencion.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.nivel_atencion IS 'Nivel de atención de un establecimiento de salud (I, II o III).';
COMMENT ON COLUMN catalogo.resultado_resolucion.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.resultado_resolucion.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.resultado_resolucion.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.resultado_resolucion.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.resultado_resolucion.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.resultado_resolucion.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.resultado_resolucion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.resultado_resolucion.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.resultado_resolucion.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.resultado_resolucion.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.resultado_resolucion IS 'Resultado con que se resuelve un caso: atendido (se tomaron medidas) o cerrado (se cierra sin más gestión).';
COMMENT ON COLUMN catalogo.tipo_area.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.tipo_area.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.tipo_area.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.tipo_area.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.tipo_area.recibe_sensibles IS 'Verdadero si las áreas de este tipo pueden recibir incidencias de categorías sensibles (hoy, solo OTRANS). La base impide derivar un caso sensible a un área cuyo tipo no lo reciba.';
COMMENT ON COLUMN catalogo.tipo_area.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.tipo_area.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.tipo_area.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.tipo_area.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.tipo_area.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.tipo_area.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.tipo_area IS 'Tipo de área a la que se puede derivar una incidencia: establecimiento, OTRANS, DIRIS, instituto o sede central. Define además qué tipos reciben denuncias sensibles y a qué tipo pertenece cada rol de gestión.';
COMMENT ON COLUMN catalogo.tipo_evidencia.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.tipo_evidencia.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.tipo_evidencia.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.tipo_evidencia.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.tipo_evidencia.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.tipo_evidencia.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.tipo_evidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.tipo_evidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.tipo_evidencia.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.tipo_evidencia.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.tipo_evidencia IS 'Tipo de archivo adjunto como evidencia (imagen, video, documento, audio).';
COMMENT ON COLUMN catalogo.tipo_mensaje.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN catalogo.tipo_mensaje.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN catalogo.tipo_mensaje.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN catalogo.tipo_mensaje.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN catalogo.tipo_mensaje.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN catalogo.tipo_mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN catalogo.tipo_mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN catalogo.tipo_mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN catalogo.tipo_mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN catalogo.tipo_mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE catalogo.tipo_mensaje IS 'Tipo de contenido de un mensaje (texto, imagen, audio, documento, ubicación, plantilla).';
COMMENT ON COLUMN chatbot.archivo_recibido.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.archivo_recibido.solicitud_carga_id IS 'Solicitud de carga con la que se subió el archivo.';
COMMENT ON COLUMN chatbot.archivo_recibido.nombre_original IS 'Nombre que tenía el archivo en el dispositivo del ciudadano. Es un dato informativo y puede venir vacío.';
COMMENT ON COLUMN chatbot.archivo_recibido.mime_declarado IS 'Tipo de archivo que declaró el navegador al subirlo. No es de fiar: se contrasta con el tipo detectado.';
COMMENT ON COLUMN chatbot.archivo_recibido.mime_detectado IS 'Tipo real del archivo, según su firma interna (primeros bytes), que fija el proceso de verificación. Obligatorio para marcarlo verificado.';
COMMENT ON COLUMN chatbot.archivo_recibido.tamano IS 'Tamaño del archivo en bytes. Debe ser mayor que cero.';
COMMENT ON COLUMN chatbot.archivo_recibido.hash_archivo IS 'Huella SHA-256 del contenido, calculada por el proceso de verificación. Obligatoria para marcarlo verificado.';
COMMENT ON COLUMN chatbot.archivo_recibido.ruta_cuarentena IS 'Ruta donde quedó el archivo mientras se verifica. Nada se sirve desde la cuarentena.';
COMMENT ON COLUMN chatbot.archivo_recibido.estado_archivo_id IS 'Estado actual de verificación del archivo. Nace en RECIBIDO.';
COMMENT ON COLUMN chatbot.archivo_recibido.motivo_rechazo IS 'Por qué se rechazó el archivo. Es obligatorio si está rechazado y debe estar vacío en cualquier otro estado.';
COMMENT ON COLUMN chatbot.archivo_recibido.verificado_en IS 'Fecha y hora (UTC) en que el archivo llegó a un estado final (verificado o rechazado). La llena la base.';
COMMENT ON COLUMN chatbot.archivo_recibido.evidencia_id IS 'Evidencia definitiva a la que se promovió el archivo verificado. Se enlaza una sola vez y es única.';
COMMENT ON COLUMN chatbot.archivo_recibido.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.archivo_recibido.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.archivo_recibido.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.archivo_recibido.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.archivo_recibido.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.archivo_recibido IS 'Cada archivo que el ciudadano sube a través de una solicitud de carga, con su estado de verificación. Un archivo nace RECIBIDO, pasa a VERIFICANDO y termina VERIFICADO o RECHAZADO; los estados finales no cambian. Los verificados se enlazan después a su evidencia definitiva. No se borra.

Relaciones:
- estado_archivo_id → catalogo.estado_archivo: Garantiza que el estado del archivo sea uno del catálogo. Sirve para distinguir lo recibido de lo verificado.
- evidencia_id → chatbot.evidencia: Enlaza el archivo verificado con su evidencia definitiva. Sirve para rastrear de qué subida salió cada evidencia.
- solicitud_carga_id → chatbot.solicitud_carga: Cada archivo llegó por una solicitud de carga. Sirve para contar y listar los archivos de una solicitud.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.anio IS 'Año del código (zona America/Lima), de cuatro dígitos. Es la clave: hay una fila por año.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.ultimo IS 'Último correlativo entregado ese año. El próximo código usa este valor más uno. Solo puede subir.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se creó la fila del año, es decir, cuando llegó la primera incidencia de ese año.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) del último código entregado ese año. La llena un disparador.';
COMMENT ON TABLE chatbot.contador_codigo_incidencia IS 'Último correlativo usado en cada año para el código de las incidencias. Una fila por año, que la base incrementa dentro de la misma transacción de la inserción: si la transacción se revierte el número no se gasta y dos inserciones simultáneas esperan su turno. Solo avanza y nunca se borra.';
COMMENT ON COLUMN chatbot.evidencia.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.evidencia.incidencia_paciente_id IS 'Reporte al que pertenece la evidencia.';
COMMENT ON COLUMN chatbot.evidencia.mensaje_id IS 'Mensaje de WhatsApp del que vino el archivo. Opcional.';
COMMENT ON COLUMN chatbot.evidencia.media_id IS 'Id del archivo en Meta (dato de Meta).';
COMMENT ON COLUMN chatbot.evidencia.tipo_evidencia_id IS 'Tipo de archivo.';
COMMENT ON COLUMN chatbot.evidencia.mime_type IS 'Tipo MIME del archivo.';
COMMENT ON COLUMN chatbot.evidencia.nombre_archivo IS 'Nombre original, si Meta lo entrega.';
COMMENT ON COLUMN chatbot.evidencia.tamano IS 'Tamaño en bytes. Debe ser mayor que cero.';
COMMENT ON COLUMN chatbot.evidencia.ruta IS 'Ruta que devolvió el servicio de imágenes. Nunca el archivo ni un data URI.';
COMMENT ON COLUMN chatbot.evidencia.hash_archivo IS 'Huella SHA-256 del archivo, para integridad y detección de duplicados. Queda vacía en la primera etapa.';
COMMENT ON COLUMN chatbot.evidencia.fecha_recepcion IS 'Fecha y hora (UTC) en que se recibió el archivo.';
COMMENT ON COLUMN chatbot.evidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.evidencia.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE chatbot.evidencia IS 'Archivo que el paciente adjunta a su reporte (imagen, video, documento o audio). El archivo vive en el servicio de imágenes; aquí solo queda su ruta. Solo se inserta: nunca se modifica ni se borra.

Relaciones:
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada evidencia pertenece a un reporte. Sirve para listar los archivos de un caso.
- mensaje_id → chatbot.mensaje: Enlaza la evidencia con el mensaje de WhatsApp del que vino. Sirve para rastrear su origen. Si el mensaje se depura, queda en nulo.
- tipo_evidencia_id → catalogo.tipo_evidencia: Garantiza que el tipo de archivo sea uno del catálogo. Sirve para decidir cómo mostrarlo.';
COMMENT ON COLUMN chatbot.incidencia_analisis.incidencia_paciente_id IS 'Incidencia analizada. Es la llave de la tabla: hay un análisis por incidencia.';
COMMENT ON COLUMN chatbot.incidencia_analisis.version_reglas IS 'Versión del conjunto de reglas que produjo el análisis. Sin ella, los puntajes de versiones distintas no se pueden comparar.';
COMMENT ON COLUMN chatbot.incidencia_analisis.puntaje IS 'Puntaje que dieron las reglas al caso. Sirve para ordenar la revisión.';
COMMENT ON COLUMN chatbot.incidencia_analisis.senales IS 'Señales que detectaron las reglas, en JSON. No lleva índice: solo se lee junto con el caso.';
COMMENT ON COLUMN chatbot.incidencia_analisis.cargo_mencionado IS 'Cargo de la persona señalada en el relato, si el texto lo menciona.';
COMMENT ON COLUMN chatbot.incidencia_analisis.area_mencionada_id IS 'Área que el relato menciona, si se pudo reconocer.';
COMMENT ON COLUMN chatbot.incidencia_analisis.nombre_mencionado IS 'Nombre de la persona señalada en el relato, si el texto lo menciona. Está aquí y no en la incidencia a propósito, para que no pase al historial de cambios.';
COMMENT ON COLUMN chatbot.incidencia_analisis.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.incidencia_analisis.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE chatbot.incidencia_analisis IS 'Análisis automático de una incidencia (puntaje y señales de las reglas, y lo que el relato menciona: cargo, área y nombre). Uno por incidencia; solo se inserta. El nombre mencionado vive aquí y no en la incidencia para que no se copie al historial de cambios.

Relaciones:
- area_mencionada_id → catalogo.area: Garantiza que el área mencionada sea una del catálogo. Sirve para ubicar el área señalada.
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada análisis pertenece a una incidencia. Sirve para unir el análisis con el caso.';
COMMENT ON COLUMN chatbot.incidencia_paciente.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.incidencia_paciente.canal_origen_id IS 'Canal por el que llegó (WhatsApp o web).';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_id IS 'Usuario que presentó el reporte.';
COMMENT ON COLUMN chatbot.incidencia_paciente.mensaje_id IS 'Mensaje del chat del que nació el reporte. Opcional.';
COMMENT ON COLUMN chatbot.incidencia_paciente.wa_id IS 'Id del chat (dato de Meta). Copia del usuario para filtrar sin unir tablas y para enlazar el reporte con el chat.';
COMMENT ON COLUMN chatbot.incidencia_paciente.es_anonimo IS 'Verdadero si el paciente eligió no dar su DNI ni su nombre. El id del chat se guarda igual.';
COMMENT ON COLUMN chatbot.incidencia_paciente.dni_reclamante IS 'DNI del paciente al momento de presentar el reporte (foto fija: no cambia si el usuario se actualiza después). Nulo si es anónimo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.nombre_reclamante IS 'Nombre del paciente al momento de presentar el reporte. Nulo si es anónimo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.descripcion IS 'Relato del paciente. Es el texto que analiza la IA. No se puede modificar.';
COMMENT ON COLUMN chatbot.incidencia_paciente.estado_incidencia_id IS 'Estado actual de la incidencia. Nace en REGISTRADO; la base lo pasa a CLASIFICADO cuando la IA asigna la categoría y a RESUELTO cuando se registra la resolución, y solo permite las transiciones definidas. DERIVADO y EN_GESTION exigen que la IA ya haya asignado categoría y que haya área de destino. ARCHIVADO exige un motivo: desde RESUELTO (pasó la vigencia de la resolución); desde un estado abierto cuyo plazo de atención venció, solo por el sistema; o, desde un estado abierto (REGISTRADO, CLASIFICADO, DERIVADO o EN_GESTION), por un motivo manual (datos insuficientes o no corresponde) con su justificación, que archiva una persona (el filtro del sistema solo por datos insuficientes y desde REGISTRADO o CLASIFICADO). Un caso ARCHIVADO por un motivo manual o por vencimiento puede reabrirse a EN_GESTION; uno archivado por vigencia de la resolución, no.';
COMMENT ON COLUMN chatbot.incidencia_paciente.trace_id IS 'Identificador del turno del chat que lo originó. Es único: una reentrega de Meta no duplica el reporte.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_id IS 'Categoría vigente: la que asignó la IA o, si una persona la corrigió, la corregida.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_ia_id IS 'Categoría que asignó la IA. Se asigna una sola vez y no se modifica; queda para medir cuánto se equivoca el modelo.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confianza IS 'Puntaje de confianza (0 a 100) que dio la IA a su categoría. No es una probabilidad calibrada: sirve para ordenar la revisión y para medir al modelo. Se asigna una sola vez.';
COMMENT ON COLUMN chatbot.incidencia_paciente.version_clasificador IS 'Versión del clasificador (modelo e instrucciones) que produjo la categoría y la confianza. Se asigna junto con ellas y no se modifica; sin ella, los puntajes de modelos distintos no se pueden comparar.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_asignada_en IS 'Fecha y hora (UTC) en que la IA asignó la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_corregida_en IS 'Fecha y hora (UTC) de la corrección humana. Nulo si nadie corrigió. La llena la base; solo se puede corregir una vez y no si ya se confirmó.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_corregida_por IS 'Quién corrigió la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confirmada_en IS 'Fecha y hora (UTC) en que una persona confirmó la categoría de la IA. La aplicación solo indica la confirmación; la fecha la fija la base. Se confirma una sola vez y no si ya fue corregida.';
COMMENT ON COLUMN chatbot.incidencia_paciente.categoria_confirmada_por IS 'Quién confirmó la categoría. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.medidas_tomadas IS 'Qué medidas se tomaron para atender el caso (10 caracteres o más). Es una de las tres partes de la resolución, junto con el fundamento y el resultado: las tres se registran juntas, una sola vez, y con ellas el caso pasa a RESUELTO.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fundamento IS 'Por qué se tomaron esas medidas o se resolvió así (10 caracteres o más). Se registra junto con las medidas y el resultado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resultado_resolucion_id IS 'Resultado de la resolución: ATENDIDO o CERRADO. Se registra junto con las medidas y el fundamento.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resuelto_en IS 'Fecha y hora (UTC) en que se registró la resolución (medidas, fundamento y resultado). La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.resuelto_por IS 'Quién registró la resolución. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.establecimiento_id IS 'Establecimiento de salud donde ocurrió el hecho (dato de origen). Opcional. Una vez asignado no se puede cambiar; solo la carga de datos de la migración puede completarlo cuando estaba vacío.';
COMMENT ON COLUMN chatbot.incidencia_paciente.area_destino_id IS 'Área a la que se derivó o se asignó el caso. La base la asigna sola cuando la categoría es sensible y existe una única área que las recibe; solo se reasigna mientras el caso está CLASIFICADO o DERIVADO, y un caso sensible solo puede estar en un área que reciba casos sensibles.';
COMMENT ON COLUMN chatbot.incidencia_paciente.derivado_en IS 'Fecha y hora (UTC) en que el caso pasó a DERIVADO (o se reasignó su área). La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.derivado_por IS 'Quién derivó el caso. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.tomado_en IS 'Fecha y hora (UTC) en que el caso pasó a EN_GESTION. La llena la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.tomado_por IS 'Quién tomó el caso en gestión. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.motivo_archivo_id IS 'Por qué se archivó el caso. Nulo mientras no esté archivado. La base lo deduce en los archivados automáticos (resuelto: vigencia cumplida; vencido sin resolución: sin atender); en los manuales (datos insuficientes o no corresponde) lo indica quien archiva, una persona o, solo por datos insuficientes, el filtro del sistema.';
COMMENT ON COLUMN chatbot.incidencia_paciente.archivado_en IS 'Fecha y hora (UTC) en que el caso pasó a ARCHIVADO. La llena la base. Se limpia al reabrir el caso.';
COMMENT ON COLUMN chatbot.incidencia_paciente.archivo_detalle IS 'Justificación escrita de quien archivó el caso (10 caracteres o más). Obligatoria en los motivos manuales (datos insuficientes y no corresponde); en los automáticos puede quedar vacía. Se limpia al reabrir el caso; el historial queda en la auditoría.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_en IS 'Fecha y hora (UTC) en que el caso se reabrió por última vez (de ARCHIVADO a EN_GESTION). La llena la base. Nulo si nunca se reabrió.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_por IS 'Quién reabrió el caso la última vez. La llena la base con el actor declarado.';
COMMENT ON COLUMN chatbot.incidencia_paciente.reabierto_motivo IS 'Por qué se reabrió el caso (10 caracteres o más). Obligatorio al reabrir. Solo se reabre un caso archivado por datos insuficientes, no corresponde o vencido sin atender, nunca uno archivado por vigencia de la resolución. El historial de reaperturas queda en la auditoría.';
COMMENT ON COLUMN chatbot.incidencia_paciente.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN chatbot.incidencia_paciente.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.incidencia_paciente.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.incidencia_paciente.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.incidencia_paciente.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.incidencia_paciente.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON COLUMN chatbot.incidencia_paciente.codigo IS 'Código legible del caso, con el formato MINSA-AAAA-NNNNNN: AAAA es el año de llegada (zona America/Lima) y NNNNNN el correlativo de ese año, que reinicia cada año. Es único y sirve para nombrar el caso por teléfono o en un oficio. Lo genera la base al insertar (lo que se envíe se descarta) y no se puede modificar; las incidencias anteriores a su creación lo recibieron en orden de llegada.';
COMMENT ON TABLE chatbot.incidencia_paciente IS 'Incidencia que el paciente reporta al chatbot: denuncia por corrupción, queja o reclamo. Es el registro central. Nace con la categoría vacía y datos mínimos; luego la IA asigna la categoría y una persona la corrige o la confirma, una sola vez. Los datos de origen no se pueden modificar. Cada incidencia lleva un código legible (MINSA-AAAA-NNNNNN) que asigna la base. Puede llevar el establecimiento de origen (que no cambia) y el área de destino; la derivación, la toma en gestión, el archivado y la reapertura registran con quién y cuándo, y lo llena la base. La resolución son tres campos (medidas tomadas, fundamento y resultado) que se registran juntos, una sola vez. Un caso de categoría sensible solo puede estar en un área que reciba casos sensibles. Nunca se borra: se desactiva.

Relaciones:
- area_destino_id → catalogo.area: Garantiza que el área de destino sea una del catálogo. Sirve para listar lo que debe atender cada área.
- canal_origen_id → catalogo.canal_origen: Garantiza que el canal sea uno del catálogo. Sirve para unificar reportes de varios canales.
- categoria_id → catalogo.categoria_incidencia: Garantiza que la categoría vigente sea una del catálogo. Sirve para dirigir el caso según sea denuncia, queja o reclamo.
- categoria_ia_id → catalogo.categoria_incidencia: Garantiza que la categoría original de la IA sea una del catálogo. Sirve para medir cuánto se equivoca el modelo.
- establecimiento_id → catalogo.establecimiento_salud: Garantiza que el establecimiento de origen sea uno del padrón. Sirve para listar los casos por establecimiento.
- estado_incidencia_id → catalogo.estado_incidencia: Garantiza que el estado sea uno del catálogo. Sirve para listar lo pendiente de cada etapa.
- mensaje_id → chatbot.mensaje: Enlaza el reporte con el mensaje del chat del que nació. Sirve para reconstruir el contexto de la conversación.
- motivo_archivo_id → catalogo.motivo_archivo: Garantiza que el motivo sea uno del catálogo. Sirve para saber por qué se archivó un caso.
- resultado_resolucion_id → catalogo.resultado_resolucion: Garantiza que el resultado de la resolución sea uno del catálogo (atendido o cerrado). Sirve para contar los casos por cómo se resolvieron.
- usuario_id → chatbot.usuario: Cada reporte lo presenta un usuario. Sirve para ver todo lo que reportó una persona.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.id IS 'Número secuencial del evento; da el orden de los cambios.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.incidencia_paciente_id IS 'Incidencia a la que corresponde el cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.operacion IS 'CREACION (guarda la fila completa) o ACTUALIZACION (guarda solo lo que cambió).';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.cambios IS 'Detalle en JSON. En una actualización, cada campo con su valor anterior y el nuevo. Hereda la sensibilidad de la tabla de origen.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.actor IS 'Quién hizo el cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.version_fila IS 'Versión que tenía la incidencia después del cambio.';
COMMENT ON COLUMN chatbot.incidencia_paciente_auditoria.fecha_hora IS 'Fecha y hora (UTC) del cambio, con el reloj de la base.';
COMMENT ON TABLE chatbot.incidencia_paciente_auditoria IS 'Historial de cambios de cada incidencia de paciente: qué cambió, valor anterior y nuevo, quién y cuándo. Solo se agrega; nunca se modifica ni se borra. La llena un disparador.

Relaciones:
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada evento del historial pertenece a una incidencia. Sirve para reconstruir la vida completa de un reporte.';
COMMENT ON COLUMN chatbot.mensaje.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.mensaje.usuario_id IS 'Usuario dueño de la conversación a la que pertenece el mensaje.';
COMMENT ON COLUMN chatbot.mensaje.direccion_mensaje_id IS 'Sentido del mensaje (entrante o saliente).';
COMMENT ON COLUMN chatbot.mensaje.tipo_mensaje_id IS 'Tipo de contenido del mensaje.';
COMMENT ON COLUMN chatbot.mensaje.contenido IS 'Texto del mensaje, cuando aplica.';
COMMENT ON COLUMN chatbot.mensaje.media_id IS 'Id del archivo en Meta (dato de Meta). No es una URL.';
COMMENT ON COLUMN chatbot.mensaje.wa_message_id IS 'Id del mensaje en WhatsApp (dato de Meta). Es único: evita procesar dos veces una reentrega de Meta.';
COMMENT ON COLUMN chatbot.mensaje.estado_mensaje_id IS 'Estado de entrega del mensaje. Lo actualiza Meta con sus avisos de entrega.';
COMMENT ON COLUMN chatbot.mensaje.fecha_hora IS 'Momento real del mensaje según WhatsApp. Es la fecha del evento y no se confunde con fecha_creacion, que es la de inserción.';
COMMENT ON COLUMN chatbot.mensaje.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.mensaje.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.mensaje.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.mensaje.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.mensaje.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.mensaje IS 'Mensaje de la conversación, entrante o saliente. Es la tabla de mayor volumen: se estiman decenas de millones de filas por mes.

Relaciones:
- direccion_mensaje_id → catalogo.direccion_mensaje: Garantiza que el sentido sea entrante o saliente. Sirve para distinguir lo que dijo el ciudadano de lo que respondió el bot.
- estado_mensaje_id → catalogo.estado_mensaje: Garantiza que el estado de entrega sea uno del catálogo. Sirve para reintentar o reportar mensajes fallidos.
- tipo_mensaje_id → catalogo.tipo_mensaje: Garantiza que el tipo de contenido sea uno conocido. Sirve para decidir cómo mostrar o procesar el mensaje.
- usuario_id → chatbot.usuario: Cada mensaje pertenece a un usuario. Sirve para armar la conversación de un usuario en orden.';
COMMENT ON COLUMN chatbot.sesion_conversacion.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.sesion_conversacion.wa_id IS 'Id del chat. Único: hay una sesión por usuario. No tiene llave foránea hacia usuario porque la sesión puede existir antes que el usuario.';
COMMENT ON COLUMN chatbot.sesion_conversacion.estado IS 'Estado actual del flujo conversacional (por ejemplo cita_awaiting_dni). Es texto y no catálogo porque lo define el código del bot y tiene más de 60 valores.';
COMMENT ON COLUMN chatbot.sesion_conversacion.slots IS 'Datos recolectados durante el flujo, en JSON. La forma la garantiza el código del bot.';
COMMENT ON COLUMN chatbot.sesion_conversacion.contadores IS 'Contadores internos del flujo (reintentos, intentos de código), en JSON.';
COMMENT ON COLUMN chatbot.sesion_conversacion.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.sesion_conversacion.fecha_modificacion IS 'Fecha y hora (UTC) de la última actividad. Sirve para purgar sesiones inactivas. La llena un disparador.';
COMMENT ON TABLE chatbot.sesion_conversacion IS 'Estado temporal del flujo conversacional de cada usuario (en qué paso va y qué datos ha dado). Es efímera: se reescribe en cada turno y se purga cuando queda inactiva. No guarda imágenes.';
COMMENT ON COLUMN chatbot.solicitud_carga.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.solicitud_carga.incidencia_paciente_id IS 'Incidencia a la que se le agregarán los archivos. Nulo mientras el ciudadano aún está armando el reporte en el chat; se enlaza una sola vez cuando la incidencia se crea.';
COMMENT ON COLUMN chatbot.solicitud_carga.sesion_id IS 'Sesión de conversación (borrador del reporte) para la que se emitió el enlace antes de que existiera la incidencia. Sin llave foránea a propósito: la purga de sesiones inactivas borra la sesión. Obligatoria mientras no haya incidencia.';
COMMENT ON COLUMN chatbot.solicitud_carga.usuario_id IS 'Usuario (ciudadano) al que se le emitió el enlace.';
COMMENT ON COLUMN chatbot.solicitud_carga.hash_token IS 'Huella SHA-256 del token del enlace. Es única y permite reconocer el enlace sin guardar el token.';
COMMENT ON COLUMN chatbot.solicitud_carga.vence_en IS 'Fecha y hora (UTC) en que el enlace deja de servir. Debe ser posterior a la creación y no se puede cambiar.';
COMMENT ON COLUMN chatbot.solicitud_carga.cerrada_en IS 'Fecha y hora (UTC) en que se cerró la solicitud (el ciudadano terminó o la dio por concluida). La fija la base y solo se cierra una vez.';
COMMENT ON COLUMN chatbot.solicitud_carga.max_archivos IS 'Cantidad máxima de archivos que se permiten subir con este enlace. Debe ser mayor que cero.';
COMMENT ON COLUMN chatbot.solicitud_carga.max_bytes_archivo IS 'Tamaño máximo en bytes de cada archivo. Debe ser mayor que cero.';
COMMENT ON COLUMN chatbot.solicitud_carga.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.solicitud_carga.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.solicitud_carga.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.solicitud_carga.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.solicitud_carga.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.solicitud_carga IS 'Permiso temporal para que el ciudadano suba archivos de una incidencia desde la página de carga. Cada fila corresponde a un enlace firmado emitido por el bot: guarda a qué incidencia pertenece, cuándo vence y cuántos archivos y bytes se permiten. Nunca guarda el token, solo su huella. No se borra: se cierra.

Relaciones:
- incidencia_paciente_id → chatbot.incidencia_paciente: Cada solicitud de carga termina perteneciendo a una incidencia (hasta entonces queda nula y se identifica por la sesión). Sirve para saber qué archivos corresponden a qué reclamo.
- usuario_id → chatbot.usuario: Cada solicitud se emite a un usuario. Sirve para vincular el enlace con el ciudadano que escribió al bot.';
COMMENT ON COLUMN chatbot.usuario.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN chatbot.usuario.wa_id IS 'Id del chat de WhatsApp (dato de Meta; es un identificador opaco, no un teléfono). Es la clave de negocio del usuario.';
COMMENT ON COLUMN chatbot.usuario.profile_name IS 'Nombre de perfil de WhatsApp (dato de Meta). Opcional.';
COMMENT ON COLUMN chatbot.usuario.phone_number IS 'Teléfono (dato de Meta). Casi siempre vacío porque la cuenta usa identificadores BSUID. Nunca se usa como clave.';
COMMENT ON COLUMN chatbot.usuario.dni IS 'DNI del usuario, cuando lo da y se valida. No es único: una misma persona puede escribir desde dos chats.';
COMMENT ON COLUMN chatbot.usuario.nombre_completo IS 'Nombre completo devuelto por RENIEC al validar el DNI.';
COMMENT ON COLUMN chatbot.usuario.estado_conversacion_id IS 'Estado de la conversación (abierta o cerrada).';
COMMENT ON COLUMN chatbot.usuario.ultimo_mensaje_en IS 'Fecha y hora (UTC) del último mensaje, entrante o saliente. Ordena la bandeja de conversaciones.';
COMMENT ON COLUMN chatbot.usuario.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN chatbot.usuario.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.usuario.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN chatbot.usuario.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN chatbot.usuario.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN chatbot.usuario.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN chatbot.usuario.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN chatbot.usuario.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE chatbot.usuario IS 'Persona que escribe al chatbot, identificada por el id de su chat de WhatsApp. Reúne sus datos de contacto y el estado de su conversación. Nunca se borra: se desactiva.

Relaciones:
- estado_conversacion_id → catalogo.estado_conversacion: Garantiza que el estado de la conversación sea uno del catálogo. Sirve para saber si el usuario tiene una conversación abierta.';
COMMENT ON COLUMN gestion.rol.id IS 'Identificador numérico pequeño y fijo del valor. Es el que referencian las demás tablas.';
COMMENT ON COLUMN gestion.rol.codigo IS 'Código estable y único del valor. Es el que usa el código de la aplicación.';
COMMENT ON COLUMN gestion.rol.nombre IS 'Nombre legible del valor, para mostrar en pantalla.';
COMMENT ON COLUMN gestion.rol.descripcion IS 'Explicación opcional de qué significa el valor.';
COMMENT ON COLUMN gestion.rol.tipo_area_id IS 'Tipo de área a la que pertenece el rol. Nulo solo para el administrador, que vale en cualquier área o sin ella. El gestor, el establecimiento y OTRANS tienen tipo de área: el usuario debe tener un área de ese tipo (el gestor, siempre un establecimiento).';
COMMENT ON COLUMN gestion.rol.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN gestion.rol.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN gestion.rol.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.rol.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN gestion.rol.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN gestion.rol.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE gestion.rol IS 'Rol que puede tener un usuario interno de la plataforma de gestión: administrador, gestor (revisa y atiende los casos de su establecimiento), OTRANS (denuncias por corrupción), establecimiento y DIRIS (esta última desactivada). Un rol desactivado no se asigna a nadie. Si el rol tiene tipo de área (todos menos el administrador), solo lo puede tener un usuario de un área de ese tipo. Es la única plataforma con roles. Los valores son provisionales hasta que el área usuaria los confirme.

Relaciones:
- tipo_area_id → catalogo.tipo_area: Garantiza que el tipo de área del rol sea uno del catálogo. Sirve para exigir que el área del usuario sea de ese tipo.';
COMMENT ON COLUMN gestion.rol_categoria.rol_id IS 'Rol al que se le permite ver la categoría.';
COMMENT ON COLUMN gestion.rol_categoria.categoria_incidencia_id IS 'Categoría de incidencia que el rol puede ver.';
COMMENT ON COLUMN gestion.rol_categoria.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.rol_categoria.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE gestion.rol_categoria IS 'Qué categorías de incidencia puede ver cada rol. OTRANS ve solo las denuncias por corrupción (que además solo ve el administrador); el gestor y el establecimiento ven quejas, reclamos y otros; la DIRIS ve quejas y reclamos. La base rechaza dar una categoría sensible a un rol de establecimiento o de DIRIS. Solo se inserta (no se modifica ni se borra); la aplicación aplica la regla al listar.

Relaciones:
- categoria_incidencia_id → catalogo.categoria_incidencia: Garantiza que la categoría sea una del catálogo. Sirve para saber qué roles ven una categoría.
- rol_id → gestion.rol: Cada permiso pertenece a un rol. Sirve para saber qué categorías ve un rol.';
COMMENT ON COLUMN gestion.sesion_usuario.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN gestion.sesion_usuario.usuario_interno_id IS 'Usuario interno dueño de la sesión. No cambia.';
COMMENT ON COLUMN gestion.sesion_usuario.ultima_actividad_en IS 'Fecha y hora (UTC) de la última petición con esta sesión. La aplicación la actualiza para calcular el vencimiento por inactividad; no puede retroceder.';
COMMENT ON COLUMN gestion.sesion_usuario.vence_en IS 'Fecha y hora (UTC) en que la sesión vence de forma absoluta, aunque haya actividad. Se fija al crearla y no cambia.';
COMMENT ON COLUMN gestion.sesion_usuario.revocada_en IS 'Fecha y hora (UTC) en que se cerró la sesión (cierre del usuario, cierre por un administrador o desactivación del usuario). La fija la base una sola vez; nulo mientras está abierta.';
COMMENT ON COLUMN gestion.sesion_usuario.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN gestion.sesion_usuario.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.sesion_usuario.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN gestion.sesion_usuario.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN gestion.sesion_usuario.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON TABLE gestion.sesion_usuario IS 'Sesión abierta por un usuario interno. Su id es lo único que viaja en la cookie (firmada): ni roles ni datos de la persona salen de la base. La base impide crearla vencida o para un usuario desactivado, fija la fecha de revocación y cierra todas las sesiones de un usuario cuando se desactiva. No se borra: queda como historial de accesos.

Relaciones:
- usuario_interno_id → gestion.usuario_interno: Cada sesión pertenece a un usuario interno. Sirve para listar o cerrar todas las sesiones de una persona.';
COMMENT ON COLUMN gestion.usuario_interno.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN gestion.usuario_interno.nombre_completo IS 'Nombre completo de la persona.';
COMMENT ON COLUMN gestion.usuario_interno.correo IS 'Correo institucional, siempre en minúscula. Es único y es lo que la persona escribe para iniciar sesión.';
COMMENT ON COLUMN gestion.usuario_interno.area_id IS 'Área a la que pertenece el usuario. Obligatoria para los roles con tipo de área (gestor, establecimiento y OTRANS); opcional para el administrador. Cambiarla cierra las sesiones abiertas del usuario, y su tipo debe coincidir con el de sus roles que tengan tipo de área. Un establecimiento admite como máximo 3 usuarios activos.';
COMMENT ON COLUMN gestion.usuario_interno.activo IS 'Indica si la fila está vigente. Falso significa desactivada o eliminada de forma lógica.';
COMMENT ON COLUMN gestion.usuario_interno.eliminado_en IS 'Fecha y hora (UTC) del borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN gestion.usuario_interno.eliminado_por IS 'Quién hizo el borrado lógico. Nulo mientras la fila está activa.';
COMMENT ON COLUMN gestion.usuario_interno.version_fila IS 'Número de versión de la fila: empieza en 1 y sube en cada modificación real. Sirve para detectar cambios simultáneos.';
COMMENT ON COLUMN gestion.usuario_interno.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.usuario_interno.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON COLUMN gestion.usuario_interno.fecha_modificacion IS 'Fecha y hora (UTC) de la última modificación. La llena un disparador.';
COMMENT ON COLUMN gestion.usuario_interno.usuario_modificacion IS 'Quién hizo la última modificación, con el mismo formato que usuario_creacion. La llena un disparador.';
COMMENT ON COLUMN gestion.usuario_interno.password_hash IS 'Huella Argon2id de la clave, en formato PHC (empieza con $argon2id$). Nunca se guarda la clave; la base rechaza cualquier valor que no tenga ese formato.';
COMMENT ON TABLE gestion.usuario_interno IS 'Persona de la institución que gestiona los casos. Es distinta del usuario de WhatsApp. Inicia sesión con su correo y su clave: de la clave solo se guarda su huella Argon2id. Nunca se borra: se desactiva, y al desactivarla o cambiarle el área se cierran todas sus sesiones. Un establecimiento puede tener como máximo 3 usuarios activos.

Relaciones:
- area_id → catalogo.area: Ubica al usuario interno en un área del catálogo. Sirve para dirigirle los casos de su área.';
COMMENT ON COLUMN gestion.usuario_rol.usuario_interno_id IS 'Usuario interno que recibe el rol.';
COMMENT ON COLUMN gestion.usuario_rol.rol_id IS 'Rol que se le asigna.';
COMMENT ON COLUMN gestion.usuario_rol.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN gestion.usuario_rol.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE gestion.usuario_rol IS 'Relación entre usuarios internos y roles: un usuario puede tener varios roles y un rol lo tienen varios usuarios. Solo se inserta.

Relaciones:
- rol_id → gestion.rol: Enlaza la asignación con el rol. Sirve para saber qué personas tienen un rol.
- usuario_interno_id → gestion.usuario_interno: Enlaza la asignación con el usuario interno. Sirve para saber qué roles tiene una persona.';
COMMENT ON COLUMN ia.entrenamiento_categoria.id IS 'Identificador único de la fila: UUID versión 7, generado por la base y ordenable por fecha de creación.';
COMMENT ON COLUMN ia.entrenamiento_categoria.incidencia_paciente_id IS 'Incidencia cuya categoría se revisó.';
COMMENT ON COLUMN ia.entrenamiento_categoria.texto_entrenamiento IS 'Copia del relato del paciente en el momento de la revisión. En la primera etapa va sin depurar; ver la lista de la segunda etapa.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_ia_id IS 'Categoría que había asignado la IA.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_final_id IS 'Categoría que quedó tras la revisión: la misma de la IA si se confirmó, otra si se corrigió.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fue_corregida IS 'Verdadero si la persona corrigió la categoría de la IA; falso si la confirmó.';
COMMENT ON COLUMN ia.entrenamiento_categoria.categoria_confianza IS 'Puntaje de confianza que había dado la IA a su categoría.';
COMMENT ON COLUMN ia.entrenamiento_categoria.version_clasificador IS 'Versión del clasificador que produjo la categoría de la IA.';
COMMENT ON COLUMN ia.entrenamiento_categoria.revisado_por IS 'Quién revisó, con el formato tipo:detalle.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fecha_revision IS 'Fecha y hora (UTC) de la revisión.';
COMMENT ON COLUMN ia.entrenamiento_categoria.apto_entrenamiento IS 'Verdadero si la fila puede usarse para entrenar al modelo. La base la pone en falso cuando el caso se archiva por un motivo manual (datos insuficientes o no corresponde) y vuelve a verdadero si el caso se reabre. Es lo único de esta tabla que cambia, y solo lo cambia la base.';
COMMENT ON COLUMN ia.entrenamiento_categoria.fecha_creacion IS 'Fecha y hora (UTC) en que se insertó la fila. La llena un disparador con el reloj de la base.';
COMMENT ON COLUMN ia.entrenamiento_categoria.usuario_creacion IS 'Quién creó la fila, con el formato tipo:detalle (por ejemplo ciudadano:{waId} o sistema:bot). La llena un disparador con el actor que declaró la aplicación o, si no declaró, con el rol de la base.';
COMMENT ON TABLE ia.entrenamiento_categoria IS 'Copia de cada categoría que una persona revisó (corrigiéndola o confirmándola): lo que dijo la IA, lo que se decidió y el texto del caso. Registrar también las confirmaciones permite medir cuánto acierta el modelo y calibrar su puntaje. La llena un disparador y solo se inserta; lo único que cambia después es apto_entrenamiento, que la base baja cuando el caso se archiva por un motivo manual.

Relaciones:
- categoria_final_id → catalogo.categoria_incidencia: Garantiza que la categoría decidida sea una del catálogo. Es la respuesta correcta con la que se mejora el modelo.
- categoria_ia_id → catalogo.categoria_incidencia: Garantiza que la categoría de la IA sea una del catálogo. Sirve para medir errores del modelo.
- incidencia_paciente_id → chatbot.incidencia_paciente: Enlaza la copia de entrenamiento con el caso original. Sirve para volver al expediente completo.';
