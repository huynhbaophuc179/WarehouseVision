import { Slider as AntSlider } from "antd";

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
export const Slider = ({ value, defaultValue, onValueChange, "aria-label": label = "Điều chỉnh giá trị", ...props }: SliderProps) => (
  <AntSlider {...props} value={value?.[0]} defaultValue={defaultValue?.[0]}
    ariaLabelForHandle={label} onChange={(next) => onValueChange?.([next])} />
);
