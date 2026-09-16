export type SimulatedNumpadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "Enter";

export const isNumpadControlTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest("[data-numpad-control]"));

const isEditableInput = (target: EventTarget): target is HTMLInputElement =>
  target instanceof HTMLInputElement && !target.disabled && !target.readOnly;

const updateInputValue = (
  input: HTMLInputElement,
  digit: Exclude<SimulatedNumpadKey, "Enter">,
  replaceValue: boolean,
): void => {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const nextValue = replaceValue
    ? digit
    : start !== null && end !== null
      ? `${input.value.slice(0, start)}${digit}${input.value.slice(end)}`
      : `${input.value}${digit}`;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  valueSetter?.call(input, nextValue);
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: digit,
      inputType: "insertText",
    }),
  );

  if (input.selectionStart !== null) {
    const caretPosition = nextValue.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }
};

export const simulateNumpadKey = (
  key: SimulatedNumpadKey,
  preferredTarget: HTMLElement | null,
  replaceInputValue = false,
  numLock = true,
): void => {
  const target = preferredTarget?.isConnected ? preferredTarget : window;
  const code = key === "Enter" ? "NumpadEnter" : `Numpad${key}`;
  const eventOptions: KeyboardEventInit = {
    key: !numLock && key !== "Enter"
      ? ({ "0": "Insert", "1": "End", "2": "ArrowDown", "3": "PageDown", "4": "ArrowLeft", "5": "Clear", "6": "ArrowRight", "7": "Home", "8": "ArrowUp", "9": "PageUp" })[key] : key,
    code,
    location: KeyboardEvent.DOM_KEY_LOCATION_NUMPAD,
    bubbles: true,
    cancelable: true,
    modifierNumLock: numLock,
  };
  const shouldContinue = target.dispatchEvent(new KeyboardEvent("keydown", eventOptions));

  if (shouldContinue && key !== "Enter" && isEditableInput(target)) {
    updateInputValue(target, key, replaceInputValue);
  }

  target.dispatchEvent(new KeyboardEvent("keyup", eventOptions));

  if (shouldContinue && key === "Enter" && target instanceof HTMLButtonElement && !target.disabled) {
    target.click();
  }
};
