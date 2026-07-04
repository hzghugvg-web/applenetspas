import { createFileRoute } from "@tanstack/react-router";
import { FaqList } from "@/components/FaqList";

export const Route = createFileRoute("/_app/faq")({ component: FaqPage });

function FaqPage() {
  return (
    <>
      <FaqList />
    </>
  );
}