import { Keyboard } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { simulateNumpadKey, type SimulatedNumpadKey } from "@/lib/numpad";

const numberKeys: SimulatedNumpadKey[] = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0"];

const isNumericInput = (target: HTMLElement): target is HTMLInputElement =>
  target instanceof HTMLInputElement &&
  (target.inputMode === "numeric" || target.type === "number" || target.pattern === "[0-9]*");

const preserveCurrentFocus = (event: React.PointerEvent<HTMLButtonElement>): void => {
  event.preventDefault();
};

export const FloatingNumpad = (): JSX.Element => {
  const [open, setOpen] = React.useState(false);
  const [numLock, setNumLock] = React.useState(true);
  const [lastKey, setLastKey] = React.useState<SimulatedNumpadKey | null>(null);
  const controlsRef = React.useRef<HTMLDivElement | null>(null);
  const lastTargetRef = React.useRef<HTMLElement | null>(null);
  const replaceValueRef = React.useRef(false);

  React.useEffect(() => {
    const rememberFocus = (event: FocusEvent): void => {
      if (!(event.target instanceof HTMLElement) || controlsRef.current?.contains(event.target)) {
        return;
      }
      lastTargetRef.current = event.target;
      replaceValueRef.current = isNumericInput(event.target);
    };

    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, []);

  const handleKey = (key: SimulatedNumpadKey): void => {
    simulateNumpadKey(key, lastTargetRef.current, replaceValueRef.current, numLock);
    if (key !== "Enter") {
      replaceValueRef.current = false;
    }
    setLastKey(key);
  };

  return (
    <div ref={controlsRef} data-numpad-control>
      {open ? (
        <section
          id="ban-phim-so-gia-lap"
          aria-labelledby="tieu-de-ban-phim-so"
          className="pointer-events-auto fixed bottom-24 right-4 z-[1200] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-xl sm:right-6"
        >
          <div className="mb-3">
            <h2 id="tieu-de-ban-phim-so" className="font-semibold text-content">
              Bàn phím số giả lập
            </h2>
            <Button type="button" variant="outline" aria-pressed={numLock} onPointerDown={preserveCurrentFocus}
              onClick={() => setNumLock(value => !value)}>Khóa số: {numLock ? "Bật" : "Tắt"}</Button>
          </div>

          <div className="grid grid-cols-3 gap-2" aria-label="Các phím số">
            {numberKeys.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                aria-label={`Phím số ${key}`}
                className={cn(
                  "h-12 text-lg font-semibold active:scale-[0.98]",
                  key === "0" && "col-span-2",
                )}
                onPointerDown={preserveCurrentFocus}
                onClick={() => handleKey(key)}
              >
                {key}
              </Button>
            ))}
            <Button
              type="button"
              className="h-12 active:scale-[0.98]"
              aria-label="Phím xác nhận"
              onPointerDown={preserveCurrentFocus}
              onClick={() => handleKey("Enter")}
            >
              <span aria-hidden="true" className="text-lg">↵</span>
              Xác nhận
            </Button>
          </div>

          <p className="mt-3 min-h-5 text-sm text-secondary" aria-live="polite">
            {lastKey ? `Vừa nhấn: ${lastKey === "Enter" ? "Xác nhận" : lastKey}` : "Chưa nhấn phím nào."}
          </p>
        </section>
      ) : null}

      <Button
        type="button"
        size="icon"
        aria-controls="ban-phim-so-gia-lap"
        aria-expanded={open}
        aria-label={open ? "Đóng bàn phím số giả lập" : "Mở bàn phím số giả lập"}
        title={open ? "Đóng bàn phím số giả lập" : "Mở bàn phím số giả lập"}
        className="pointer-events-auto fixed bottom-4 right-4 z-[1200] h-14 w-14 rounded-full shadow-lg active:scale-[0.98] sm:right-6"
        onPointerDown={preserveCurrentFocus}
        onClick={() => setOpen((current) => !current)}
      >
        <Keyboard className="h-6 w-6" />
      </Button>
    </div>
  );
};
