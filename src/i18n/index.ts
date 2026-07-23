/*
 * i18n/index.ts — 国际化核心模块
 *
 * 用法：
 *   import { t, setLanguage } from "./i18n";
 *   setLanguage("en");
 *   console.log(t("toolbar.highlight")); // "Highlight"
 *
 * 语言由设置页面的下拉框控制，变更时调用 setLanguage()，
 * 然后各模块重新渲染即可生效。
 */

import zh from "./zh";
import en from "./en";

export interface LocaleDict {
  toolbar: {
    highlight: string;
    underline: string;
    comment: string;
    commentPlaceholder: string;
    confirm: string;
    cancel: string;
  };
  panel: {
    title: string;
    filterAll: string;
    filterHighlight: string;
    filterUnderline: string;
    filterComment: string;
    sortPosition: string;
    sortHighlightFirst: string;
    sortCommentFirst: string;
    empty: string;
    exportBtn: string;
    statusExact: string;
    statusFuzzy: string;
    statusParagraph: string;
    statusLost: string;
    fileExists: string;
    fileExistsDesc: string;
    overwrite: string;
    cancel: string;
    noFileOpen: string;
    noAnnotations: string;
    exported: string;
    exportFail: string;
  };
  command: {
    togglePanel: string;
  };
  settings: {
    title: string;
    language: { name: string; desc: string };
    displayControl: string;
    colorSettings: string;
    colorDesc: string;
    colorPickTooltip: string;
    defaultColorLabel: string;
    dataStorage: string;
    dataExport: string;
    showInEditor: { name: string; desc: string };
    autoShowPanel: { name: string; desc: string };
    colorRenderMode: { name: string; desc: string };
    dataPath: { name: string; desc: string };
    cleanupCache: { name: string; desc: string };
    exportAll: { name: string; desc: string };
    clearDataBtn: string;
    startCleanupBtn: string;
    exportAllBtn: string;
    copyPathTooltip: string;
    clearDataTooltip: string;
    cleanupTooltip: string;
    deleteBtn: string;
    confirmClearTitle: string;
    confirmClearDesc: string;
    confirmClearBtn: string;
    confirmRenderModeTitle: string;
    confirmRenderModeDesc: string;
    noCacheFiles: string;
    cleanedCache: string;
    cleanedCacheSuffix: string;
    noAnnotationData: string;
    exportedAll: string;
    exportAllFail: string;
    confirm: string;
    cancel: string;
  };
  exportTemplate: {
    tag: string;
    highlights: string;
    underlines: string;
    comments: string;
    sourceDoc: string;
  };
}

const locales: Record<string, LocaleDict> = { zh, en };

let currentLang: string = "zh";

export function setLanguage(lang: string): void {
  if (locales[lang]) {
    currentLang = lang;
  }
}

export function getLanguage(): string {
  return currentLang;
}

/** 按点号路径读取本地化文本。
 *  例如 t("toolbar.highlight") → "高亮" / "Highlight"
 *  路径不存在时返回 key 本身作为 fallback。 */
export function t(key: string): string {
  const keys = key.split(".");
  let value: any = locales[currentLang];
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  return typeof value === "string" ? value : key;
}
