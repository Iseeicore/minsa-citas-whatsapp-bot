import { prisma } from "@/lib/db/prisma";

export async function cerrarOperacionesInterrumpidas(antiguedadMs: number, lote: number): Promise<number> {
  const filas = await prisma.$queryRaw<{ cerradas: number }[]>`
    SELECT auditoria.cerrar_operaciones_interrumpidas(${antiguedadMs}::integer * interval '1 millisecond', ${lote}::integer) AS cerradas`;
  return Number(filas[0]?.cerradas ?? 0);
}
