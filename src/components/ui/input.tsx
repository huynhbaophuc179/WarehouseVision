import * as React from "react";
import { Input as AntInput } from "antd";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <AntInput {...props} ref={(instance) => {
    const input = instance?.input ?? null;
    if (typeof ref === "function") ref(input);
    else if (ref) ref.current = input;
  }} />
));
Input.displayName = "Input";
