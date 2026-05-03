-- 0006_refresh_sites_helpers.sql
--
-- RPC used by the `refresh-sites` Edge Function (cron path) to pick the
-- next batch of stale verified sites. PostgREST can't express the
-- `(refresh_interval_hours || ' hours')::interval` comparison cleanly,
-- so we expose a SECURITY DEFINER function and grant it only to the
-- service role — anon/authenticated callers cannot invoke it.
--
-- Returns at most `batch_size` rows, oldest-scraped first, skipping any
-- site that is already mid-scrape.

CREATE OR REPLACE FUNCTION public.find_stale_sites(batch_size INTEGER DEFAULT 5)
RETURNS TABLE (
    id UUID,
    domain TEXT,
    user_id UUID,
    verification_token TEXT,
    verification_method TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT s.id, s.domain, s.user_id, s.verification_token, s.verification_method
    FROM public.sites s
    WHERE s.verified = TRUE
      AND s.scrape_status <> 'scraping'
      AND (
          s.last_scraped_at IS NULL
          OR s.last_scraped_at < NOW() - (s.refresh_interval_hours || ' hours')::INTERVAL
      )
    ORDER BY s.last_scraped_at ASC NULLS FIRST
    LIMIT GREATEST(COALESCE(batch_size, 5), 1);
$$;

REVOKE ALL ON FUNCTION public.find_stale_sites(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_stale_sites(INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_stale_sites(INTEGER) TO service_role;
