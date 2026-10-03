import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listEspecialidades,
  listEstablecimientos,
  listFechas,
  listHoras,
  searchUbigeo,
} from "@/lib/integrations/minsa/catalog";
import { readNumber, readString } from "@/lib/integrations/minsa/row-readers";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

const minsaResponding = (body: unknown, status = 200) =>
  vi.fn().mockImplementation(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

describe("real MINSA — catalog pipeline", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_USE_REAL_MINSA", "true");
    vi.stubEnv("MINSA_API_HOST", "https://minsa.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("maps well-formed rows of every endpoint, with numeric codes turned into text", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding({
        data: [{ ubigeo_inei: 150101, distrito: "LIMA", provincia: "LIMA", departamento: "LIMA" }],
      }),
    );
    await expect(searchUbigeo("LIMA", "LIMA", "LIMA", "b")).resolves.toEqual({
      status: "found",
      items: [{ ubigeoInei: "150101", distrito: "LIMA", provincia: "LIMA", departamento: "LIMA" }],
    });

    vi.stubGlobal(
      "fetch",
      minsaResponding({ data: { especialidades: [{ codigo_especialidad: "02", nombre_especialidad: "MEDICINA", cantidad_cupos: 4 }] } }),
    );
    await expect(listEspecialidades("150101", "b")).resolves.toEqual({
      status: "found",
      items: [{ codigoEspecialidad: "02", nombreEspecialidad: "MEDICINA", cantidadCupos: 4 }],
    });
  });

  it("calls each endpoint with its exact path", async () => {
    const fetchMock = minsaResponding({ data: [] });
    vi.stubGlobal("fetch", fetchMock);

    await searchUbigeo("A", "B", "C", "b");
    await listHoras("1", "2", "20260920", "b");

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([`https://minsa.test${MinsaEndpoint.UBIGEO}`, `https://minsa.test${MinsaEndpoint.HORAS}`]);
    expect(MinsaEndpoint.UBIGEO).toBe("/api/v1/whatsapp/ubigeo");
    expect(MinsaEndpoint.HORAS).toBe("/whatsapp/api/v1/quotas/times");
  });

  it("discards a row missing a required field instead of forwarding 'undefined' as data", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding({
        data: [
          { distrito: "LIMA", provincia: "LIMA", departamento: "LIMA" },
          { ubigeo_inei: "150102", distrito: "ANCON", provincia: "LIMA", departamento: "LIMA" },
        ],
      }),
    );

    await expect(searchUbigeo("LIMA", "LIMA", "X", "b")).resolves.toEqual({
      status: "found",
      items: [{ ubigeoInei: "150102", distrito: "ANCON", provincia: "LIMA", departamento: "LIMA" }],
    });
  });

  it("discards rows with null, empty or non-finite values", async () => {
    vi.stubGlobal(
      "fetch",
      minsaResponding({
        data: {
          items: [
            { renipress_code: null, establishment_name: "A", quotas_online: 1 },
            { renipress_code: "6181", establishment_name: "", quotas_online: 1 },
            { renipress_code: "6181", establishment_name: "B", quotas_online: "abc" },
            { renipress_code: "6181", establishment_name: "C", quotas_online: 3 },
          ],
        },
      }),
    );

    await expect(listEstablecimientos("02", "150101", "b")).resolves.toEqual({
      status: "found",
      items: [{ renipressCode: "6181", establishmentName: "C", quotasOnline: 3 }],
    });
  });

  it("ends in 'error' when MINSA returned rows but none is valid (broken contract, not 'no availability')", async () => {
    vi.stubGlobal("fetch", minsaResponding({ data: { fechas: [{ fecha_cupo: "20260920" }, { cantidad_cupos: 2 }, "x"] } }));

    await expect(listFechas("6181", "02", "b")).resolves.toEqual({ status: "error" });
  });

  it("keeps 'empty' for a genuinely empty list or a missing list", async () => {
    vi.stubGlobal("fetch", minsaResponding({ data: { horarios: [] } }));
    await expect(listHoras("6181", "02", "20260920", "b")).resolves.toEqual({ status: "empty" });

    vi.stubGlobal("fetch", minsaResponding({ data: {} }));
    await expect(listHoras("6181", "02", "20260920", "b")).resolves.toEqual({ status: "empty" });
  });

  it("maps 401 to unauthorized, other HTTP failures, a non-array list and an unparsable body to error", async () => {
    vi.stubGlobal("fetch", minsaResponding("", 401));
    await expect(searchUbigeo("A", "B", "C", "b")).resolves.toEqual({ status: "unauthorized" });

    vi.stubGlobal("fetch", minsaResponding("", 500));
    await expect(searchUbigeo("A", "B", "C", "b")).resolves.toEqual({ status: "error" });

    vi.stubGlobal("fetch", minsaResponding({ data: "nope" }));
    await expect(searchUbigeo("A", "B", "C", "b")).resolves.toEqual({ status: "error" });

    vi.stubGlobal("fetch", minsaResponding("<html>", 200));
    await expect(searchUbigeo("A", "B", "C", "b")).resolves.toEqual({ status: "error" });
  });
});

describe("row readers", () => {
  it("readString accepts non-empty text and finite numbers only", () => {
    expect(readString({ k: "abc" }, "k")).toBe("abc");
    expect(readString({ k: 12 }, "k")).toBe("12");
    expect(readString({ k: "  " }, "k")).toBeUndefined();
    expect(readString({ k: null }, "k")).toBeUndefined();
    expect(readString({ k: Number.NaN }, "k")).toBeUndefined();
    expect(readString({}, "k")).toBeUndefined();
  });

  it("readNumber accepts finite numbers and numeric text only", () => {
    expect(readNumber({ k: 3 }, "k")).toBe(3);
    expect(readNumber({ k: "4" }, "k")).toBe(4);
    expect(readNumber({ k: "" }, "k")).toBeUndefined();
    expect(readNumber({ k: "abc" }, "k")).toBeUndefined();
    expect(readNumber({ k: Number.POSITIVE_INFINITY }, "k")).toBeUndefined();
    expect(readNumber({ k: null }, "k")).toBeUndefined();
    expect(readNumber({}, "k")).toBeUndefined();
  });
});
