-- Morning Oracle - Supabase Database Schema (Phase 1)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create 'ideas' table
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'tomorrow', 'archived', 'processed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create 'settings' table
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    news_topics TEXT[] DEFAULT ARRAY['technology', 'world', 'ai', 'finance'],
    alarm_time TEXT DEFAULT '07:30',
    is_alarm_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings row if table is empty
INSERT INTO public.settings (news_topics, alarm_time, is_alarm_enabled)
SELECT ARRAY['technology', 'world', 'ai'], '07:30', true
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Allow anonymous public access for MVP (or adjust policies as needed)
CREATE POLICY "Allow public full access to ideas" ON public.ideas
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public full access to settings" ON public.settings
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Enable Realtime subscriptions for ideas table
ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas;
