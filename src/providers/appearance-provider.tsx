import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import { getInitialColorMode, saveColorMode } from "@/lib/appearance";
import type { ColorMode } from "@/lib/appearance";
import { appThemes } from "@/styles/app-theme";

interface AppearanceContextValue {
  mode: ColorMode;
  toggleMode: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [mode, setMode] = useState(getInitialColorMode);
  const toggleMode = useCallback(() => {
    const nextMode = mode === "light" ? "dark" : "light";
    setMode(nextMode);
    saveColorMode(nextMode);
  }, [mode]);
  const value = useMemo(() => ({ mode, toggleMode }), [mode, toggleMode]);

  useLayoutEffect(() => {
    // Portals outside the React root share the same semantic palette.
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <AppearanceContext.Provider value={value}>
      <ConfigProvider locale={viVN} theme={appThemes[mode]}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error("useAppearance requires AppearanceProvider");
  return appearance;
}
