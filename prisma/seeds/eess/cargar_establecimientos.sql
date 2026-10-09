-- Carga del padron de establecimientos de salud: las 4 DIRIS de Lima, un area por establecimiento y el establecimiento.
--
-- Lo llama scripts/db-seed-eess.mjs dentro de una transaccion y tambien las pruebas. Espera que la sesion ya tenga la tabla
-- temporal eess_fuente con una fila por establecimiento:
--   eess_fuente (codigo_renipress text, nombre text, nivel text, categoria text, diris text, departamento text, provincia text, distrito text)
-- Es idempotente: una fila que no cambio no se toca (ni sube su version), y una que cambio se actualiza.
\set ON_ERROR_STOP on

DO $$ BEGIN PERFORM set_config('app.actor', 'sistema:seed-eess', false); END $$;

DROP TABLE IF EXISTS pg_temp.eess_normalizado;
CREATE TEMP TABLE eess_normalizado AS
SELECT regexp_replace(btrim(f.codigo_renipress), '^0+', '') AS codigo_renipress,
       btrim(f.nombre) AS nombre,
       btrim(f.nivel) AS nivel,
       nullif(btrim(f.categoria), '') AS categoria,
       btrim(f.diris) AS diris,
       nullif(btrim(f.departamento), '') AS departamento,
       nullif(btrim(f.provincia), '') AS provincia,
       nullif(btrim(f.distrito), '') AS distrito
  FROM eess_fuente f;

DROP TABLE IF EXISTS pg_temp.eess_diris;
CREATE TEMP TABLE eess_diris (codigo text PRIMARY KEY, nombre text NOT NULL UNIQUE);
INSERT INTO eess_diris (codigo, nombre) VALUES
  ('DIRIS-LE', 'DIRIS Lima Este'),
  ('DIRIS-LN', 'DIRIS Lima Norte'),
  ('DIRIS-LC', 'DIRIS Lima Centro'),
  ('DIRIS-LS', 'DIRIS Lima Sur');

DO $$
DECLARE
  v_malas text;
BEGIN
  SELECT string_agg(coalesce(n.codigo_renipress, '?'), ', ') INTO v_malas FROM eess_normalizado n
   WHERE n.codigo_renipress !~ '^[1-9][0-9]{0,7}$' OR n.nombre = '';
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'eess: codigo RENIPRESS o nombre invalido en: %', v_malas;
  END IF;

  SELECT string_agg(DISTINCT n.nivel, ', ') INTO v_malas FROM eess_normalizado n
   WHERE NOT EXISTS (SELECT 1 FROM catalogo.nivel_atencion na WHERE na.codigo = n.nivel);
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'eess: nivel de atencion desconocido: %', v_malas;
  END IF;

  SELECT string_agg(DISTINCT n.diris, ', ') INTO v_malas FROM eess_normalizado n
   WHERE NOT EXISTS (SELECT 1 FROM eess_diris d WHERE d.nombre = n.diris);
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'eess: DIRIS desconocida: %', v_malas;
  END IF;

  SELECT string_agg(n.codigo_renipress, ', ') INTO v_malas FROM (
    SELECT codigo_renipress FROM eess_normalizado GROUP BY codigo_renipress HAVING count(*) > 1
  ) n;
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'eess: codigo RENIPRESS repetido en la fuente (despues de quitar ceros): %', v_malas;
  END IF;
END $$;

INSERT INTO catalogo.area (codigo, nombre, tipo_area_id)
SELECT d.codigo, d.nombre, (SELECT id FROM catalogo.tipo_area WHERE codigo = 'DIRIS')
  FROM eess_diris d
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tipo_area_id = EXCLUDED.tipo_area_id
 WHERE (catalogo.area.nombre, catalogo.area.tipo_area_id) IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.tipo_area_id);

INSERT INTO catalogo.area (codigo, nombre, tipo_area_id, padre_id)
SELECT 'EESS-' || n.codigo_renipress, n.nombre, (SELECT id FROM catalogo.tipo_area WHERE codigo = 'ESTABLECIMIENTO'), padre.id
  FROM eess_normalizado n
  JOIN eess_diris d ON d.nombre = n.diris
  JOIN catalogo.area padre ON padre.codigo = d.codigo
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, tipo_area_id = EXCLUDED.tipo_area_id, padre_id = EXCLUDED.padre_id
 WHERE (catalogo.area.nombre, catalogo.area.tipo_area_id, catalogo.area.padre_id)
       IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.tipo_area_id, EXCLUDED.padre_id);

INSERT INTO catalogo.establecimiento_salud (codigo_renipress, nombre, nivel_atencion_id, categoria, departamento, provincia, distrito, area_id)
SELECT n.codigo_renipress, n.nombre, na.id, n.categoria, n.departamento, n.provincia, n.distrito, a.id
  FROM eess_normalizado n
  JOIN catalogo.nivel_atencion na ON na.codigo = n.nivel
  JOIN catalogo.area a ON a.codigo = 'EESS-' || n.codigo_renipress
ON CONFLICT (codigo_renipress) DO UPDATE
   SET nombre = EXCLUDED.nombre, nivel_atencion_id = EXCLUDED.nivel_atencion_id, categoria = EXCLUDED.categoria,
       departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito, area_id = EXCLUDED.area_id
 WHERE (catalogo.establecimiento_salud.nombre, catalogo.establecimiento_salud.nivel_atencion_id, catalogo.establecimiento_salud.categoria,
        catalogo.establecimiento_salud.departamento, catalogo.establecimiento_salud.provincia, catalogo.establecimiento_salud.distrito,
        catalogo.establecimiento_salud.area_id)
       IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.nivel_atencion_id, EXCLUDED.categoria,
                         EXCLUDED.departamento, EXCLUDED.provincia, EXCLUDED.distrito, EXCLUDED.area_id);

DROP TABLE pg_temp.eess_diris;
DROP TABLE pg_temp.eess_normalizado;
