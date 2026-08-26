import { NextResponse } from "next/server";
import { getOrganizationAsset, isAssetKind } from "@/db/queries/organization-assets";

/**
 * GET /brand/<organisation>/<logo_light|logo_dark|icon>?v=<version> — une
 * image de la marque, publique par nature (un logo se voit dans chaque
 * email envoyé). L'identifiant d'organisation est un UUID : rien à
 * énumérer. Avec la version dans l'adresse, le cache est immuable ; sans
 * elle, court — l'image peut changer.
 */
export async function GET(_request: Request, context: { params: Promise<{ organizationId: string; kind: string }> }) {
  const { organizationId, kind } = await context.params;
  if (!isAssetKind(kind) || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return new NextResponse(null, { status: 404 });
  }
  const asset = await getOrganizationAsset(organizationId, kind);
  if (!asset) return new NextResponse(null, { status: 404 });
  const versioned = new URL(_request.url).searchParams.has("v");
  return new NextResponse(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "Content-Type": asset.mime,
      "Content-Length": String(asset.bytes.length),
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
