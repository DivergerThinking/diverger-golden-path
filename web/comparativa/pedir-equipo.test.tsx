// @vitest-environment jsdom
// La misma prueba con cada candidato: la pantalla «Pedir un equipo» (P-06 a P-08 del nivel 1) se usa por sus etiquetas,
// pide el equipo con la fecha, enseña el error de la API y no tiene fallos de accesibilidad que axe-core detecte.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Equipo, PedirEquipoProps, Resultado } from "./contrato.js";
import { PedirEquipo as Kit } from "./kit/PedirEquipo.js";
import { PedirEquipo as Mantine } from "./mantine/PedirEquipo.js";
import { PedirEquipo as Radix } from "./radix/PedirEquipo.js";
import { PedirEquipo as ReactAria } from "./react-aria/PedirEquipo.js";

// jsdom no trae matchMedia ni ResizeObserver, que usan Mantine y Radix.
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const EQUIPOS: Equipo[] = [
  { id: "e1", nombre: "Portátil demo", estado: "disponible" },
  { id: "e2", nombre: "Monitor demo", estado: "reservado" },
];
const CANDIDATOS: [string, ComponentType<PedirEquipoProps>][] = [
  ["kit generado", Kit], ["React Aria Components", ReactAria], ["Mantine", Mantine], ["Radix Themes", Radix],
];

afterEach(cleanup);

describe.each(CANDIDATOS)("Pedir un equipo con %s", (_nombre, Pantalla) => {
  function pintar(resultado: Resultado) {
    const pedir = vi.fn(() => Promise.resolve(resultado));
    const vista = render(<Pantalla equipos={EQUIPOS} pedir={pedir} />);
    return { pedir, vista };
  }

  function pedirCon(fecha: string) {
    fireEvent.change(screen.getByLabelText(/Fecha de devolución/), { target: { value: fecha } });
    fireEvent.click(screen.getByRole("button", { name: "Pedir" }));
  }

  it("pide el equipo disponible con la fecha (P-08)", async () => {
    const { pedir } = pintar({ ok: true });
    expect(screen.getByRole("heading", { level: 1, name: "Pedir un equipo" })).toBeTruthy();
    expect(screen.getAllByText("Equipo").length).toBeGreaterThan(0);
    pedirCon("2026-12-01");
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("e1", "2026-12-01"));
    expect((await screen.findByRole("status")).textContent).toContain("Portátil demo reservado hasta el 2026-12-01");
  });

  it("enseña el error de la API (P-07)", async () => {
    pintar({ ok: false, error: "La fecha de devolución ya ha pasado" });
    pedirCon("2026-11-23");
    expect((await screen.findByRole("alert")).textContent).toContain("La fecha de devolución ya ha pasado");
  });

  it("no tiene fallos de accesibilidad que detecte axe-core, tampoco con el error a la vista", async () => {
    const { vista } = pintar({ ok: false, error: "La fecha de devolución ya ha pasado" });
    const antes = await axe.run(vista.container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    pedirCon("2026-11-23");
    await screen.findByRole("alert");
    const despues = await axe.run(vista.container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    const fallos = [...antes.violations, ...despues.violations].map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(fallos).toEqual([]);
  });
});
