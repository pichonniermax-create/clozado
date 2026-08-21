/** Squelette de la fiche contact. */
export default function ContactLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-7 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-muted/60" />
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted/60" />
    </div>
  );
}
