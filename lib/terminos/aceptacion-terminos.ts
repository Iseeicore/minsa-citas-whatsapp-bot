import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/logger";
import { CANAL_ORIGEN_POR_CANAL } from "@/lib/constants/canal-origen";
import { AceptacionTerminosLookup } from "@/lib/enums/consentimiento/aceptacion-terminos-lookup";
import { AceptacionTerminosStatus } from "@/lib/enums/aceptacion-terminos-status";
import type { DocumentoAceptacion } from "@/lib/enums/consentimiento/documento-aceptacion";
import type {
  AceptacionTerminos,
  AceptacionTerminosStore,
  ConsultaAceptacionTerminos,
  DocumentoVigente,
} from "@/lib/types/aceptacion-terminos.types";

export type SaveAceptacionTerminosResult = { resultado: AceptacionTerminosStatus };

export type FindAceptacionTerminosResult = { resultado: AceptacionTerminosLookup };

type FilaAceptacion = DocumentoVigente & Pick<ConsultaAceptacionTerminos, "waId" | "flujo">;

function aceptadosEntre(
  documentos: readonly DocumentoVigente[],
  esAceptado: (documento: DocumentoVigente) => boolean,
): DocumentoAceptacion[] {
  return documentos.filter(esAceptado).map(({ documento }) => documento);
}

export function createPrismaAceptacionTerminosStore(): AceptacionTerminosStore {
  return {
    save: async ({ waId, canal, flujo, documentos }) => {
      const canalOrigenId = CANAL_ORIGEN_POR_CANAL[canal];
      await prisma.aceptacionTerminos.createMany({
        data: documentos.map(({ documento, version }) => ({ waId, canalOrigenId, flujo, documento, version })),
      });
    },
    findAceptados: async ({ waId, flujo, documentos }) => {
      const filas = await prisma.aceptacionTerminos.findMany({
        where: { waId, flujo, OR: documentos.map(({ documento, version }) => ({ documento, version })) },
        select: { documento: true },
      });
      return aceptadosEntre(documentos, ({ documento }) => filas.some((fila) => fila.documento === documento));
    },
  };
}

export function createMemoryAceptacionTerminosStore(): AceptacionTerminosStore {
  const filas: FilaAceptacion[] = [];
  return {
    save: async ({ waId, flujo, documentos }) => {
      filas.push(...documentos.map(({ documento, version }) => ({ waId, flujo, documento, version })));
    },
    findAceptados: async ({ waId, flujo, documentos }) =>
      aceptadosEntre(documentos, ({ documento, version }) =>
        filas.some((fila) => fila.waId === waId && fila.flujo === flujo && fila.documento === documento && fila.version === version),
      ),
  };
}

export async function saveAceptacionTerminos(
  aceptacion: AceptacionTerminos,
  store: AceptacionTerminosStore,
): Promise<SaveAceptacionTerminosResult> {
  try {
    await store.save(aceptacion);
    return { resultado: AceptacionTerminosStatus.SAVED };
  } catch (error) {
    logger.error("terminos.persist_failed", { canal: aceptacion.canal, flujo: aceptacion.flujo, documentos: aceptacion.documentos, error });
    return { resultado: AceptacionTerminosStatus.FAILED };
  }
}

export async function findAceptacionTerminos(
  consulta: ConsultaAceptacionTerminos,
  store: AceptacionTerminosStore,
): Promise<FindAceptacionTerminosResult> {
  try {
    const aceptados = await store.findAceptados(consulta);
    const todosAceptados = consulta.documentos.every(({ documento }) => aceptados.includes(documento));
    return { resultado: todosAceptados ? AceptacionTerminosLookup.FOUND : AceptacionTerminosLookup.NOT_FOUND };
  } catch (error) {
    logger.error("terminos.lookup_failed", { flujo: consulta.flujo, documentos: consulta.documentos, error });
    return { resultado: AceptacionTerminosLookup.FAILED };
  }
}
