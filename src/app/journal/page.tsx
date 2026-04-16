import type { Metadata } from "next";
import { Journal } from "@/components/mission-control/journal";

export const metadata: Metadata = {
  title: "Journal — Arkon",
  description: "Tasks, decisions, and logs across all governed agents",
};

export default function JournalPage() {
  return <Journal />;
}
