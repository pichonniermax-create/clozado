import { NextResponse } from "next/server";
import { exportContactData } from "@/db/queries/contacts";
import { apiErrorResponse } from "@/lib/api-route";
import { requireApiUser } from "@/lib/session";

/**
 * GET /api/contacts/[id]/export — l'export réglementaire complet d'une
 * fiche, en JSON téléchargeable. Authentifié et org-scopé comme le reste
 * (`requireApiUser` : la substitution du super admin comprise) ; l'export
 * lui-même est tracé dans le journal des accès. Une fiche introuvable ou
 * d'une autre organisation répond ce que la requête dit (404, 403) ; une
 * panne technique est journalisée et répond 500 — plus jamais déguisée en
 * « fiche introuvable » (audit, constat Q5).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireApiUser();
    const data = await exportContactData(user, id, user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="contact-${id}.json"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err, { route: "api/contacts/[id]/export" });
  }
}
