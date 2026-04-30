/**
 * Floating WhatsApp contact bubble — fixed bottom-right.
 *
 * Phone number is a placeholder. Replace `WHATSAPP_PHONE_E164` with the
 * real G-Berg WhatsApp Business number once it's provisioned. The string
 * is digits only, no `+`, no spaces — wa.me requires E.164 in this form.
 */
const WHATSAPP_PHONE_E164 = '4930123456789';
const WHATSAPP_DEFAULT_MESSAGE =
  "Hi G-Berg — I'd like help picking the right radiator.";

export function WhatsAppBubble() {
  const href = `https://wa.me/${WHATSAPP_PHONE_E164}?text=${encodeURIComponent(
    WHATSAPP_DEFAULT_MESSAGE,
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with G-Berg on WhatsApp"
      className="fixed bottom-5 right-5 z-[60] flex h-14 w-14 items-center justify-center rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out hover:scale-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#25D366] md:bottom-6 md:right-6 md:h-16 md:w-16"
      style={{backgroundColor: '#25D366'}}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        focusable="false"
        className="h-7 w-7 md:h-8 md:w-8"
        fill="white"
      >
        <path d="M12.04 2.003c-5.523 0-9.998 4.475-9.998 9.998 0 1.762.46 3.486 1.336 5.005L2 22l5.13-1.345a9.96 9.96 0 0 0 4.91 1.252h.004c5.522 0 9.997-4.475 9.997-9.998 0-2.671-1.04-5.182-2.929-7.071a9.945 9.945 0 0 0-7.072-2.835zm0 18.196h-.004a8.18 8.18 0 0 1-4.166-1.142l-.299-.177-3.044.798.812-2.967-.195-.305a8.197 8.197 0 0 1-1.252-4.405c0-4.531 3.687-8.218 8.215-8.218a8.16 8.16 0 0 1 5.81 2.408 8.18 8.18 0 0 1 2.408 5.812c0 4.531-3.687 8.196-8.285 8.196zm4.49-6.137c-.246-.123-1.456-.717-1.682-.799-.226-.082-.39-.123-.554.123-.164.246-.635.799-.778.962-.143.164-.287.184-.532.061-.246-.123-1.038-.382-1.978-1.219-.731-.652-1.225-1.457-1.368-1.703-.143-.246-.015-.379.108-.502.111-.111.246-.287.369-.43.123-.143.164-.246.246-.41.082-.164.041-.307-.02-.43-.061-.123-.554-1.336-.759-1.83-.2-.481-.404-.416-.554-.424l-.471-.008a.91.91 0 0 0-.656.307c-.226.246-.86.84-.86 2.05 0 1.211.881 2.382 1.004 2.546.123.164 1.736 2.65 4.205 3.715.587.253 1.044.404 1.4.518.588.187 1.123.16 1.547.097.472-.07 1.456-.595 1.661-1.171.205-.575.205-1.069.143-1.171-.061-.103-.225-.164-.471-.287z" />
      </svg>
    </a>
  );
}
