/** Squelette de la liste des contacts — la page charge côté serveur. */
export default function ContactsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
