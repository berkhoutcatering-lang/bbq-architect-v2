/**
 * Gedeelde icoon-resolver voor AI-blocks.
 *
 * De AI kiest per block een icoon-naam. Vroeger deden NavCardBlock en
 * BulletsBlock daarvoor `import * as Icons from 'lucide-react'` — dat sleept
 * alle 1.171 iconen (501 KB) mee in de gedeelde bundel op élke pagina, omdat
 * beide blocks in het altijd-geladen pad zitten (AppShell → ChatPanel →
 * BlockRenderer).
 *
 * In plaats daarvan staat hier een vaste lijst met de iconen die de app zelf
 * ook gebruikt. Alleen die worden gebundeld. Dezelfde lijst wordt via
 * AI_ICON_NAMES in de prompt aan de AI gegeven (zie lib/ai/page-contracts.ts),
 * zodat hij niets kan kiezen wat we niet kennen.
 *
 * Nieuw icoon nodig? Hier importeren en aan ICONS toevoegen — de prompt volgt
 * dan automatisch.
 */
import {
    Activity, AlertCircle, AlertTriangle, Archive, ArrowRight, ArrowUpRight,
    BarChart3, BookOpen, Boxes, Building2, Calculator, Calendar, Camera, Car,
    Check, CheckCircle2, ChefHat, ClipboardList, Clock, Euro, ExternalLink,
    Eye, FileText, Flame, Globe, Hammer, HelpCircle, Image, Inbox, Info,
    Layers, Leaf, Lock, Mail, MapPin, Package, Palette, PartyPopper, Phone,
    Receipt, RefreshCw, ScanLine, Search, Send, Settings, ShieldCheck,
    ShoppingCart, Sparkles, Star, Store, Thermometer, TrendingDown, TrendingUp,
    Truck, User, Users, UtensilsCrossed, Zap,
} from 'lucide-react';

export const ICONS = {
    Activity, AlertCircle, AlertTriangle, Archive, ArrowRight, ArrowUpRight,
    BarChart3, BookOpen, Boxes, Building2, Calculator, Calendar, Camera, Car,
    Check, CheckCircle2, ChefHat, ClipboardList, Clock, Euro, ExternalLink,
    Eye, FileText, Flame, Globe, Hammer, HelpCircle, Image, Inbox, Info,
    Layers, Leaf, Lock, Mail, MapPin, Package, Palette, PartyPopper, Phone,
    Receipt, RefreshCw, ScanLine, Search, Send, Settings, ShieldCheck,
    ShoppingCart, Sparkles, Star, Store, Thermometer, TrendingDown, TrendingUp,
    Truck, User, Users, UtensilsCrossed, Zap,
} as const;

export type AiIconName = keyof typeof ICONS;

/** Namen die de AI mag gebruiken — gaat één-op-één mee in de prompt. */
export const AI_ICON_NAMES = Object.keys(ICONS) as AiIconName[];

/**
 * Zoekt een icoon op naam. `fallback` bepaalt wat er gebeurt bij een onbekende
 * of ontbrekende naam: NavCardBlock valt terug op ArrowRight (de kaart moet
 * altijd een icoon tonen), BulletsBlock op null (dan wordt het een bolletje).
 */
export function resolveIcon(name: string | undefined, fallback: typeof ArrowRight): typeof ArrowRight;
export function resolveIcon(name: string | undefined, fallback: null): typeof ArrowRight | null;
export function resolveIcon(
    name: string | undefined,
    fallback: typeof ArrowRight | null
): typeof ArrowRight | null {
    if (!name) return fallback;
    return ICONS[name as AiIconName] ?? fallback;
}
