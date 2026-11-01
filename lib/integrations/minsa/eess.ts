import { z } from "zod";
import type { EessItem, EessPage } from "@/lib/integrations/minsa/types";
import { getPublic } from "@/lib/integrations/minsa/wire";
import { EESS_PAGE_SIZE } from "@/lib/constants/limits/eess";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

const eessResponseSchema = z.object({
  items: z.array(
    z.object({
      cod_eess: z.coerce.string(),
      nombre: text,
      direccion: text,
      nombre_disa: text,
      distrito: text,
      provincia: text,
      departamento: text,
      horario: text,
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
    }),
  ),
  total: z.number(),
  page: z.number(),
  total_pages: z.number(),
});

export async function searchEess(search: string, page: number): Promise<EessPage | null> {
  const query = new URLSearchParams({ search, page: String(page), page_size: String(EESS_PAGE_SIZE) });

  try {
    const response = await getPublic(MinsaEndpoint.EESS, query);
    if (!response.ok) return null;
    const parsed = eessResponseSchema.safeParse(await response.json());
    if (!parsed.success) return null;

    const items: EessItem[] = parsed.data.items.map((row) => ({
      codigo: row.cod_eess,
      nombre: row.nombre,
      direccion: row.direccion,
      disa: row.nombre_disa,
      distrito: row.distrito,
      provincia: row.provincia,
      departamento: row.departamento,
      horario: row.horario,
      latitud: row.latitude ?? null,
      longitud: row.longitude ?? null,
    }));
    return { items, total: parsed.data.total, page: parsed.data.page, totalPages: parsed.data.total_pages };
  } catch {
    return null;
  }
}
