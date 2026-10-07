-- Codigo legible de la incidencia: MINSA-AAAA-NNNNNN (por ejemplo MINSA-2026-003241).
--
-- Hasta ahora un caso solo se identificaba por su id (UUIDv7) o por trace_id (el id del turno del chat), que no sirven para
-- decirlos por telefono ni para escribirlos en un oficio. AAAA es el anio de la llegada en la zona America/Lima y NNNNNN el
-- correlativo de ese anio (6 digitos; pasado el 999999 sigue creciendo), que reinicia cada anio. Lo genera la base al insertar
-- (nadie lo envia: lo que mande quien inserta se descarta) y no se puede modificar.
--
-- El correlativo sale de una fila por anio en chatbot.contador_codigo_incidencia, que se incrementa dentro de la misma
-- transaccion del INSERT: si la transaccion se revierte el numero no se gasta (sin huecos) y dos transacciones simultaneas
-- esperan su turno en lugar de repetir el codigo. Una secuencia no sirve: no revierte y deja huecos.

-- CreateTable
CREATE TABLE "chatbot"."contador_codigo_incidencia" (
    "anio" SMALLINT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_modificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_contador_codigo_incidencia" PRIMARY KEY ("anio")
);

ALTER TABLE chatbot.contador_codigo_incidencia
  ADD CONSTRAINT ck_contador_codigo_incidencia_anio CHECK (anio BETWEEN 1000 AND 9999),
  ADD CONSTRAINT ck_contador_codigo_incidencia_ultimo CHECK (ultimo >= 0);

-- AlterTable
ALTER TABLE "chatbot"."incidencia_paciente" ADD COLUMN "codigo" TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION chatbot.generar_codigo_incidencia(p_fecha timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_anio integer;
  v_numero integer;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'generar_codigo_incidencia: la fecha es obligatoria' USING ERRCODE = 'check_violation';
  END IF;
  v_anio := extract(year FROM p_fecha AT TIME ZONE 'America/Lima')::integer;

  INSERT INTO chatbot.contador_codigo_incidencia AS c (anio, ultimo) VALUES (v_anio, 1)
  ON CONFLICT (anio) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_numero;

  RETURN 'MINSA-' || lpad(v_anio::text, 4, '0') || '-' || repeat('0', greatest(6 - length(v_numero::text), 0)) || v_numero::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_asignar_codigo_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.codigo := chatbot.generar_codigo_incidencia(NEW.fecha_creacion);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reglas_contador_codigo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contador_codigo_incidencia: el contador no se borra' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.anio IS DISTINCT FROM OLD.anio OR NEW.ultimo < OLD.ultimo THEN
    RAISE EXCEPTION 'contador_codigo_incidencia: el contador solo avanza' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION chatbot.rellenar_codigos_incidencia() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_total integer := 0;
BEGIN
  PERFORM set_config('app.actor', 'sistema:migracion', true);
  FOR r IN
    SELECT id, fecha_creacion FROM chatbot.incidencia_paciente WHERE codigo = '' ORDER BY fecha_creacion, id
  LOOP
    UPDATE chatbot.incidencia_paciente SET codigo = chatbot.generar_codigo_incidencia(r.fecha_creacion) WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Redefine la regla de la incidencia: igual que en la migracion archivado_por_vencimiento, mas la regla del codigo (una vez
-- asignado no cambia; el unico cambio permitido es el relleno de las filas anteriores a esta migracion, que traen '').
CREATE OR REPLACE FUNCTION public.fn_reglas_incidencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_actor text := public.fn_actor();
BEGIN
  IF NEW.canal_origen_id IS DISTINCT FROM OLD.canal_origen_id
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.mensaje_id IS DISTINCT FROM OLD.mensaje_id
     OR NEW.wa_id IS DISTINCT FROM OLD.wa_id
     OR NEW.es_anonimo IS DISTINCT FROM OLD.es_anonimo
     OR NEW.dni_reclamante IS DISTINCT FROM OLD.dni_reclamante
     OR NEW.nombre_reclamante IS DISTINCT FROM OLD.nombre_reclamante
     OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
     OR NEW.trace_id IS DISTINCT FROM OLD.trace_id THEN
    RAISE EXCEPTION 'incidencia_paciente: los datos de origen no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.codigo IS DISTINCT FROM OLD.codigo AND OLD.codigo <> '' THEN
    RAISE EXCEPTION 'incidencia_paciente: el codigo lo asigna la base y no se puede modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.categoria_asignada_en IS DISTINCT FROM OLD.categoria_asignada_en
     OR NEW.categoria_corregida_en IS DISTINCT FROM OLD.categoria_corregida_en
     OR NEW.categoria_corregida_por IS DISTINCT FROM OLD.categoria_corregida_por
     OR NEW.categoria_confirmada_por IS DISTINCT FROM OLD.categoria_confirmada_por
     OR NEW.resuelto_en IS DISTINCT FROM OLD.resuelto_en
     OR NEW.resuelto_por IS DISTINCT FROM OLD.resuelto_por THEN
    RAISE EXCEPTION 'incidencia_paciente: las fechas y actores de categoria y resolucion los llena la base'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NOT NULL
     AND (NEW.categoria_ia_id IS DISTINCT FROM OLD.categoria_ia_id
          OR NEW.categoria_confianza IS DISTINCT FROM OLD.categoria_confianza
          OR NEW.version_clasificador IS DISTINCT FROM OLD.version_clasificador) THEN
    RAISE EXCEPTION 'incidencia_paciente: la categoria, la confianza y la version del clasificador de la IA no se pueden modificar'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.categoria_ia_id IS NULL AND NEW.categoria_ia_id IS NOT NULL THEN
    IF NEW.categoria_id IS NOT NULL AND NEW.categoria_id IS DISTINCT FROM NEW.categoria_ia_id THEN
      RAISE EXCEPTION 'incidencia_paciente: la primera categoria debe ser la que asigna la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_id := NEW.categoria_ia_id;
    NEW.categoria_asignada_en := now();
    IF OLD.estado_incidencia_id = 1 AND NEW.estado_incidencia_id = 1 THEN
      NEW.estado_incidencia_id := 2;
    END IF;
  ELSIF NEW.categoria_id IS DISTINCT FROM OLD.categoria_id THEN
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria la asigna primero la IA'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria no se puede quitar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_confirmada_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se confirmo y no se puede corregir'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la categoria ya se corrigio una vez'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_corregida_en := now();
    NEW.categoria_corregida_por := v_actor;
  END IF;

  IF NEW.categoria_confirmada_en IS DISTINCT FROM OLD.categoria_confirmada_en THEN
    IF OLD.categoria_confirmada_en IS NOT NULL OR NEW.categoria_confirmada_en IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: la confirmacion se registra una sola vez y no se quita'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.categoria_ia_id IS NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: no hay categoria de la IA que confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.categoria_corregida_en IS NOT NULL THEN
      RAISE EXCEPTION 'incidencia_paciente: una categoria corregida no se puede confirmar'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.categoria_confirmada_en := now();
    NEW.categoria_confirmada_por := v_actor;
  END IF;

  IF OLD.resolucion IS NOT NULL AND NEW.resolucion IS DISTINCT FROM OLD.resolucion THEN
    RAISE EXCEPTION 'incidencia_paciente: la resolucion solo se registra una vez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.resolucion IS NULL AND NEW.resolucion IS NOT NULL THEN
    IF NEW.estado_incidencia_id NOT IN (OLD.estado_incidencia_id, 4) THEN
      RAISE EXCEPTION 'incidencia_paciente: al registrar la resolucion el estado pasa a RESUELTO'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.resuelto_en := now();
    NEW.resuelto_por := v_actor;
    NEW.estado_incidencia_id := 4;
  END IF;

  IF NEW.estado_incidencia_id = 4 AND OLD.estado_incidencia_id <> 4 AND NEW.resolucion IS NULL THEN
    RAISE EXCEPTION 'incidencia_paciente: RESUELTO se alcanza al registrar la resolucion'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_incidencia_id IS DISTINCT FROM OLD.estado_incidencia_id
     AND (OLD.estado_incidencia_id, NEW.estado_incidencia_id)
         NOT IN ((1, 2), (1, 4), (2, 3), (2, 4), (2, 6), (3, 4), (6, 3), (6, 4), (4, 7), (1, 7), (2, 7), (3, 7), (6, 7)) THEN
    RAISE EXCEPTION 'incidencia_paciente: transicion de estado no permitida (% a %)', OLD.estado_incidencia_id, NEW.estado_incidencia_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.estado_incidencia_id = 7 AND OLD.estado_incidencia_id IN (1, 2, 3, 6) AND v_actor <> 'sistema:vencimiento' THEN
    RAISE EXCEPTION 'incidencia_paciente: un caso abierto solo se archiva por vencimiento del plazo de atencion, y lo hace el sistema'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contador_codigo_incidencia_b_fecha BEFORE UPDATE ON chatbot.contador_codigo_incidencia
  FOR EACH ROW EXECUTE FUNCTION public.fn_fecha_modificacion();

CREATE TRIGGER trg_contador_codigo_incidencia_a_reglas BEFORE UPDATE OR DELETE ON chatbot.contador_codigo_incidencia
  FOR EACH ROW EXECUTE FUNCTION public.fn_reglas_contador_codigo();

-- Las filas anteriores a esta migracion reciben su codigo en el orden en que llegaron, firmado como sistema:migracion; solo
-- despues se exige que el codigo exista, sea unico y se genere en cada insercion nueva.
SELECT chatbot.rellenar_codigos_incidencia();

-- CreateIndex
CREATE UNIQUE INDEX "uq_incidencia_paciente_codigo" ON "chatbot"."incidencia_paciente"("codigo");

ALTER TABLE chatbot.incidencia_paciente
  ADD CONSTRAINT ck_incidencia_paciente_codigo CHECK (codigo ~ '^MINSA-[0-9]{4}-[0-9]{6,}$');

CREATE TRIGGER trg_incidencia_paciente_b_codigo_ins BEFORE INSERT ON chatbot.incidencia_paciente
  FOR EACH ROW EXECUTE FUNCTION public.fn_asignar_codigo_incidencia();

-- Descripciones del diccionario (generadas desde diccionario.json con npm run db:diccionario).
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.anio IS 'Año del código (zona America/Lima), de cuatro dígitos. Es la clave: hay una fila por año.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.ultimo IS 'Último correlativo entregado ese año. El próximo código usa este valor más uno. Solo puede subir.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.fecha_creacion IS 'Fecha y hora (UTC) en que se creó la fila del año, es decir, cuando llegó la primera incidencia de ese año.';
COMMENT ON COLUMN chatbot.contador_codigo_incidencia.fecha_modificacion IS 'Fecha y hora (UTC) del último código entregado ese año. La llena un disparador.';
COMMENT ON TABLE chatbot.contador_codigo_incidencia IS 'Último correlativo usado en cada año para el código de las incidencias. Una fila por año, que la base incrementa dentro de la misma transacción de la inserción: si la transacción se revierte el número no se gasta y dos inserciones simultáneas esperan su turno. Solo avanza y nunca se borra.';
COMMENT ON COLUMN chatbot.incidencia_paciente.codigo IS 'Código legible del caso, con el formato MINSA-AAAA-NNNNNN: AAAA es el año de llegada (zona America/Lima) y NNNNNN el correlativo de ese año, que reinicia cada año. Es único y sirve para nombrar el caso por teléfono o en un oficio. Lo genera la base al insertar (lo que se envíe se descarta) y no se puede modificar; las incidencias anteriores a su creación lo recibieron en orden de llegada.';
COMMENT ON TABLE chatbot.incidencia_paciente IS 'Incidencia que el paciente reporta al chatbot: denuncia por corrupción, queja o reclamo. Es el registro central. Nace con la categoría vacía y datos mínimos; luego la IA asigna la categoría y una persona la corrige o la confirma, una sola vez. Los datos de origen no se pueden modificar. Cada incidencia lleva un código legible (MINSA-AAAA-NNNNNN) que asigna la base. Nunca se borra: se desactiva.

Relaciones:
- canal_origen_id → catalogo.canal_origen: Garantiza que el canal sea uno del catálogo. Sirve para unificar reportes de varios canales.
- categoria_id → catalogo.categoria_incidencia: Garantiza que la categoría vigente sea una del catálogo. Sirve para dirigir el caso según sea denuncia, queja o reclamo.
- categoria_ia_id → catalogo.categoria_incidencia: Garantiza que la categoría original de la IA sea una del catálogo. Sirve para medir cuánto se equivoca el modelo.
- estado_incidencia_id → catalogo.estado_incidencia: Garantiza que el estado sea uno del catálogo. Sirve para listar lo pendiente de cada etapa.
- mensaje_id → chatbot.mensaje: Enlaza el reporte con el mensaje del chat del que nació. Sirve para reconstruir el contexto de la conversación.
- usuario_id → chatbot.usuario: Cada reporte lo presenta un usuario. Sirve para ver todo lo que reportó una persona.';

COMMENT ON FUNCTION chatbot.generar_codigo_incidencia(timestamp with time zone) IS
  'Entrega el siguiente código MINSA-AAAA-NNNNNN para una fecha: el año se toma en la zona America/Lima y el correlativo sale del contador de ese año, que se incrementa dentro de la transacción de quien la llama (si se revierte no se gasta el número y dos transacciones simultáneas esperan su turno). La llama el disparador de inserción de la incidencia.';

COMMENT ON FUNCTION chatbot.rellenar_codigos_incidencia() IS
  'Asigna código a las incidencias que aún no lo tienen, en el orden en que llegaron, firmado como sistema:migracion, y devuelve cuántas rellenó. La migración que creó el código la usó una vez; repetirla no cambia nada.';

COMMENT ON FUNCTION public.fn_asignar_codigo_incidencia() IS
  'Al insertar una incidencia le pone su código y descarta el que haya enviado quien inserta.';

COMMENT ON FUNCTION public.fn_reglas_contador_codigo() IS
  'Impide borrar filas del contador de códigos, cambiar su año o bajar el último correlativo.';
