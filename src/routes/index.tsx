import { createFileRoute } from "@tanstack/react-router";
import ErpApp from "@/erp-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ErpApp />;
}
