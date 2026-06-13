import { ClientShell } from "@/components/mission-control/client-shell";
import { ApiKeysManager } from "@/components/mission-control/api-keys-manager";

// Client-portal surface: keys UI inside the portal chrome (ClientShell).
// The owner-facing equivalent lives at /api-keys (owner NotionShell chrome).
export default function ClientApiKeysPage() {
  return (
    <ClientShell>
      <ApiKeysManager />
    </ClientShell>
  );
}
