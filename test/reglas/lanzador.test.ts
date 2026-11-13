// Quién lanzó una ejecución del harness (EN-OPS-06, RQ.066): lo dice GitHub, no el modelo. Se prueba
// scripts/lanzador.mjs contra una API de GitHub de mentira.
import { execFile } from "node:child_process";
import type { Server } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { arrancar, lanzadoPorElBucle, PERSONAS, REPO, type Datos } from "./github-falso.js";

const SCRIPT = join(import.meta.dirname, "..", "..", "scripts", "lanzador.mjs");
let servidor: Server | undefined;

async function lanzador(datos: Datos, ...args: string[]): Promise<{ codigo: number; salida: string; errores: string }> {
  const api = await arrancar(datos);
  servidor = api.servidor;
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, GITHUB_API_URL: api.url, GITHUB_REPOSITORY: REPO, GH_TOKEN: "token-de-prueba" },
    });
    return { codigo: 0, salida: stdout, errores: stderr };
  } catch (error) {
    const fallo = error as { code: number; stdout: string; stderr: string };
    return { codigo: fallo.code, salida: fallo.stdout, errores: fallo.stderr };
  }
}

afterEach(() => {
  servidor?.close();
  servidor = undefined;
});

describe("quién lanzó la ejecución", () => {
  it("si el bucle lanzó el worker, es quien lanzó el bucle de esa iniciativa, con su id y su nombre", async () => {
    const r = await lanzador({ ejecuciones: lanzadoPorElBucle("joselcs"), usuarios: PERSONAS }, "900", "prestamos");
    expect(r.errores).toBe("");
    expect(JSON.parse(r.salida)).toEqual({ login: "joselcs", id: 1234567, nombre: "José Luis Calvo",
      ejecucion: `https://github.com/${REPO}/actions/runs/800` });
  });

  it("si el bucle lanzó el worker con el GITHUB_TOKEN del job, también es quien lanzó el bucle (harness#753)", async () => {
    // Con el GITHUB_TOKEN, quien lanza el worker es github-actions[bot], no la App del harness.
    const ejecuciones = lanzadoPorElBucle("joselcs")
      .map((e) => e.id === 900 ? { ...e, actor: { login: "github-actions[bot]" } } : e);
    const r = await lanzador({ ejecuciones, usuarios: PERSONAS }, "900", "prestamos");
    expect(r.errores).toBe("");
    expect(JSON.parse(r.salida)).toMatchObject({ login: "joselcs", id: 1234567 });
  });

  it("si una persona lanzó el worker a mano, es esa persona", async () => {
    const ejecuciones = lanzadoPorElBucle("joselcs").map((e) => e.id === 900 ? { ...e, actor: { login: "ana-lopez" } } : e);
    const r = await lanzador({ ejecuciones, usuarios: PERSONAS }, "900", "prestamos");
    expect(JSON.parse(r.salida)).toMatchObject({ login: "ana-lopez", id: 7654321 });
  });

  it("sin nombre en GitHub, el nombre es el login; sin < > ni saltos de línea", async () => {
    const usuarios = { joselcs: { id: 1234567, name: null }, "ana-lopez": { id: 7654321, name: "Ana <x>\nLópez" } };
    expect(JSON.parse((await lanzador({ ejecuciones: lanzadoPorElBucle("joselcs"), usuarios }, "900", "prestamos")).salida))
      .toMatchObject({ nombre: "joselcs" });
    servidor?.close();
    expect(JSON.parse((await lanzador({ ejecuciones: lanzadoPorElBucle("ana-lopez"), usuarios }, "900", "prestamos")).salida))
      .toMatchObject({ nombre: "Ana x López" });
  });

  it("falla si no encuentra el bucle de la iniciativa", async () => {
    const r = await lanzador({ ejecuciones: lanzadoPorElBucle("joselcs", "otra"), usuarios: PERSONAS }, "900", "prestamos");
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("No se encuentra el bucle de prestamos que lanzó el worker 900");
  });

  it("falla si quien lanzó el bucle no es una persona", async () => {
    const r = await lanzador({ ejecuciones: lanzadoPorElBucle("diverger-harness[bot]"), usuarios: PERSONAS }, "900", "prestamos");
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("la lanzó diverger-harness[bot], que no es una persona");
  });

  it("falla si la ejecución no es del worker", async () => {
    const r = await lanzador({ ejecuciones: lanzadoPorElBucle("joselcs"), usuarios: PERSONAS }, "800", "prestamos");
    expect(r.codigo).toBe(1);
    expect(r.errores).toContain("La ejecución 800 no es del worker");
  });
});

describe("lecturas de la API de GitHub con fallos pasajeros (harness#794)", () => {
  const RUTA = `/repos/${REPO}/pulls/55`;
  type Api = (path: string) => Promise<unknown>;
  type Fabrica = (token: string, base: string, opciones: { dormir: (ms: number) => Promise<void> }) => Api;

  // Las esperas se apuntan en vez de dormir, para que el test no tarde.
  async function cliente(base: string, esperas: number[]): Promise<Api> {
    // El script no tiene tipos: se importa por su ruta, como un módulo cualquiera, y se le da el tipo aquí.
    const { apiDeGitHub } = (await import(pathToFileURL(SCRIPT).href)) as { apiDeGitHub: Fabrica };
    return apiDeGitHub("token-de-prueba", base, { dormir: (ms) => { esperas.push(ms); return Promise.resolve(); } });
  }

  async function leer(fallos: number, esperas: number[]): Promise<unknown> {
    const api = await arrancar({ ejecuciones: [], usuarios: PERSONAS, prs: { 55: { body: "Lanzado por @joselcs." } },
      fallos: { [RUTA]: fallos } });
    servidor = api.servidor;
    return (await cliente(api.url, esperas))(`repos/${REPO}/pulls/55`);
  }

  it("reintenta un 503 y espera 0,5 s y luego 1 s", async () => {
    const esperas: number[] = [];
    expect(await leer(2, esperas)).toEqual({ body: "Lanzado por @joselcs." });
    expect(esperas).toEqual([500, 1000]);
  });

  it("tras el tercer 503 se rinde y dice qué respondió", async () => {
    const esperas: number[] = [];
    await expect(leer(3, esperas)).rejects.toThrow(`La API de GitHub responde 503 a repos/${REPO}/pulls/55`);
    expect(esperas).toEqual([500, 1000]);
  });

  it("un 404 no se reintenta", async () => {
    const api = await arrancar({ ejecuciones: [], usuarios: PERSONAS });
    servidor = api.servidor;
    const esperas: number[] = [];
    await expect((await cliente(api.url, esperas))(`repos/${REPO}/pulls/99`)).rejects.toThrow("responde 404");
    expect(esperas).toEqual([]);
  });

  it("un fallo de la red se reintenta y, si sigue, lo dice", async () => {
    const esperas: number[] = [];
    // Un puerto en el que no escucha nadie: fetch falla sin respuesta.
    await expect((await cliente("http://127.0.0.1:9", esperas))("repos/x/y/pulls/1"))
      .rejects.toThrow("La API de GitHub no responde a repos/x/y/pulls/1");
    expect(esperas).toEqual([500, 1000]);
  });
});
