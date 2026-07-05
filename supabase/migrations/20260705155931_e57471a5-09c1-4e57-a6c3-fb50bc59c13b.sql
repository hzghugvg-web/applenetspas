
UPDATE public.system_settings
  SET value = to_jsonb('https://applenetspas.vercel.app'::text)
  WHERE key = 'public_base_url';

INSERT INTO public.system_settings (key, value)
  SELECT 'public_base_url', to_jsonb('https://applenetspas.vercel.app'::text)
  WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'public_base_url');

UPDATE public.issued_configs
  SET vless_url = replace(vless_url, 'https://applenetspas.lovable.app', 'https://applenetspas.vercel.app')
  WHERE vless_url LIKE 'https://applenetspas.lovable.app/%';
