-- 0007_prune_logs_helpers.sql
--
-- RPC used by the `prune-logs` Edge Function (cron path) to chunk-delete
-- rows past their retention window. PostgREST can't express
--   DELETE FROM <t> WHERE ctid IN (SELECT ctid FROM <t> WHERE … LIMIT N)
-- directly, so we expose one SECURITY DEFINER function that owns the
-- whole batch loop. EXECUTE is granted only to `service_role` (the cron
-- caller); anon and authenticated cannot reach it.
--
-- The `target` argument is whitelisted to the three retention tables —
-- the function will not touch any other relation, so there is no SQL
-- injection surface even though we use `format(%I)` to interpolate the
-- table name.

CREATE OR REPLACE FUNCTION public.prune_old_rows(
    target TEXT,
    chunk_size INTEGER DEFAULT 10000,
    max_iterations INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    where_sql TEXT;
    deleted INTEGER := 0;
    iter_count INTEGER := 0;
    chunk_deleted INTEGER;
BEGIN
    -- Whitelist + per-target retention window.
    -- Keep these in lockstep with `api/routes/prune-logs.ts`.
    CASE target
        WHEN 'audit_log' THEN
            where_sql := 'created_at < NOW() - INTERVAL ''180 days''';
        WHEN 'ai_feedback' THEN
            where_sql := 'created_at < NOW() - INTERVAL ''365 days''';
        WHEN 'feedback_consumed' THEN
            where_sql := 'used_at < NOW() - INTERVAL ''30 days''';
        ELSE
            RAISE EXCEPTION 'prune_old_rows: target % is not allowed', target
                USING ERRCODE = 'invalid_parameter_value';
    END CASE;

    -- Clamp inputs so a hostile / buggy caller can't ask for a million-
    -- iteration loop holding a transaction open.
    IF chunk_size IS NULL OR chunk_size <= 0 THEN chunk_size := 10000; END IF;
    IF chunk_size > 50000 THEN chunk_size := 50000; END IF;
    IF max_iterations IS NULL OR max_iterations <= 0 THEN max_iterations := 100; END IF;
    IF max_iterations > 200 THEN max_iterations := 200; END IF;

    LOOP
        EXIT WHEN iter_count >= max_iterations;

        EXECUTE format(
            'WITH del AS (' ||
            '  DELETE FROM public.%I ' ||
            '  WHERE ctid IN (' ||
            '    SELECT ctid FROM public.%I WHERE %s LIMIT %s' ||
            '  )' ||
            '  RETURNING 1' ||
            ') SELECT COUNT(*)::int FROM del',
            target, target, where_sql, chunk_size
        ) INTO chunk_deleted;

        EXIT WHEN chunk_deleted = 0;

        deleted := deleted + chunk_deleted;
        iter_count := iter_count + 1;
    END LOOP;

    RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_rows(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_old_rows(TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_old_rows(TEXT, INTEGER, INTEGER) TO service_role;
