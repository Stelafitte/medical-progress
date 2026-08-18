import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/espace/ressources")({
  component: () => <Outlet />,
});
