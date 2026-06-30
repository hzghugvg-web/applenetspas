import { supabase } from "@/integrations/supabase/client";
export async function bootstrapUser() {
  try { await supabase.rpc("bootstrap_user"); } catch (e) { console.warn(e); }
}
