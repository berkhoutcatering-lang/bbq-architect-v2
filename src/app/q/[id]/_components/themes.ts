/* Portal themes leven nu in src/lib/portalThemes.ts zodat zowel de portal
   (deze folder) als de instellingen-pagina (theme-picker) dezelfde 8 presets
   gebruiken. Deze re-export houdt de bestaande portal-imports werkend. */
export {
  PORTAL_THEMES,
  getTheme,
  themeStyleVars,
  getThemeMode,
  type ThemeMode,
  type ThemeDef,
} from '@/lib/portalThemes';
