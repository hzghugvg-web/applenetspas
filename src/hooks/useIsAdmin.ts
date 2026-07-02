import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      const cached = window.sessionStorage.getItem("ns_is_admin");
      return cached === null ? undefined : cached === "1";
    },
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        if (typeof window !== "undefined") window.sessionStorage.setItem("ns_is_admin", "0");
        return false;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      const value = !!data;
      if (typeof window !== "undefined") window.sessionStorage.setItem("ns_is_admin", value ? "1" : "0");
      return value;
    },
  });
}