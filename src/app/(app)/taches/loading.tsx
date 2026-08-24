/** Squelette de l'écran des tâches — la génération et la liste chargent côté serveur. */
export default function TasksLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-44 animate-pulse rounded-xl bg-muted" />
      <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
