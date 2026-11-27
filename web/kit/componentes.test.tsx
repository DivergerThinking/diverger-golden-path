// Tests de cada componente del kit: lo que ve y hace la persona, por su rol y su nombre, y axe-core sin fallos de
// accesibilidad. El contraste no se mide en jsdom: lo comprueban tokens.test.tsx y las pruebas de staging.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { Aviso, Boton, Campo, DialogoConfirmacion, EtiquetaEstado, Formulario, ListaVacia, Menu, Pagina, Selector, Tabla } from "./index.js";

afterEach(cleanup);

/**
 * Los fallos de axe-core en el documento, por su id. Sin la regla de contraste, que jsdom no puede medir, ni la de
 * «region», que pide que todo esté dentro de un <main>: aquí se prueba cada componente suelto, fuera de una Pagina.
 */
async function fallosDeAccesibilidad(): Promise<string[]> {
  const resultado = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
  return resultado.violations.map((v) => `${v.id}: ${v.help}`);
}

function CampoConEstado({ error }: { error?: string }) {
  const [valor, setValor] = useState("");
  return <Campo etiqueta="Fecha de devolución" tipo="date" valor={valor} alCambiar={setValor} error={error} descripcion="Como mucho, en 30 días." />;
}

describe("kit", () => {
  it("Pagina y Menu: título, navegación y la pantalla abierta marcada", async () => {
    const alElegir = vi.fn();
    render(
      <Pagina titulo="Préstamos" menu={<Menu etiqueta="Pantallas" opciones={[{ id: "a", texto: "Pedir" }, { id: "b", texto: "Vencidos" }]} actual="b" alElegir={alElegir} />}>
        <p>Contenido</p>
      </Pagina>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Préstamos" })).toBeTruthy();
    const navegacion = screen.getByRole("navigation", { name: "Pantallas" });
    expect(navegacion.querySelector('[aria-current="page"]')?.textContent).toBe("Vencidos");
    fireEvent.click(screen.getByRole("button", { name: "Pedir" }));
    expect(alElegir).toHaveBeenCalledWith("a");
    expect(await fallosDeAccesibilidad()).toEqual([]);
  });

  it("Boton: pulsa, y desactivado no hace nada", () => {
    const alPulsar = vi.fn();
    render(
      <>
        <Boton variante="primario" alPulsar={alPulsar}>Guardar</Boton>
        <Boton desactivado alPulsar={alPulsar}>Borrar</Boton>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(alPulsar).toHaveBeenCalledTimes(1);
  });

  it("Campo: se encuentra por su etiqueta, cambia y anuncia su error", async () => {
    const { rerender } = render(<CampoConEstado />);
    const campo = screen.getByLabelText<HTMLInputElement>("Fecha de devolución");
    fireEvent.change(campo, { target: { value: "2026-12-01" } });
    expect(campo.value).toBe("2026-12-01");
    expect(campo.getAttribute("aria-invalid")).toBeNull();
    rerender(<CampoConEstado error="La fecha ya ha pasado." />);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")?.split(" ").map((id) => document.getElementById(id)?.textContent)).toContain("La fecha ya ha pasado.");
    expect(await fallosDeAccesibilidad()).toEqual([]);
  });

  it("Selector: tiene su etiqueta y enseña la opción elegida", async () => {
    render(<Selector etiqueta="Equipo" opciones={[{ id: "p1", texto: "Portátil 1" }]} valor="p1" alCambiar={() => undefined} />);
    expect(screen.getByRole("button", { name: /Equipo/ }).textContent).toContain("Portátil 1");
    expect(await fallosDeAccesibilidad()).toEqual([]);
  });

  it("Formulario: enviar llama a alEnviar sin recargar", () => {
    const alEnviar = vi.fn();
    render(
      <Formulario etiqueta="Pedir un equipo" alEnviar={alEnviar}>
        <Boton variante="primario" enviar>Pedir</Boton>
      </Formulario>,
    );
    fireEvent.submit(screen.getByRole("form", { name: "Pedir un equipo" }));
    expect(alEnviar).toHaveBeenCalledTimes(1);
  });

  it("Tabla: enseña cabeceras y filas, y sin filas el mensaje de vacía", async () => {
    const columnas = [{ id: "equipo", titulo: "Equipo" }, { id: "estado", titulo: "Estado" }];
    const { rerender } = render(
      <Tabla etiqueta="Préstamos vencidos" columnas={columnas} filas={[{ id: "1", equipo: "Portátil 1", estado: <EtiquetaEstado texto="Vencido" tono="error" /> }]} />,
    );
    expect(screen.getByRole("grid", { name: "Préstamos vencidos" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Equipo" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Portátil 1" })).toBeTruthy();
    expect(screen.getByText("Vencido")).toBeTruthy();
    expect(await fallosDeAccesibilidad()).toEqual([]);
    rerender(<Tabla etiqueta="Préstamos vencidos" columnas={columnas} filas={[]} vacia="No hay préstamos vencidos." />);
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByText("No hay préstamos vencidos.")).toBeTruthy();
  });

  it("ListaVacia y Aviso: el error se anuncia con alert y el éxito con status", () => {
    render(
      <>
        <ListaVacia mensaje="Sin equipos." />
        <Aviso tipo="error">No se ha podido guardar.</Aviso>
        <Aviso tipo="exito">Guardado.</Aviso>
      </>,
    );
    expect(screen.getByText("Sin equipos.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("No se ha podido guardar.");
    expect(screen.getByRole("status").textContent).toBe("Guardado.");
  });

  it("DialogoConfirmacion: abierto pide confirmación; confirmar y cancelar llaman a lo suyo", async () => {
    const alConfirmar = vi.fn();
    const alCancelar = vi.fn();
    const { rerender } = render(
      <DialogoConfirmacion titulo="¿Borrar el equipo?" mensaje="No se puede deshacer." textoConfirmar="Borrar" abierto={false} alConfirmar={alConfirmar} alCancelar={alCancelar} />,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    rerender(<DialogoConfirmacion titulo="¿Borrar el equipo?" mensaje="No se puede deshacer." textoConfirmar="Borrar" abierto alConfirmar={alConfirmar} alCancelar={alCancelar} />);
    expect(screen.getByRole("alertdialog", { name: "¿Borrar el equipo?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(await fallosDeAccesibilidad()).toEqual([]);
  });
});
