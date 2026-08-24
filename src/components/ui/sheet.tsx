"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Le panneau latéral (« sheet ») : un tiroir qui glisse depuis le bord
 * gauche par-dessus l'écran — la navigation repliée des petits écrans.
 * Construit sur le Drawer de Base UI : focus retenu, défilement de la page
 * bloqué, fermeture à Échap, au clic en dehors et d'un glissement vers le
 * bord (`swipeDirection`). Les transitions lisent les variables que le
 * Drawer pose pendant le geste (`--drawer-swipe-movement-x`,
 * `--drawer-swipe-progress`) : le panneau suit le doigt, puis termine
 * seul sa course.
 */
function Sheet({ swipeDirection = "left", ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root swipeDirection={swipeDirection} {...props} />;
}

function SheetTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className="fixed inset-0 z-50 min-h-dvh bg-foreground/30 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 ease-out supports-[-webkit-touch-callout:none]:absolute data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0"
      />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex justify-start">
        <DrawerPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            "group relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-background text-foreground shadow-lg outline-none",
            "[transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-swiping:select-none data-starting-style:[transform:translateX(-100%)] data-ending-style:[transform:translateX(-100%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*250ms)] motion-reduce:transition-none",
            className
          )}
          {...props}
        >
          <DrawerPrimitive.Content className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
            {children}
          </DrawerPrimitive.Content>
          <DrawerPrimitive.Close
            aria-label="Fermer"
            className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" />
          </DrawerPrimitive.Close>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
