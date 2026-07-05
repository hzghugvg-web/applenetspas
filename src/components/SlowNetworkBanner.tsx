import { useEffect, useState } from "react";
import { WifiOff, X } from "lucide-react";
import { dismissSlowHint, subscribeSlow } from "@/lib/network-resilience";

export function SlowNetworkBanner() {
  const [slow, setSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeSlow(setSlow), []);

  function close() {
    setDismissed(true);
    dismissSlowHint();
  }

  if (!slow || dismissed) return null;
  return (
    <div className="relative z-50 mx-2 mt-2 animate-fade-in">
      <div
        className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <div className="flex-1 leading-snug">
          Медленная загрузка. Если что-то не открывается — включите VPN.
        </div>
        <button
          type="button"
          data-allow-touch="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          className="tg-press -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-amber-200/80"
          aria-label="Закрыть"
          style={{ touchAction: "manipulation" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
