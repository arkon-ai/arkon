import type { Metadata } from "next";
import { ProvisionHumanScreen } from "@/components/mission-control/provision-human";

export const metadata: Metadata = {
  title: "Provision human — Arkon",
  description: "Compose and submit a human provisioning manifest from the command board",
};

export default function ProvisionHumanPage() {
  return <ProvisionHumanScreen />;
}
