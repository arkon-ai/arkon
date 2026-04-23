import type { Metadata } from "next";
import { FleetScreen } from "@/components/mission-control/fleet";

export const metadata: Metadata = {
  title: "Fleet — Arkon",
  description: "Real-time status of Warden's four-agent orchestration layer",
};

export default function FleetPage() {
  return <FleetScreen />;
}
