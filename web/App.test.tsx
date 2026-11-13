import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App.js";
import type { Pantalla, Sesion } from "./pantallas.js";
import type { BotonDeGoogle } from "./sesion.js";

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("pide el ID de cliente y, tras iniciar sesión, saluda a la persona", async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(url === "/api/config" ? respuesta({ googleClientId: "cliente" }) : respuesta({ email: "ana@example.com", nombre: "Ana" })),
    );
    vi.stubGlobal("fetch", fetch);
    const boton: BotonDeGoogle = (_elemento, clientId, alEntrar) => {
      expect(clientId).toBe("cliente");
      alEntrar("token-bueno");
      return Promise.resolve();
    };
    render(<App botonDeGoogle={boton} pantallas={[]} />);
    expect(await screen.findByText("Hola, Ana")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();  // Sin pantallas, solo saluda.
    expect(fetch).toHaveBeenCalledWith("/api/yo", { headers: { authorization: "Bearer token-bueno" } });
  });

  it("avisa, sin botón de Google, cuando el inicio de sesión no está configurado", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(respuesta({ googleClientId: "" })));
    const boton = vi.fn<BotonDeGoogle>(() => Promise.resolve());
    render(<App botonDeGoogle={boton} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Inicio de sesión sin configurar.");
    expect(boton).not.toHaveBeenCalled();
  });

  it("avisa cuando el servidor no acepta el token", async () => {
    vi.stubGlobal("fetch", (url: string) =>
      Promise.resolve(url === "/api/config" ? respuesta({ googleClientId: "cliente" }) : respuesta({ error: "Inicia sesión con Google." }, 401)),
    );
    const boton: BotonDeGoogle = (_elemento, _clientId, alEntrar) => {
      alEntrar("token-malo");
      return Promise.resolve();
    };
    render(<App botonDeGoogle={boton} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Google no ha confirmado tu sesión.");
  });

  describe("pantallas (ADR 0053 del harness)", () => {
    function Muestra(texto: string) {
      return function Componente({ sesion }: { sesion: Sesion }) {
        return <p>{`${texto} para ${sesion.persona.nombre} con ${sesion.token}`}</p>;
      };
    }

    const PANTALLAS: Pantalla[] = [
      { id: "equipos-lista", titulo: "Equipos", Componente: Muestra("Lista de equipos") },
      { id: "prestamos-vencidos", titulo: "Vencidos", Componente: Muestra("Préstamos vencidos"), visible: (p) => p.it === true },
      { id: "prestamos-mios", titulo: "Mis préstamos", Componente: Muestra("Mis préstamos") },
    ];

    function entrar(persona: Record<string, unknown>) {
      vi.stubGlobal("fetch", (url: string) =>
        Promise.resolve(url === "/api/config" ? respuesta({ googleClientId: "cliente" }) : respuesta(persona)),
      );
      const boton: BotonDeGoogle = (_elemento, _clientId, alEntrar) => {
        alEntrar("token-bueno");
        return Promise.resolve();
      };
      render(<App botonDeGoogle={boton} pantallas={PANTALLAS} />);
    }

    it("con la sesión, enseña el menú y la primera pantalla, que recibe el token y la persona", async () => {
      entrar({ email: "ana@example.com", nombre: "Ana", it: true });
      expect(await screen.findByText("Lista de equipos para Ana con token-bueno")).toBeTruthy();
      const menu = screen.getByRole("navigation", { name: "Pantallas" });
      expect([...menu.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Equipos", "Vencidos", "Mis préstamos"]);
      expect(screen.getByRole("button", { name: "Equipos" }).getAttribute("aria-current")).toBe("page");
    });

    it("cambia de pantalla desde el menú", async () => {
      entrar({ email: "ana@example.com", nombre: "Ana", it: true });
      fireEvent.click(await screen.findByRole("button", { name: "Vencidos" }));
      expect(await screen.findByText("Préstamos vencidos para Ana con token-bueno")).toBeTruthy();
      expect(screen.queryByText("Lista de equipos para Ana con token-bueno")).toBeNull();
      expect(screen.getByRole("button", { name: "Vencidos" }).getAttribute("aria-current")).toBe("page");
    });

    it("no enseña a una persona las pantallas que no puede ver", async () => {
      entrar({ email: "luis@example.com", nombre: "Luis" });
      expect(await screen.findByText("Lista de equipos para Luis con token-bueno")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Vencidos" })).toBeNull();
      expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Equipos", "Mis préstamos"]);
    });

    it("sin la sesión no enseña ninguna pantalla", async () => {
      vi.stubGlobal("fetch", () => Promise.resolve(respuesta({ googleClientId: "cliente" })));
      render(<App botonDeGoogle={() => Promise.resolve()} pantallas={PANTALLAS} />);
      await Promise.resolve();
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(screen.queryByText(/Lista de equipos/)).toBeNull();
    });
  });
});
