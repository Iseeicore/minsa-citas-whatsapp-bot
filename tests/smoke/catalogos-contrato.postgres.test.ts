import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { CanalOrigenId } from "@/lib/enums/canal-origen-id";
import { CategoriaIncidenciaId } from "@/lib/enums/categoria-incidencia-id";
import { DireccionMensajeId } from "@/lib/enums/direccion-mensaje-id";
import { EstadoArchivoId } from "@/lib/enums/estado-archivo-id";
import { EstadoConversacionId } from "@/lib/enums/estado-conversacion-id";
import { EstadoIncidenciaId } from "@/lib/enums/estado-incidencia-id";
import { EstadoMensajeId } from "@/lib/enums/estado-mensaje-id";
import { TipoEvidenciaId } from "@/lib/enums/tipo-evidencia-id";
import { TipoMensajeId } from "@/lib/enums/tipo-mensaje-id";

type Fila = { id: number; codigo: string };

/** Un enum numérico de TypeScript trae también el mapeo inverso (valor → nombre): se queda solo con nombre → id. */
const comoMapa = (enumeracion: Record<string, string | number>): Record<string, number> =>
  Object.fromEntries(Object.entries(enumeracion).filter(([, valor]) => typeof valor === "number")) as Record<string, number>;

const contratos: Array<{ catalogo: string; enumeracion: Record<string, string | number>; filas: () => Promise<Fila[]> }> = [
  { catalogo: "categoria_incidencia", enumeracion: CategoriaIncidenciaId, filas: () => prisma.categoriaIncidencia.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "estado_incidencia", enumeracion: EstadoIncidenciaId, filas: () => prisma.estadoIncidencia.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "estado_archivo", enumeracion: EstadoArchivoId, filas: () => prisma.estadoArchivo.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "canal_origen", enumeracion: CanalOrigenId, filas: () => prisma.canalOrigen.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "tipo_evidencia", enumeracion: TipoEvidenciaId, filas: () => prisma.tipoEvidencia.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "direccion_mensaje", enumeracion: DireccionMensajeId, filas: () => prisma.direccionMensaje.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "estado_mensaje", enumeracion: EstadoMensajeId, filas: () => prisma.estadoMensaje.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "tipo_mensaje", enumeracion: TipoMensajeId, filas: () => prisma.tipoMensaje.findMany({ select: { id: true, codigo: true } }) },
  { catalogo: "estado_conversacion", enumeracion: EstadoConversacionId, filas: () => prisma.estadoConversacion.findMany({ select: { id: true, codigo: true } }) },
];

describe.skipIf(!process.env.DATABASE_URL)("contract between the code enums (lib/enums) and the catalog tables", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(contratos)("$catalogo: every enum member matches the database row with the same code, and no row is missing from the enum", async ({ enumeracion, filas }) => {
    const enBase = Object.fromEntries((await filas()).map((fila) => [fila.codigo, fila.id]));

    expect(comoMapa(enumeracion)).toEqual(enBase);
  });
});
