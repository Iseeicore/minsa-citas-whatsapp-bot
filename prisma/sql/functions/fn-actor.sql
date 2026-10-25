CREATE OR REPLACE FUNCTION public.fn_actor() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.actor', true), ''), current_user)
$$;
