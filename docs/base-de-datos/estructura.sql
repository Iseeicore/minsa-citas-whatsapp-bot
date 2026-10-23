SELECT json_build_object(
  'columnas', (SELECT json_agg(x) FROM (
    SELECT c.table_schema AS esquema, c.table_name AS tabla, c.column_name AS columna, c.ordinal_position AS orden,
           format_type(a.atttypid, a.atttypmod) AS tipo, (c.is_nullable = 'YES') AS nulo, c.column_default AS defecto
      FROM information_schema.columns c
      JOIN pg_namespace n ON n.nspname = c.table_schema
      JOIN pg_class cl ON cl.relname = c.table_name AND cl.relnamespace = n.oid
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = c.column_name
     WHERE c.table_schema IN ('catalogo', 'chatbot', 'gestion', 'ia')
     ORDER BY 1, 2, 4) x),
  'restricciones', (SELECT json_agg(x) FROM (
    SELECT n.nspname AS esquema, cl.relname AS tabla, co.conname AS nombre, co.contype AS tipo,
           pg_get_constraintdef(co.oid) AS definicion,
           (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(co.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum) AS columnas,
           (SELECT nr.nspname || '.' || clr.relname FROM pg_class clr JOIN pg_namespace nr ON nr.oid = clr.relnamespace
             WHERE clr.oid = co.confrelid) AS tabla_ref,
           (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(co.confkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = co.confrelid AND a.attnum = k.attnum) AS columnas_ref
      FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname IN ('catalogo', 'chatbot', 'gestion', 'ia')
     ORDER BY 1, 2, 3) x),
  'indices', (SELECT json_agg(x) FROM (
    SELECT schemaname AS esquema, tablename AS tabla, indexname AS nombre, indexdef AS definicion
      FROM pg_indexes WHERE schemaname IN ('catalogo', 'chatbot', 'gestion', 'ia') ORDER BY 1, 2, 3) x),
  'disparadores', (SELECT json_agg(x) FROM (
    SELECT n.nspname AS esquema, cl.relname AS tabla, t.tgname AS nombre, p.proname AS funcion,
           pg_get_triggerdef(t.oid) AS definicion
      FROM pg_trigger t
      JOIN pg_class cl ON cl.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE NOT t.tgisinternal AND n.nspname IN ('catalogo', 'chatbot', 'gestion', 'ia')
     ORDER BY 1, 2, 3) x)
);
