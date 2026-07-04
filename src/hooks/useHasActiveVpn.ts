import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useHasActiveVpn() {
  return useQuery({
    queryKey: ["has-active-vpn"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("subscription_from,subscription_until")
        .eq("id", user.id)
        .maybeSingle();
      if (!data?.subscription_until) return null;
      const until = new Date(data.subscription_until).getTime();
      if (until <= Date.now()) return null;
      return {
        from: data.subscription_from,
        until: data.subscription_until,
      };
    },
  });
}