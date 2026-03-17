import { ClientShell } from "@/components/mission-control/client-shell";
import { ClientCosts } from "@/components/mission-control/client-costs";

export default function ClientCostsPage() {
  return (
    <ClientShell>
      <ClientCosts />
    </ClientShell>
  );
}
