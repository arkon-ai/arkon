import { IntegrationsScreen } from "@/components/mission-control/integrations";

export default function McpServersPage() {
  return (
    <IntegrationsScreen
      title="MCP servers"
      subtitle="Model Context Protocol server registry and health monitoring. Every server is health-checked, scoped per agent, and revocable."
    />
  );
}
