
-- ai_preferences table
CREATE TABLE public.ai_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  system_prompt text DEFAULT '',
  rules jsonb DEFAULT '[]'::jsonb,
  personality text DEFAULT 'professional',
  response_style text DEFAULT 'friendly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX ai_preferences_user_id_idx ON public.ai_preferences(user_id);
CREATE POLICY "Owner can read ai_preferences" ON public.ai_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert ai_preferences" ON public.ai_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update ai_preferences" ON public.ai_preferences FOR UPDATE USING (auth.uid() = user_id);

-- api_connections table
CREATE TABLE public.api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  api_key_encrypted text NOT NULL DEFAULT '',
  model_name text DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_connections ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX api_connections_user_provider_idx ON public.api_connections(user_id, provider);
CREATE POLICY "Owner can read api_connections" ON public.api_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert api_connections" ON public.api_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update api_connections" ON public.api_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner can delete api_connections" ON public.api_connections FOR DELETE USING (auth.uid() = user_id);

-- received_cards table
CREATE TABLE public.received_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  sender_name text NOT NULL DEFAULT '',
  sender_domain text DEFAULT '',
  sender_avatar text DEFAULT '',
  sender_tagline text DEFAULT '',
  sender_site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  usage_count integer NOT NULL DEFAULT 0,
  usage_limit integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.received_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can read received_cards" ON public.received_cards FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owner can insert received_cards" ON public.received_cards FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update received_cards" ON public.received_cards FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete received_cards" ON public.received_cards FOR DELETE USING (auth.uid() = owner_id);

-- Add share_usage_limit to sites
ALTER TABLE public.sites ADD COLUMN share_usage_limit integer NOT NULL DEFAULT 10;
