
-- Enum роли
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Профили
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  cooldown_until TIMESTAMPTZ,
  subscription_until TIMESTAMPTZ,
  device_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Роли
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- Направления (страны/локации)
CREATE TABLE public.directions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  flag TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.directions TO authenticated;
GRANT ALL ON public.directions TO service_role;
ALTER TABLE public.directions ENABLE ROW LEVEL SECURITY;

-- VLESS-ссылки
CREATE TABLE public.vless_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id UUID NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vless_links TO authenticated;
GRANT ALL ON public.vless_links TO service_role;
ALTER TABLE public.vless_links ENABLE ROW LEVEL SECURITY;

-- История выдач
CREATE TABLE public.issued_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction_id UUID REFERENCES public.directions(id) ON DELETE SET NULL,
  vless_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.issued_configs TO authenticated;
GRANT ALL ON public.issued_configs TO service_role;
ALTER TABLE public.issued_configs ENABLE ROW LEVEL SECURITY;

-- Системные настройки
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ============ ПОЛИТИКИ ============

-- profiles: пользователь видит/правит свой, админ — все
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin(auth.uid()));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- user_roles: смотреть свои; админ — всё
CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- directions/vless_links: читают все авторизованные; пишут только админы
CREATE POLICY "auth read directions" ON public.directions FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write directions" ON public.directions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "auth read vless" ON public.vless_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write vless" ON public.vless_links FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- issued_configs: свои читать/писать; админ — всё
CREATE POLICY "own issued select" ON public.issued_configs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "own issued insert" ON public.issued_configs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- system_settings: читают авторизованные; пишут админы
CREATE POLICY "auth read settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write settings" ON public.system_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Функция: получить и пометить случайную ссылку, создать запись о выдаче и обновить кулдаун
CREATE OR REPLACE FUNCTION public.issue_vpn_config(_direction_id UUID)
RETURNS TABLE(vless_url TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _link TEXT;
  _profile RECORD;
  _cooldown_hours INT := 144;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF _profile.is_blocked THEN RAISE EXCEPTION 'blocked'; END IF;
  IF _profile.cooldown_until IS NOT NULL AND _profile.cooldown_until > now() THEN
    RAISE EXCEPTION 'cooldown';
  END IF;

  SELECT url INTO _link FROM public.vless_links
    WHERE direction_id = _direction_id AND is_active = true
    ORDER BY random() LIMIT 1;
  IF _link IS NULL THEN RAISE EXCEPTION 'no_links'; END IF;

  -- добавить тег #NetSpas
  _link := regexp_replace(_link, '#.*$', '') || '#NetSpas';

  INSERT INTO public.issued_configs (user_id, direction_id, vless_url)
    VALUES (_uid, _direction_id, _link);

  UPDATE public.profiles
    SET cooldown_until = now() + (_cooldown_hours || ' hours')::interval,
        subscription_until = COALESCE(GREATEST(subscription_until, now()), now()) + interval '30 days',
        updated_at = now()
    WHERE id = _uid;

  RETURN QUERY SELECT _link;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_vpn_config(UUID) TO authenticated;

-- Функция: создать профиль и при необходимости назначить админа при первом входе
CREATE OR REPLACE FUNCTION public.bootstrap_user()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
  _admin_count INT;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  INSERT INTO public.profiles (id, email) VALUES (_uid, _email)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'user')
    ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO _admin_count FROM public.user_roles WHERE role = 'admin';
  IF _admin_count = 0 OR _email IN ('halifbargisev@gmail.com', 'support@support.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
      ON CONFLICT DO NOTHING;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.bootstrap_user() TO authenticated;

-- Админ-функции
CREATE OR REPLACE FUNCTION public.admin_reset_cooldown(_target UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET cooldown_until = NULL WHERE id = _target;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reset_cooldown(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_toggle_block(_target UUID, _block BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET is_blocked = _block WHERE id = _target;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_toggle_block(UUID, BOOLEAN) TO authenticated;
