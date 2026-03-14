
-- Sites table
CREATE TABLE public.sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  name TEXT,
  scrape_status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Site pages table
CREATE TABLE public.site_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  markdown TEXT,
  html TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Content blocks table
CREATE TABLE public.content_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE NOT NULL,
  page_id UUID REFERENCES public.site_pages(id) ON DELETE CASCADE NOT NULL,
  heading TEXT,
  body TEXT,
  images TEXT[] DEFAULT '{}',
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  block_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

-- Public read for all tables
CREATE POLICY "Anyone can read sites" ON public.sites FOR SELECT USING (true);
CREATE POLICY "Anyone can read site_pages" ON public.site_pages FOR SELECT USING (true);
CREATE POLICY "Anyone can read content_blocks" ON public.content_blocks FOR SELECT USING (true);

-- Owner write for sites
CREATE POLICY "Owner can insert sites" ON public.sites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update sites" ON public.sites FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner can delete sites" ON public.sites FOR DELETE USING (auth.uid() = user_id);

-- Owner write for site_pages (via site ownership)
CREATE POLICY "Owner can insert site_pages" ON public.site_pages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);
CREATE POLICY "Owner can update site_pages" ON public.site_pages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);
CREATE POLICY "Owner can delete site_pages" ON public.site_pages FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);

-- Owner write for content_blocks (via site ownership)
CREATE POLICY "Owner can insert content_blocks" ON public.content_blocks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);
CREATE POLICY "Owner can update content_blocks" ON public.content_blocks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);
CREATE POLICY "Owner can delete content_blocks" ON public.content_blocks FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.sites WHERE id = site_id AND user_id = auth.uid())
);
