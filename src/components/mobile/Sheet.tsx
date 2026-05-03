'use client';

/**
 * Sheet — bottom-sheet / drawer primitive built on vaul.
 *
 * Variants:
 *   - "bottom" (default mobile): drag-to-dismiss, snap-points, momentum
 *   - "right":  slide-in-from-right (desktop drawers, wizard side-panels)
 *   - "full":   full-screen overlay with no peek (KDS Rook-panel, signature fullscreen)
 *
 * Usage:
 *   <Sheet open={open} onOpenChange={setOpen} variant="bottom">
 *     <SheetContent>
 *       <SheetHeader>
 *         <SheetTitle>Filters</SheetTitle>
 *         <SheetDescription>Pas de weergave aan</SheetDescription>
 *       </SheetHeader>
 *       <div className="px-4 py-3">…body…</div>
 *       <SheetFooter>
 *         <button onClick={onApply}>Toepassen</button>
 *       </SheetFooter>
 *     </SheetContent>
 *   </Sheet>
 *
 * Honors prefers-reduced-motion (vaul defers to user preference).
 * Auto-locks body scroll while open.
 */

import * as React from 'react';
import { Drawer as Vaul } from 'vaul';

type SheetVariant = 'bottom' | 'right' | 'full';

interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: SheetVariant;
  /** Snap-points for "bottom" variant. Numbers = fraction of viewport (0..1). String = CSS height. */
  snapPoints?: Array<number | string>;
  /** If true, drag handle visible at top of bottom-sheet. Default: true for bottom, false for others. */
  showHandle?: boolean;
  /** Modal blocks pointer events outside; non-modal allows interaction with content behind */
  modal?: boolean;
  children?: React.ReactNode;
}

const SheetVariantContext = React.createContext<SheetVariant>('bottom');

export function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  variant = 'bottom',
  snapPoints,
  modal = true,
  children,
}: SheetProps) {
  const direction = variant === 'right' ? 'right' : 'bottom';
  return (
    <SheetVariantContext.Provider value={variant}>
      <Vaul.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        direction={direction}
        modal={modal}
        snapPoints={variant === 'bottom' ? snapPoints : undefined}
      >
        {children}
      </Vaul.Root>
    </SheetVariantContext.Provider>
  );
}

export const SheetTrigger = Vaul.Trigger;
export const SheetClose = Vaul.Close;

interface SheetContentProps extends React.ComponentProps<typeof Vaul.Content> {
  /** Override the variant-default showHandle behaviour. */
  showHandle?: boolean;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  function SheetContent({ className = '', style, showHandle, children, ...rest }, ref) {
    const variant = React.useContext(SheetVariantContext);
    const handleVisible = showHandle ?? variant === 'bottom';

    const variantStyle: React.CSSProperties =
      variant === 'right'
        ? {
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(420px, 92vw)',
            maxWidth: '100vw',
            background: 'var(--card, #16161a)',
            borderLeft: '1px solid var(--border, #2a2a30)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
            boxShadow: '-12px 0 40px rgba(0,0,0,0.45)',
          }
        : variant === 'full'
        ? {
            position: 'fixed',
            inset: 0,
            background: 'var(--card, #16161a)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
          }
        : {
            // bottom (default)
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '92vh',
            background: 'var(--card, #16161a)',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderTop: '1px solid var(--border, #2a2a30)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 60,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            boxShadow: '0 -12px 40px rgba(0,0,0,0.45)',
          };

    return (
      <Vaul.Portal>
        <Vaul.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 59,
          }}
        />
        <Vaul.Content
          ref={ref}
          className={className}
          style={{ ...variantStyle, ...style }}
          {...rest}
        >
          {handleVisible && (
            <Vaul.Handle
              style={{
                width: 36,
                height: 4,
                borderRadius: 9999,
                background: 'var(--muted-light, #555)',
                margin: '8px auto 4px',
                opacity: 0.5,
                flexShrink: 0,
              }}
            />
          )}
          {children}
        </Vaul.Content>
      </Vaul.Portal>
    );
  }
);

export function SheetHeader({
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '12px 20px 8px',
        borderBottom: '1px solid var(--border, #2a2a30)',
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SheetFooter({
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid var(--border, #2a2a30)',
        flexShrink: 0,
        background: 'var(--card, #16161a)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SheetTitle({
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <Vaul.Title asChild>
      <h2
        className={className}
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--text, #fafafa)',
          margin: 0,
          ...style,
        }}
        {...rest}
      >
        {children}
      </h2>
    </Vaul.Title>
  );
}

export function SheetDescription({
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Vaul.Description asChild>
      <p
        className={className}
        style={{
          fontSize: 12,
          color: 'var(--muted, #888)',
          margin: 0,
          ...style,
        }}
        {...rest}
      >
        {children}
      </p>
    </Vaul.Description>
  );
}

/** Scrollable body area inside SheetContent, between header and footer. */
export function SheetBody({
  className = '',
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '12px 20px',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
