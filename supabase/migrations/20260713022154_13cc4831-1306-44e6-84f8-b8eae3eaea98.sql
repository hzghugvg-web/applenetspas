GRANT EXECUTE ON FUNCTION public.create_telegram_login_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_telegram_login_code(text, text) TO anon, authenticated;