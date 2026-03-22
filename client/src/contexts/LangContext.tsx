import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { en } from "@/lib/i18n/en";
import { vi } from "@/lib/i18n/vi";

type Lang = "en" | "vi";
type Translations = typeof en;

const translations: Record<Lang, Translations> = { en, vi };

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue>({
  lang: "vi", setLang: () => {}, t: vi,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem("lang") as Lang) || "vi";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
