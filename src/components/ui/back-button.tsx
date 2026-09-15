import { ArrowLeft } from "lucide-react";
import { Button, type ButtonProps } from "./button";

type BackButtonProps = Omit<ButtonProps, "children" | "variant" | "size" | "title">;

export function BackButton({ "aria-label": label = "Quay lại", style, ...props }: BackButtonProps) {
  return (
    <Button {...props} variant="ghost" size="icon" aria-label={label}
      style={{ ...style, width: 44, height: 44, padding: 0, flexShrink: 0, justifySelf: "start", alignSelf: "flex-start" }}>
      <ArrowLeft size={20} aria-hidden="true" />
    </Button>
  );
}
