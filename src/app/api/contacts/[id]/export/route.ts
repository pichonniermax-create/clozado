import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { exportContactData } from "@/db/queries/contacts";
import type { OrgScopeUser } from "@/lib/session";

/**
 * GET /api/contacts/[id]/export — l'export réglementaire complet d'une
 * fiche, en JSON téléchargeable. Authentifié et org-scopé comme le reste ;
 * l'export lui-même est tracé dans le journal des accès.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }
  const user = session.user as OrgScopeUser & { id: string };
  const { id } = await params;

  try {
    const data = await exportContactData(user, id, user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="contact-${id}.json"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
  }
}
