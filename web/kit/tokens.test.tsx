// Tests de los tokens (ADR 0058 del harness): kit.css solo usa variables de tokens.css, así que un cliente cambia el
// aspecto cambiando los tokens, sin tocar el kit ni las pantallas; y cada par de texto y fondo de los dos temas pasa el
// contraste de WCAG 2.2 AA (4,5 para texto). El contraste en la pantalla real lo comprueban las pruebas de staging.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (fichero: string) => readFileSync(join(import.meta.dirname, fichero), "utf8");

/** Las variables de un bloque de CSS: «--color-texto: #fff» da { "--color-texto": "#fff" }. */
function variables(bloque: string): Record<string, string> {
  return Object.fromEntries([...bloque.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]));
}

function luminancia(hex: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

const tokens = leer("tokens.css");
const oscuro = variables(/:root\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? "");
const claro = { ...oscuro, ...variables(/:root\[data-tema="claro"\]\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? "") };

const PARES: [texto: string, fondo: string][] = [
  ["--color-texto", "--color-fondo"],
  ["--color-texto", "--color-superficie"],
  ["--color-texto-secundario", "--color-fondo"],
  ["--color-primario-texto", "--color-primario"],
  ["--color-error", "--color-fondo"],
  ["--color-error", "--color-superficie"],
  ["--color-exito", "--color-fondo"],
  ["--color-enlace", "--color-fondo"],
];

describe("tokens del kit", () => {
  it("kit.css no tiene colores sueltos: todos salen de las variables de tokens.css", () => {
    const sinComentarios = leer("kit.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)).toBeNull();
    const usadas = new Set([...sinComentarios.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
    for (const variable of usadas) expect(Object.keys(oscuro), `kit.css usa ${String(variable)}, que tokens.css no define`).toContain(variable);
  });

  it("el tema claro y el de prefers-color-scheme definen lo mismo", () => {
    const media = variables(/prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-tema="oscuro"\]\)\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? "");
    expect(media).toEqual(variables(/:root\[data-tema="claro"\]\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? ""));
  });

  for (const [nombre, tema] of [["oscuro", oscuro], ["claro", claro]] as const) {
    it.each(PARES)(`en el tema ${nombre}, %s sobre %s pasa WCAG AA`, (texto, fondo) => {
      expect(contraste(tema[texto] ?? "", tema[fondo] ?? "")).toBeGreaterThanOrEqual(4.5);
    });
  }
});
