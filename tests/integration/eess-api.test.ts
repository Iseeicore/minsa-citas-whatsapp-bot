import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/eess/route";
import { searchEess } from "@/lib/integrations/minsa/eess";

vi.mock("@/lib/integrations/minsa/eess", () => ({ searchEess: vi.fn() }));

const PAGINA = { items: [], total: 0, page: 1 };

function buscar(query: string) {
  return GET(new NextRequest(`http://localhost/api/eess?${query}`));
}

describe("GET /api/eess", () => {
  beforeEach(() => {
    vi.mocked(searchEess).mockReset();
  });

  it("rejects a search that is too short or a page that is not a positive integer, without calling MINSA", async () => {
    expect((await buscar("search=a")).status).toBe(400);
    expect((await buscar("search=hospital&page=0")).status).toBe(400);
    expect((await buscar("search=hospital&page=1.5")).status).toBe(400);
    expect(searchEess).not.toHaveBeenCalled();
  });

  it("answers 502 when MINSA cannot be queried", async () => {
    vi.mocked(searchEess).mockResolvedValue(null);

    expect((await buscar("search=hospital")).status).toBe(502);
  });

  it("returns the page from MINSA, trimming the search and defaulting to page 1", async () => {
    vi.mocked(searchEess).mockResolvedValue(PAGINA as never);

    const response = await buscar("search=%20hospital%20");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(PAGINA);
    expect(searchEess).toHaveBeenCalledWith("hospital", 1);
  });
});
