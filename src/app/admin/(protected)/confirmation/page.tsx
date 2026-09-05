import type { Metadata } from "next";
import ConfirmationCenter from "@/components/admin/crm/ConfirmationCenter";

export const metadata: Metadata = {
  title: "مركز التأكيد — إدارة المتجر",
  robots: { index: false, follow: false },
};

export default function ConfirmationPage() {
  return <ConfirmationCenter />;
}
