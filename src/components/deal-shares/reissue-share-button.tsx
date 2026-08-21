"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
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
      <div className="flex w-full flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
        {/* L'avertissement porte une icône ET des mots : la couleur seule ne
            dirait pas qu'on ne pourra plus jamais réafficher ce lien. */}
        <p className="flex items-center gap-1.5 font-medium">
          <TriangleAlert className="size-3.5 shrink-0 text-warning" />
          Nouveau lien — il ne sera plus jamais réaffiché.
        </p>
        <Input
          readOnly
          value={url}
          className="h-7 bg-background font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={copy}>
            {copied ? "Copié !" : "Copier le lien"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
            Terminé
          </Button>
        </div>
      </div>
    );
  }

  return (
    // `outline` et non `ghost` : c'est l'action principale de la pile
    // « partages sans réponse » de l'écran de suivi — invisible tant qu'on
    // ne la survole pas, elle ne se donnait pas pour un bouton.
    <Button type="button" variant="outline" size="sm" onClick={reissue} disabled={pending}>
      {pending ? "…" : "Renvoyer le lien"}
    </Button>
  );
}
