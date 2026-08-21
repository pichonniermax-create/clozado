"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reissueDealShareAction } from "@/lib/deals/actions";

/**
 * "Renvoyer" révoque le partage existant et en crée un nouveau — le
 * nouveau jeton doit être montré UNE FOIS ici même, sinon la fonction est
 * inutilisable (rien à copier). Composant client plutôt qu'un simple
 * `<form action>` pour cette raison précise.
 */
export function ReissueShareButton({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reissue() {
    setPending(true);
    try {
      const { token: newToken } = await reissueDealShareAction(shareId);
      setToken(newToken);
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/partage/${token}`);
      setCopied(true);
    } catch {
      // Best-effort.
    }
  }

  if (token) {
    const url = `${window.location.origin}/partage/${token}`;
    return (
      <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs">
        <p className="font-medium text-amber-800">
          Nouveau lien — ne sera plus jamais réaffiché.
        </p>
        <Input readOnly value={url} className="h-7" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex gap-2">
          <Button size="sm" onClick={copy}>
            {copied ? "Copié !" : "Copier"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
            Terminé
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={reissue} disabled={pending}>
      {pending ? "…" : "Renvoyer (nouveau lien)"}
    </Button>
  );
}
