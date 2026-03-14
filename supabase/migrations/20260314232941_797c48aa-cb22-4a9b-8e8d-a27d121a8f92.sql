
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text DEFAULT '',
  tagline text DEFAULT '',
  bio text DEFAULT '',
  avatar_url text DEFAULT '',
  calendly_url text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
