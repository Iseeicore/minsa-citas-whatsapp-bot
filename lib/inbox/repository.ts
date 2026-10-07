import { prisma } from "@/lib/db/prisma";
import { declararActor } from "@/lib/db/actor";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { EstadoConversacionId } from "@/lib/enums/estado-conversacion-id";
import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

export function listUsers() {
  return prisma.usuario.findMany({ where: { activo: true }, orderBy: { ultimoMensajeEn: "desc" } });
}

export function findUser(id: string) {
  return prisma.usuario.findUnique({ where: { id } });
}

export function findUserState(id: string) {
  return prisma.usuario.findUnique({ where: { id }, select: { estadoConversacionId: true } });
}

export function listMessages(usuarioId: string) {
  return prisma.mensaje.findMany({ where: { usuarioId }, orderBy: { fechaHora: "asc" } });
}

export function findLastInbound(usuarioId: string) {
  return prisma.mensaje.findFirst({
    where: { usuarioId, direccionMensajeId: DireccionMensajeId.ENTRANTE },
    orderBy: { fechaHora: "desc" },
  });
}

export async function closeUser(id: string, actor: string) {
  const [, usuario] = await prisma.$transaction([
    declararActor(actor),
    prisma.usuario.update({ where: { id }, data: { estadoConversacionId: EstadoConversacionId.CERRADA } }),
  ]);
  return usuario;
}

/** Guarda un mensaje saliente de texto y avanza la fecha del último mensaje del usuario, firmado por `actor`. */
export async function recordOutboundMessage(usuarioId: string, text: string, waMessageId: string | null, actor: string) {
  const now = new Date();
  const [, mensaje] = await prisma.$transaction([
    declararActor(actor),
    prisma.mensaje.create({
      data: {
        usuarioId,
        direccionMensajeId: DireccionMensajeId.SALIENTE,
        tipoMensajeId: TipoMensajeId.TEXTO,
        contenido: text,
        waMessageId,
        estadoMensajeId: EstadoMensajeId.ENVIADO,
        fechaHora: now,
      },
    }),
    prisma.usuario.update({ where: { id: usuarioId }, data: { ultimoMensajeEn: now } }),
  ]);
  return mensaje;
}
