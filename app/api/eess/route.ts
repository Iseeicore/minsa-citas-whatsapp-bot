import { NextResponse, type NextRequest } from "next/server";
import { HttpStatus } from "@/lib/enums/http-status";
import { EESS_SEARCH_MAX_CHARS, EESS_SEARCH_MIN_CHARS } from "@/lib/constants/limits/eess";
import { searchEess } from "@/lib/integrations/minsa/eess";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const search = (params.get("search") ?? "").trim();
  const page = Number(params.get("page") ?? 1);

  if (search.length < EESS_SEARCH_MIN_CHARS || search.length > EESS_SEARCH_MAX_CHARS || !Number.isInteger(page) || page < 1) {
    return NextResponse.json({ message: "Búsqueda no válida." }, { status: HttpStatus.BAD_REQUEST });
  }

  const result = await searchEess(search, page);
  if (!result) return NextResponse.json({ message: "No pudimos consultar los establecimientos." }, { status: HttpStatus.BAD_GATEWAY });
  return NextResponse.json(result);
}
