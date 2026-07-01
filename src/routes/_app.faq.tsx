import { createFileRoute } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { FaqList } from "@/components/FaqList";

export const Route = createFileRoute("/_app/faq")({ component: FaqPage });

function FaqPage() {
  return (
    <MobileShell title="FAQ">
      <FaqList />
    </MobileShell>
  );
}