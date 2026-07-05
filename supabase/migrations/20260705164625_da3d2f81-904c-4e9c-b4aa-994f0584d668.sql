CREATE OR REPLACE FUNCTION public.set_own_issued_config_vless(_config_id uuid, _vless_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _vless_url IS NULL OR _vless_url !~* '^(vless|vmess|trojan|ss)://' THEN
    RAISE EXCEPTION 'invalid_config';
  END IF;

  UPDATE public.issued_configs
    SET vless_url = _vless_url,
        sub_token = NULL
    WHERE id = _config_id
      AND user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.set_own_issued_config_vless(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_issued_config_vless(uuid, text) TO authenticated;