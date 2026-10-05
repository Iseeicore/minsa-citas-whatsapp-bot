\set ON_ERROR_STOP on
\set QUIET on

-- Toda tabla y columna de los cuatro esquemas debe traer su descripcion (el diccionario de datos vive dentro de la base).
-- Si una migracion agrega una tabla o columna sin su COMMENT, esta prueba falla y dice cual.
DO $$
DECLARE faltantes text;
BEGIN
  SELECT string_agg(n.nspname || '.' || c.relname, ', ' ORDER BY n.nspname, c.relname)
    INTO faltantes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('catalogo', 'chatbot', 'gestion', 'ia')
     AND c.relkind = 'r'
     AND obj_description(c.oid, 'pg_class') IS NULL;
  ASSERT faltantes IS NULL, 'K01 tablas sin descripcion: ' || coalesce(faltantes, '');

  SELECT string_agg(n.nspname || '.' || c.relname || '.' || a.attname, ', ' ORDER BY n.nspname, c.relname, a.attnum)
    INTO faltantes
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('catalogo', 'chatbot', 'gestion', 'ia')
     AND c.relkind = 'r'
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND col_description(c.oid, a.attnum) IS NULL;
  ASSERT faltantes IS NULL, 'K02 columnas sin descripcion: ' || coalesce(faltantes, '');

  ASSERT obj_description('chatbot.purgar_sesiones_inactivas(integer, integer)'::regprocedure, 'pg_proc') IS NOT NULL,
    'K03 la funcion de purga tiene descripcion';
  ASSERT obj_description('chatbot.archivar_incidencias_resueltas(integer, integer)'::regprocedure, 'pg_proc') IS NOT NULL
     AND obj_description('chatbot.archivar_incidencias_vencidas(integer, integer)'::regprocedure, 'pg_proc') IS NOT NULL,
    'K04 las dos funciones de archivado tienen descripcion';
END $$;

\echo TODAS LAS PRUEBAS DE COMENTARIOS PASARON
