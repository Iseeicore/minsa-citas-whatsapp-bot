import { NextRequest, NextResponse } from "next/server";
import { ACTOR_OPERADOR_BANDEJA } from "@/lib/db/actor";
import { isDatabaseEnabled, persistenceDisabledResponse } from "@/lib/db/persistence";
import { toConversationDto } from "@/lib/inbox/dto";
import { closeUser, findUser } from "@/lib/inbox/repository";
import { apiError } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDatabaseEnabled()) return persistenceDisabledResponse();

  const { id } = await params;

  const usuario = await findUser(id);

  if (!usuario) {
    return apiError(ApiErrorCode.NOT_FOUND, { message: "No se encontró la conversación." });
  }

  const updated = await closeUser(id, ACTOR_OPERADOR_BANDEJA);

  return NextResponse.json(toConversationDto(updated));
}
