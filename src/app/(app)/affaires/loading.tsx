/** Squelette des affaires — colonnes kanban fantômes. */
export default function DealsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="h-7 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-72 w-64 shrink-0 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
