import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const WhatsAppBuyButton = () => {
  const handleWhatsAppClick = () => {
    // Convert 70-126177 to international number: +961 70 126 177 -> 96170126177
    const phoneNumber = "96170126177"; // Format: country code + number
    const message = encodeURIComponent(
      "Hi! I'd like to buy chips for the family Christmas game."
    );
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, "_blank");
  };

  return (
    <Button
      onClick={handleWhatsAppClick}
      className="bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold py-6 px-8 rounded-2xl shadow-lg flex items-center gap-3 text-lg transition-all hover:scale-105"
    >
      <MessageCircle className="w-6 h-6" />
      💬 Buy Chips on WhatsApp
    </Button>
  );
};

export default WhatsAppBuyButton;
