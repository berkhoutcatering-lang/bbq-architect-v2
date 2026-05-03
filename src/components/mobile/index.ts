/**
 * Mobile primitives — phone-first UX building blocks.
 *
 * Use these when adding/refactoring any page for mobile-100% support.
 * Together with the `useIsMobile` hook (`@/hooks/useIsMobile`) and the
 * `BREAKPOINTS` / `MEDIA` constants (`@/lib/breakpoints`), they form the
 * foundation layer for the mobile-readiness rollout.
 */

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from './Sheet';

export {
  ResponsiveTable,
  type ResponsiveTableProps,
  type ViewMode,
} from './ResponsiveTable';

export { default as MobileSafeBottom } from './MobileSafeBottom';
export { default as StickyMobileCTA } from './StickyMobileCTA';
export { default as MobileCmdKTrigger } from './MobileCmdKTrigger';
