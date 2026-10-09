-- CreateTable
CREATE TABLE "catalogo"."estado_archivo" (
    "id" SMALLSERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_estado_archivo" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot"."solicitud_carga" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "incidencia_paciente_id" UUID,
    "sesion_id" UUID,
    "usuario_id" UUID NOT NULL,
    "hash_token" TEXT NOT NULL,
    "vence_en" TIMESTAMPTZ(3) NOT NULL,
    "cerrada_en" TIMESTAMPTZ(3),
    "max_archivos" SMALLINT NOT NULL,
    "max_bytes_archivo" INTEGER NOT NULL,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_solicitud_carga" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot"."archivo_recibido" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "solicitud_carga_id" UUID NOT NULL,
    "nombre_original" TEXT,
    "mime_declarado" TEXT NOT NULL,
    "mime_detectado" TEXT,
    "tamano" BIGINT NOT NULL,
    "hash_archivo" TEXT,
    "ruta_cuarentena" TEXT NOT NULL,
    "estado_archivo_id" SMALLINT NOT NULL DEFAULT 1,
    "motivo_rechazo" TEXT,
    "verificado_en" TIMESTAMPTZ(3),
    "evidencia_id" UUID,
    "version_fila" INTEGER NOT NULL DEFAULT 1,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_creacion" TEXT NOT NULL DEFAULT CURRENT_USER,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_modificacion" TEXT NOT NULL DEFAULT CURRENT_USER,

    CONSTRAINT "pk_archivo_recibido" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_estado_archivo_codigo" ON "catalogo"."estado_archivo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "uq_solicitud_carga_hash_token" ON "chatbot"."solicitud_carga"("hash_token");

-- CreateIndex
CREATE INDEX "ix_solicitud_carga_incidencia_paciente" ON "chatbot"."solicitud_carga"("incidencia_paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_archivo_recibido_evidencia" ON "chatbot"."archivo_recibido"("evidencia_id");

-- CreateIndex
CREATE INDEX "ix_archivo_recibido_solicitud_estado" ON "chatbot"."archivo_recibido"("solicitud_carga_id", "estado_archivo_id");

-- AddForeignKey
ALTER TABLE "chatbot"."solicitud_carga" ADD CONSTRAINT "fk_solicitud_carga_incidencia_paciente" FOREIGN KEY ("incidencia_paciente_id") REFERENCES "chatbot"."incidencia_paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."solicitud_carga" ADD CONSTRAINT "fk_solicitud_carga_usuario" FOREIGN KEY ("usuario_id") REFERENCES "chatbot"."usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_solicitud_carga" FOREIGN KEY ("solicitud_carga_id") REFERENCES "chatbot"."solicitud_carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_estado_archivo" FOREIGN KEY ("estado_archivo_id") REFERENCES "catalogo"."estado_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot"."archivo_recibido" ADD CONSTRAINT "fk_archivo_recibido_evidencia" FOREIGN KEY ("evidencia_id") REFERENCES "chatbot"."evidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Restricciones e indices parciales que Prisma no expresa.
ALTER TABLE chatbot.solicitud_carga
  ADD CONSTRAINT ck_solicitud_carga_vencimiento CHECK (vence_en > fecha_creacion),
  ADD CONSTRAINT ck_solicitud_carga_limites CHECK (max_archivos > 0 AND max_bytes_archivo > 0),
  ADD CONSTRAINT ck_solicitud_carga_destino CHECK (incidencia_paciente_id IS NOT NULL OR sesion_id IS NOT NULL);

ALTER TABLE chatbot.archivo_recibido
  ADD CONSTRAINT ck_archivo_recibido_tamano CHECK (tamano > 0),
  ADD CONSTRAINT ck_archivo_recibido_rechazo CHECK ((estado_archivo_id = 4) = (motivo_rechazo IS NOT NULL)),
  ADD CONSTRAINT ck_archivo_recibido_verificado
    CHECK (estado_archivo_id <> 3 OR (mime_detectado IS NOT NULL AND hash_archivo IS NOT NULL)),
  ADD CONSTRAINT ck_archivo_recibido_cierre CHECK ((estado_archivo_id IN (3, 4)) = (verificado_en IS NOT NULL));

CREATE INDEX ix_solicitud_carga_abierta
  ON chatbot.solicitud_carga (vence_en)
  WHERE cerrada_en IS NULL;

CREATE INDEX ix_solicitud_carga_sesion_sin_incidencia
  ON chatbot.solicitud_carga (sesion_id)
  WHERE incidencia_paciente_id IS NULL AND cerrada_en IS NULL;

CREATE INDEX ix_archivo_recibido_pendiente
  ON chatbot.archivo_recibido (fecha_creacion)
  WHERE estado_archivo_id IN (1, 2);

-- Reglas de la solicitud: los datos de emision no cambian (salvo que la incidencia se enlaza una sola vez, cuando el
-- ciudadano sube los archivos antes de que exista la incidencia) y se cierra una sola vez (la fecha de cierre la fija la base).
CREATE OR REPLACE FUNCTION public.fn_reglas_solicitud_carga() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.incidencia_paciente_id IS DISTINCT FROM OLD.incidencia_paciente_id
     AND (OLD.incidencia_paciente_id IS NOT NULL OR NEW.incidencia_paciente_id IS NULL) THEN
    RAISE EXCEPTION 'solicitud_carga: la incidencia se enlaza una sola vez y no se cambia'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.sesion_id IS DISTINCT FROM OLD.sesion_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.hash_token IS DISTINCT FROM OLD.hash_token
     OR NEW.vence_en IS DISTINCT FROM OLD.vence_en
     OR NEW.max_archivos IS DISTINCT FROM OLD.max_archivos
     OR NEW.max_bytes_archivo IS DISTINCT FROM OLD.max_bytes_archivo THEN
    RAISE EXCEPTION 'solicitud_carga: los datos de la solicitud no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.cerrada_en IS DISTINCT FROM OLD.cerrada_en THEN
    IF OLD.cerrada_en IS NOT NULL OR NEW.cerrada_en IS NULL THEN
      RAISE EXCEPTION 'solicitud_carga: la solicitud se cierra una sola vez y no se reabre'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.cerrada_en := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Reglas del archivo: recibido -> verificando -> verificado o rechazado; los estados finales no cambian.
CREATE OR REPLACE FUNCTION public.fn_reglas_archivo_recibido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.solicitud_carga_id IS DISTINCT FROM OLD.solicitud_carga_id
     OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
     OR NEW.mime_declarado IS DISTINCT FROM OLD.mime_declarado
     OR NEW.tamano IS DISTINCT FROM OLD.tamano
     OR NEW.ruta_cuarentena IS DISTINCT FROM OLD.ruta_cuarentena THEN
    RAISE EXCEPTION 'archivo_recibido: los datos de lo que se recibio no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.verificado_en IS DISTINCT FROM OLD.verificado_en THEN
    RAISE EXCEPTION 'archivo_recibido: la fecha de verificacion la llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado_archivo_id IN (3, 4) THEN
    IF OLD.estado_archivo_id = 3 AND OLD.evidencia_id IS NULL AND NEW.evidencia_id IS NOT NULL
       AND NEW.estado_archivo_id = OLD.estado_archivo_id
       AND NEW.mime_detectado IS NOT DISTINCT FROM OLD.mime_detectado
       AND NEW.hash_archivo IS NOT DISTINCT FROM OLD.hash_archivo
       AND NEW.motivo_rechazo IS NOT DISTINCT FROM OLD.motivo_rechazo THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'archivo_recibido: un archivo verificado o rechazado ya no cambia'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_archivo_id IS DISTINCT FROM OLD.estado_archivo_id THEN
    IF (OLD.estado_archivo_id, NEW.estado_archivo_id) NOT IN ((1, 2), (1, 4), (2, 1), (2, 3), (2, 4)) THEN
      RAISE EXCEPTION 'archivo_recibido: transicion de estado no permitida (% a %)', OLD.estado_archivo_id, NEW.estado_archivo_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.estado_archivo_id IN (3, 4) THEN
      NEW.verificado_en := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  nombre text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalogo.estado_archivo', 'chatbot.solicitud_carga', 'chatbot.archivo_recibido'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_ins BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
    EXECUTE format('CREATE TRIGGER trg_%s_b_auditoria_upd BEFORE UPDATE ON %s FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_auditoria_mutable()', nombre, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['chatbot.solicitud_carga', 'chatbot.archivo_recibido'] LOOP
    nombre := split_part(t, '.', 2);
    EXECUTE format('CREATE TRIGGER trg_%s_bloqueo_borrado BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_operacion(''borrado'')', nombre, t);
  END LOOP;
END;
$$;

CREATE TRIGGER trg_solicitud_carga_a_reglas BEFORE UPDATE ON chatbot.solicitud_carga
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_reglas_solicitud_carga();

CREATE TRIGGER trg_archivo_recibido_a_reglas BEFORE UPDATE ON chatbot.archivo_recibido
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.fn_reglas_archivo_recibido();

SELECT set_config('app.actor', 'sistema:migracion', true);

INSERT INTO catalogo.estado_archivo (id, codigo, nombre, descripcion) VALUES
  (1, 'RECIBIDO', 'Recibido', 'Subido por el ciudadano, todavía sin analizar'),
  (2, 'VERIFICANDO', 'Verificando', 'En análisis: tamaño, firma real del archivo y antivirus'),
  (3, 'VERIFICADO', 'Verificado', 'Pasó todas las verificaciones'),
  (4, 'RECHAZADO', 'Rechazado', 'No pasó una verificación; se indica el motivo');
SELECT setval(pg_get_serial_sequence('catalogo.estado_archivo', 'id'), 4);

-- Descripcion de cada tabla y columna nueva (diccionario de datos dentro de la base).
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
