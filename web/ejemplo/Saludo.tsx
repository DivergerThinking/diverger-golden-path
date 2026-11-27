import { useEffect, useState } from "react";
import { api, type Sesion } from "../pantallas.js";
import { Aviso } from "../kit/index.js";

interface RespuestaSaludo {
  mensaje: string;
}

/** Pide el saludo a GET /api/ejemplo/saludo y lo enseña; si la API falla, enseña su mensaje con el
 * Aviso del sistema de diseño (web/kit/, ADR 0058 del harness), como todas las pantallas. */
export function Saludo({ sesion }: { sesion: Sesion }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RespuestaSaludo>(sesion, "/api/ejemplo/saludo")
      .then((saludo) => {
        setMensaje(saludo.mensaje);
      })
      .catch((motivo: unknown) => {
        setError(motivo instanceof Error ? motivo.message : String(motivo));
      });
  }, [sesion]);

  return (
    <section aria-labelledby="saludo">
      <h2 id="saludo">Saludo</h2>
      {mensaje && <p>{mensaje}</p>}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </section>
  );
}
