// Política «otra persona» (EN-OPS-10 y TA-172 del harness): la PR del harness la aprueba una persona distinta de quien
// lo lanzó. El script corre contra el GitHub de mentira, en una carpeta con la política en .diverger/settings.json.
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { arrancar, REPO, type Datos } from "./github-falso.js";

const RAIZ = join(import.meta.dirname, "..", "..");
const SCRIPT = join(RAIZ, "scripts", "aprobacion.mjs");
const MENSAJE = "La aprobación tiene que ser de una persona distinta de quien lanzó el harness";

type Revision = { user: { login: string; type?: string }; state: string; commit_id?: string; author_association?: string };
const CABEZA = "c0ffee";
const HARNESS = { login: "diverger-harness[bot]", type: "Bot" };

function commitDelHarness(quien: string) {
  return { commit: { message: `feat: TA-004 Prestar un equipo\n\nDiverger-Rol: Desarrollador\nDiverger-Iniciado-por: ${quien}` } };
}

let servidor: Server | undefined;
let carpeta = "";

afterEach(() => {
  servidor?.close();
  servidor = undefined;
  if (carpeta) rmSync(carpeta, { recursive: true, force: true });
});

async function comprobar(politica: string | undefined, revisiones: Revision[],
  commits = [commitDelHarness("ana-lopez")], extra: { commits?: number; user?: { login: string; type?: string } } = {},
): Promise<{ codigo: number; salida: string }> {
  carpeta = mkdtempSync(join(tmpdir(), "aprobacion-"));
  if (politica !== undefined) {
    mkdirSync(join(carpeta, ".diverger"));
    writeFileSync(join(carpeta, ".diverger", "settings.json"), JSON.stringify({ approvalPolicy: politica }));
  }
  const datos: Datos = { ejecuciones: [], usuarios: {}, prs: { 55: {
    body: "", user: HARNESS, head: { sha: CABEZA }, commits: commits.length, listaDeCommits: commits, reviews: revisiones,
    ...extra } } };
  const api = await arrancar(datos);
  servidor = api.servidor;
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT], {
      cwd: carpeta,
      env: { ...process.env, GITHUB_API_URL: api.url, GITHUB_REPOSITORY: REPO, GH_TOKEN: "token-de-prueba", PR_NUMERO: "55" },
    });
    return { codigo: 0, salida: stdout };
  } catch (error) {
    const fallo = error as { code: number; stderr: string };
    return { codigo: fallo.code, salida: fallo.stderr };
  }
}

const aprueba = (login: string, state = "APPROVED", otros: Partial<Revision> = {}): Revision =>
  ({ user: { login }, state, commit_id: CABEZA, author_association: "COLLABORATOR", ...otros });

describe("política «otra persona» (EN-OPS-10 del harness)", () => {
  it("criterio positivo: lanzada por ana-lopez y aprobada por luis-gil, pasa", async () => {
    const r = await comprobar("otra-persona", [aprueba("luis-gil")]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain("Aprobada por @luis-gil, distinta de quien lanzó el harness (@ana-lopez)");
  });

  it("criterio negativo: aprobada solo por la propia ana-lopez, falla con el mensaje del criterio", async () => {
    const r = await comprobar("otra-persona", [aprueba("ana-lopez")]);
    expect(r.codigo).toBe(1);
    expect(r.salida).toContain(`::error::${MENSAJE}`);
  });

  it("sin ninguna aprobación también falla", async () => {
    expect((await comprobar("otra-persona", [])).codigo).toBe(1);
  });

  it("vale la última revisión de cada persona, y los comentarios no la cambian", async () => {
    // luis-gil aprueba y después pide cambios: ya no cuenta. marta-ruiz aprueba y después solo comenta: sigue contando.
    expect((await comprobar("otra-persona", [aprueba("luis-gil"), aprueba("luis-gil", "CHANGES_REQUESTED")])).codigo)
      .toBe(1);
    expect((await comprobar("otra-persona", [aprueba("marta-ruiz"), aprueba("marta-ruiz", "COMMENTED")])).codigo).toBe(0);
    expect((await comprobar("otra-persona", [aprueba("luis-gil"), aprueba("luis-gil", "DISMISSED")])).codigo).toBe(1);
  });

  it("la aprobación de una GitHub App no cuenta, y quien lanzó se compara sin mayúsculas", async () => {
    expect((await comprobar("otra-persona", [aprueba("diverger-harness[bot]")])).codigo).toBe(1);
    expect((await comprobar("otra-persona", [{ ...aprueba("renovate"), user: { login: "renovate", type: "Bot" } }])).codigo)
      .toBe(1);
    expect((await comprobar("otra-persona", [aprueba("Ana-Lopez")])).codigo).toBe(1);
  });

  it("con otra política, o en una PR sin commits del harness, no hay nada que comprobar", async () => {
    for (const politica of ["automatica", "quien-lanza", undefined]) {
      const r = await comprobar(politica, [aprueba("ana-lopez")]);
      expect(r.codigo, String(politica)).toBe(0);
      expect(r.salida).toContain("no hay nada que comprobar");
    }
    const sinHarness = await comprobar("otra-persona", [], [{ commit: { message: "fix: un arreglo de una persona" } }],
      { user: { login: "luis-gil" } });
    expect(sinHarness.codigo).toBe(0);
    expect(sinHarness.salida).toContain("La PR no tiene commits del harness");
  });

  it("solo cuenta una aprobación del último commit y de alguien con acceso al repositorio (revisión de seguridad)", async () => {
    expect((await comprobar("otra-persona", [aprueba("luis-gil", "APPROVED", { commit_id: "viejo" })])).codigo).toBe(1);
    for (const asociacion of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", undefined]) {
      expect((await comprobar("otra-persona", [aprueba("luis-gil", "APPROVED", { author_association: asociacion })])).codigo,
        String(asociacion)).toBe(1);
    }
    for (const asociacion of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      expect((await comprobar("otra-persona", [aprueba("luis-gil", "APPROVED", { author_association: asociacion })])).codigo,
        asociacion).toBe(0);
    }
  });

  it("con los datos incompletos, falla: más commits de los leídos, o una PR de la App sin quien la lanzó", async () => {
    const truncada = await comprobar("otra-persona", [aprueba("luis-gil")], [commitDelHarness("ana-lopez")], { commits: 300 });
    expect(truncada.codigo).toBe(1);
    expect(truncada.salida).toContain("No se pueden leer todos los commits de la PR (300)");
    const sinQuien = await comprobar("otra-persona", [aprueba("luis-gil")], [{ commit: { message: "feat: algo" } }]);
    expect(sinQuien.codigo).toBe(1);
    expect(sinQuien.salida).toContain("La PR la abre diverger-harness[bot] y ningún commit dice quién lanzó el harness");
  });

  it("si la API falla, falla", async () => {
    carpeta = mkdtempSync(join(tmpdir(), "aprobacion-"));
    mkdirSync(join(carpeta, ".diverger"));
    writeFileSync(join(carpeta, ".diverger", "settings.json"), JSON.stringify({ approvalPolicy: "otra-persona" }));
    const api = await arrancar({ ejecuciones: [], usuarios: {}, prs: {} });
    servidor = api.servidor;
    await expect(promisify(execFile)(process.execPath, [SCRIPT], {
      cwd: carpeta, env: { ...process.env, GITHUB_API_URL: api.url, GITHUB_REPOSITORY: REPO, PR_NUMERO: "55" },
    })).rejects.toMatchObject({ code: 1 });
  });

  it("el workflow corre al abrir la PR y con cada revisión, con el script de la rama base", () => {
    const workflow = readFileSync(join(RAIZ, ".github", "workflows", "aprobacion.yml"), "utf8");
    expect(workflow).toMatch(/pull_request_review:\s*\n\s*types: \[submitted, edited, dismissed\]/);
    expect(workflow).toMatch(/pull_request:\s*\n\s*types: \[opened, synchronize, reopened\]/);
    expect(workflow).toContain("  otra-persona:");
    expect(workflow).toContain("ref: ${{ github.event.pull_request.base.sha }}");
    expect(workflow).toContain("run: node scripts/aprobacion.mjs");
    expect(workflow).not.toMatch(/\$\{\{ github\.event\.(review|pull_request)\.(body|title)/);
  });
});
