import type { Metadata } from "next";
import DashboardContent from "@/components/dashboard/DashboardContent";

export const metadata: Metadata = {
  title: "Dashboard | Greenhouse Monitor",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
