import { useEffect, useRef, useState } from "react";
import type { BotonDeGoogle } from "./sesion.js";
import type { Pantalla, Persona, Sesion } from "./pantallas.js";
import { pantallas as pantallasDeLaAplicacion } from "./pantallas.gen.js";

export interface AppProps {
  botonDeGoogle: BotonDeGoogle;
  /** Las pantallas de la aplicación; por defecto, las de web/<id>/ (web/pantallas.gen.ts). Los tests pueden pasar otras. */
  pantallas?: Pantalla[];
}

/**
 * Pide la configuración y muestra el botón de Google. Con la sesión iniciada, saluda a la persona y enseña el menú de
 * las pantallas que puede ver y la elegida, que recibe el token y la persona (ADR 0053 del harness).
 */
export function App({ botonDeGoogle, pantallas = pantallasDeLaAplicacion }: AppProps) {
  const boton = useRef<HTMLDivElement>(null);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const elemento = boton.current;
    if (!elemento) return;
    const entrar = async (token: string) => {
      const respuesta = await fetch("/api/yo", { headers: { authorization: `Bearer ${token}` } });
      if (!respuesta.ok) throw new Error("Google no ha confirmado tu sesión.");
      setSesion({ token, persona: (await respuesta.json()) as Persona });
    };
    const iniciar = async () => {
      const respuesta = await fetch("/api/config");
      const { googleClientId } = (await respuesta.json()) as { googleClientId: string };
      if (!googleClientId) throw new Error("Inicio de sesión sin configurar.");
      await botonDeGoogle(elemento, googleClientId, (token) => {
        entrar(token).catch((motivo: unknown) => {
          setError(motivo instanceof Error ? motivo.message : String(motivo));
        });
      });
    };
    iniciar().catch((motivo: unknown) => {
      setError(motivo instanceof Error ? motivo.message : String(motivo));
    });
  }, [botonDeGoogle]);

  const visibles = sesion ? pantallas.filter((p) => !p.visible || p.visible(sesion.persona)) : [];
  const actual = visibles.find((p) => p.id === elegida) ?? visibles[0];

  return (
    <main>
      <h1>Aplicación</h1>
      {sesion ? <p>Hola, {sesion.persona.nombre}</p> : <div ref={boton} />}
      {sesion && visibles.length > 0 && (
        <nav aria-label="Pantallas">
          <ul>
            {visibles.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === actual?.id ? "page" : undefined}
                  onClick={() => {
                    setElegida(p.id);
                  }}
                >
                  {p.titulo}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {sesion && actual && <actual.Componente key={actual.id} sesion={sesion} />}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
