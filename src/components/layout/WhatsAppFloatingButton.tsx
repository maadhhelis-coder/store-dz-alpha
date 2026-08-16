import WhatsAppButton from "@/components/shared/WhatsAppButton";
import { buildGenericMessage } from "@/lib/whatsapp";

export default function WhatsAppFloatingButton() {
  return (
    <WhatsAppButton
      variant="floating"
      message={buildGenericMessage()}
      ariaLabel="تواصل معنا عبر واتساب"
    />
  );
}
