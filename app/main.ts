// Arranque en Cloud Run: el puerto llega en PORT y el ID de cliente de Google en GOOGLE_CLIENT_ID.
import { fileURLToPath } from "node:url";
import { verificadorGoogle } from "../lib/auth.js";
import { crearServidor } from "./server.js";

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
if (!googleClientId) {
  console.error("Falta la variable GOOGLE_CLIENT_ID.");
  process.exit(1);
}
const app = await crearServidor({
  googleClientId,
  verificarToken: verificadorGoogle(googleClientId),
  webRoot: fileURLToPath(new URL("../../web", import.meta.url)),
  logger: true,
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8080) });
