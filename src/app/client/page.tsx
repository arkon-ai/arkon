import { ClientShell } from "@/components/mission-control/client-shell";
import { ClientDashboard } from "@/components/mission-control/client-dashboard";

export default function ClientPage() {
  return (
    <ClientShell>
      <ClientDashboard />
    </ClientShell>
  );
}
