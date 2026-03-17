import { ClientShell } from "@/components/mission-control/client-shell";
import { ClientAgents } from "@/components/mission-control/client-agents";

export default function ClientAgentsPage() {
  return (
    <ClientShell>
      <ClientAgents />
    </ClientShell>
  );
}
