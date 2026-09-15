import { theme } from "antd";
import type { ThemeConfig } from "antd";
import type { ColorMode } from "@/lib/appearance";

export const appTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#0958d9",
    colorBgLayout: "#f5f5f5",
    colorText: "#1f1f1f",
    colorTextPlaceholder: "#667085",
    fontFamily: "var(--font-sans)",
    borderRadius: 6,
    controlHeight: 40,
  },
  components: { Button: { fontWeight: 600 } },
};

export const appThemes: Record<ColorMode, ThemeConfig> = {
  light: appTheme,
  dark: {
    algorithm: theme.darkAlgorithm,
    components: appTheme.components,
    token: {
      ...appTheme.token,
      colorPrimary: "#1677ff",
      colorBgLayout: "#111316",
      colorBgContainer: "#1b1d21",
      colorBgElevated: "#1b1d21",
      colorText: "#f0f0f0",
      colorTextSecondary: "#b6bdc8",
      colorTextPlaceholder: "#9aa4b2",
      colorBorder: "#3b414a",
      colorBorderSecondary: "#2c3139",
    },
  },
};
