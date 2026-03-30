import { NotionShell } from "@/components/mission-control/app-shell";
import { McpGateway } from "@/components/mission-control/mcp-gateway";

export default function McpGatewayPage() {
  return (
    <NotionShell>
      <McpGateway />
    </NotionShell>
  );
}
