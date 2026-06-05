-- ═══════════════════════════════════════════════════════════════════════════════
-- AgroAid Mandi Market — Supabase Setup
-- Run this entire file in the Supabase SQL Editor (one-time setup)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Main Table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mandi_prices (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  state         TEXT NOT NULL,
  district      TEXT NOT NULL,
  market_name   TEXT NOT NULL,
  commodity     TEXT NOT NULL,
  variety       TEXT NOT NULL DEFAULT '',
  min_price     INTEGER NOT NULL DEFAULT 0,
  max_price     INTEGER NOT NULL DEFAULT 0,
  modal_price   INTEGER NOT NULL DEFAULT 0,
  arrival_date  DATE NOT NULL,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite unique constraint for upserts
  UNIQUE (state, district, market_name, commodity, variety, arrival_date)
);

-- ─── 2. Indexes (optimized for every query pattern) ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_mandi_state_district_date
  ON mandi_prices (state, district, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_mandi_market_commodity_date
  ON mandi_prices (market_name, commodity, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_mandi_commodity_state_date
  ON mandi_prices (commodity, state, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_mandi_district_commodity_date
  ON mandi_prices (district, commodity, arrival_date DESC);

CREATE INDEX IF NOT EXISTS idx_mandi_commodity_ilike
  ON mandi_prices (commodity text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_mandi_market_ilike
  ON mandi_prices (market_name text_pattern_ops);

-- ─── 3. Row Level Security (public read, no write from anon) ─────────────────

ALTER TABLE mandi_prices ENABLE ROW LEVEL SECURITY;

-- Allow public (anon key) to read
DROP POLICY IF EXISTS "Public read access" ON mandi_prices;
CREATE POLICY "Public read access"
  ON mandi_prices FOR SELECT
  USING (true);

-- Only service_role can insert/update/delete (used by Firebase sync)
-- (service_role bypasses RLS by default, so no explicit policy needed)


-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS — called from the frontend via supabase.rpc()
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Get distinct states ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_states()
RETURNS TABLE(state TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT mp.state
  FROM mandi_prices mp
  ORDER BY mp.state;
$$;

-- ─── 2. Get districts for a state ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_districts(p_state TEXT)
RETURNS TABLE(district TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT mp.district
  FROM mandi_prices mp
  WHERE mp.state = p_state
  ORDER BY mp.district;
$$;

-- ─── 3. Get markets for a district ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_markets(p_state TEXT, p_district TEXT)
RETURNS TABLE(market_name TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT mp.market_name
  FROM mandi_prices mp
  WHERE mp.state = p_state
    AND mp.district = p_district
  ORDER BY mp.market_name;
$$;

-- ─── 4. Latest prices (one row per commodity, most recent) ───────────────────

CREATE OR REPLACE FUNCTION get_latest_prices(
  p_state TEXT,
  p_district TEXT,
  p_market TEXT DEFAULT NULL
)
RETURNS TABLE(
  state TEXT,
  district TEXT,
  market_name TEXT,
  commodity TEXT,
  variety TEXT,
  min_price INTEGER,
  max_price INTEGER,
  modal_price INTEGER,
  arrival_date DATE
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (mp.commodity)
    mp.state,
    mp.district,
    mp.market_name,
    mp.commodity,
    mp.variety,
    mp.min_price,
    mp.max_price,
    mp.modal_price,
    mp.arrival_date
  FROM mandi_prices mp
  WHERE mp.state = p_state
    AND mp.district = p_district
    AND (p_market IS NULL OR mp.market_name = p_market)
  ORDER BY mp.commodity, mp.arrival_date DESC, mp.modal_price DESC;
$$;

-- ─── 5. Variety-wise breakdown for a specific commodity + market ─────────────

CREATE OR REPLACE FUNCTION get_commodity_varieties(
  p_state TEXT,
  p_district TEXT,
  p_market TEXT,
  p_commodity TEXT
)
RETURNS TABLE(
  variety TEXT,
  min_price INTEGER,
  max_price INTEGER,
  modal_price INTEGER,
  arrival_date DATE
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (mp.variety)
    mp.variety,
    mp.min_price,
    mp.max_price,
    mp.modal_price,
    mp.arrival_date
  FROM mandi_prices mp
  WHERE mp.state = p_state
    AND mp.district = p_district
    AND mp.market_name = p_market
    AND UPPER(mp.commodity) = UPPER(p_commodity)
  ORDER BY mp.variety, mp.arrival_date DESC;
$$;

-- ─── 6. Price history (daily averages over N days) ───────────────────────────

CREATE OR REPLACE FUNCTION get_price_history(
  p_commodity TEXT,
  p_state TEXT,
  p_district TEXT,
  p_market TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE(
  arrival_date DATE,
  avg_modal INTEGER,
  avg_min INTEGER,
  avg_max INTEGER
)
LANGUAGE sql STABLE
AS $$
  SELECT
    mp.arrival_date,
    ROUND(AVG(mp.modal_price))::INTEGER AS avg_modal,
    ROUND(AVG(mp.min_price))::INTEGER AS avg_min,
    ROUND(AVG(mp.max_price))::INTEGER AS avg_max
  FROM mandi_prices mp
  WHERE UPPER(mp.commodity) = UPPER(p_commodity)
    AND mp.state = p_state
    AND mp.district = p_district
    AND (p_market IS NULL OR mp.market_name = p_market)
    AND mp.arrival_date >= CURRENT_DATE - p_days
  GROUP BY mp.arrival_date
  HAVING AVG(mp.modal_price) > 0
  ORDER BY mp.arrival_date;
$$;

-- ─── 7. Nearby markets (same commodity, same district, different market) ─────

DROP FUNCTION IF EXISTS get_nearby_markets(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_nearby_markets(
  p_state TEXT,
  p_district TEXT,
  p_commodity TEXT,
  p_exclude_market TEXT DEFAULT NULL
)
RETURNS TABLE(
  market_name TEXT,
  district TEXT,
  modal_price INTEGER,
  min_price INTEGER,
  max_price INTEGER,
  arrival_date DATE
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (mp.market_name)
    mp.market_name,
    mp.district,
    mp.modal_price,
    mp.min_price,
    mp.max_price,
    mp.arrival_date
  FROM mandi_prices mp
  WHERE mp.state = p_state
    AND mp.district = p_district
    AND UPPER(mp.commodity) = UPPER(p_commodity)
    AND (p_exclude_market IS NULL OR mp.market_name != p_exclude_market)
  ORDER BY mp.market_name, mp.arrival_date DESC;
$$;

-- ─── 8. Search commodities / markets ───────────────────────────────────

DROP FUNCTION IF EXISTS search_mandi(TEXT);

CREATE OR REPLACE FUNCTION search_mandi(
  p_query TEXT,
  p_search_type TEXT DEFAULT 'commodity',  -- 'commodity' | 'market'
  p_state TEXT DEFAULT NULL,
  p_district TEXT DEFAULT NULL,
  p_market TEXT DEFAULT NULL
)
RETURNS TABLE(
  state TEXT,
  district TEXT,
  market_name TEXT,
  commodity TEXT,
  variety TEXT,
  min_price INTEGER,
  max_price INTEGER,
  modal_price INTEGER,
  arrival_date DATE
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (mp.commodity, mp.market_name)
    mp.state,
    mp.district,
    mp.market_name,
    mp.commodity,
    mp.variety,
    mp.min_price,
    mp.max_price,
    mp.modal_price,
    mp.arrival_date
  FROM mandi_prices mp
  WHERE (
    CASE
      WHEN p_search_type = 'market'    THEN mp.market_name ILIKE '%' || p_query || '%'
      WHEN p_search_type = 'commodity' THEN mp.commodity    ILIKE '%' || p_query || '%'
      ELSE mp.commodity ILIKE '%' || p_query || '%'
           OR mp.market_name ILIKE '%' || p_query || '%'
    END
  )
  AND (p_state IS NULL OR mp.state = p_state)
  AND (p_district IS NULL OR mp.district = p_district)
  AND (p_market IS NULL OR mp.market_name = p_market)
  AND mp.arrival_date >= CURRENT_DATE - INTERVAL '30 days'
  ORDER BY mp.commodity, mp.market_name, mp.arrival_date DESC
  LIMIT 50;
$$;
