import { ApiKeysManager } from "@/components/mission-control/api-keys-manager";

// Owner-facing API keys page — renders inside the owner app chrome (NotionShell
// from the root layout), NOT the client portal. The owner sidebar's
// "Keys & tokens" item points here. Client users keep /client/api-keys.
export default function ApiKeysPage() {
  return <ApiKeysManager />;
}
