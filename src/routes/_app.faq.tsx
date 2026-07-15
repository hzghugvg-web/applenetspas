import { createFileRoute } from "@tanstack/react-router";
import { AboutProject } from "@/components/AboutProject";

export const Route = createFileRoute("/_app/faq")({ component: FaqPage });

function FaqPage() {
  return (
    <>
      <AboutProject />
    </>
  );
}