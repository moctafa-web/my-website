import { createFileRoute } from "@tanstack/react-router";
import ErpApp from "@/erp-app";
import { AuthProvider } from "@/auth";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AuthProvider>
      <ErpApp />
    </AuthProvider>
  );
}
