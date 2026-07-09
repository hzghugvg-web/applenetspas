import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasOfflineActiveVpn } from "@/lib/offline-vpn-cache";

export function useHasActiveVpn() {
  return useQuery({
    queryKey: ["has-active-vpn"],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    initialData: () => hasOfflineActiveVpn(),
    queryFn: async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return hasOfflineActiveVpn();
        const { data } = await supabase
          .from("profiles")
          .select("subscription_from,subscription_until")
          .eq("id", user.id)
          .maybeSingle();
        if (!data?.subscription_until) return hasOfflineActiveVpn();
        const until = new Date(data.subscription_until).getTime();
        if (until <= Date.now()) return null;
        return {
          from: data.subscription_from,
          until: data.subscription_until,
        };
      } catch {
        return hasOfflineActiveVpn();
      }
    },
  });
}