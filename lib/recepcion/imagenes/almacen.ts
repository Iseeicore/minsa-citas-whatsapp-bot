import { almacenEnLaBase } from "@/lib/recepcion/imagenes/almacen-base-de-datos";
import { almacenHttp } from "@/lib/recepcion/imagenes/almacen-http";
import { isMediaStorageConfigured } from "@/lib/recepcion/imagenes/config";
import type { AlmacenEvidencias } from "@/lib/types/almacen-evidencias.types";

export const crearAlmacenEvidencias = (): AlmacenEvidencias => (isMediaStorageConfigured() ? almacenHttp : almacenEnLaBase);
