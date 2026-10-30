# Golden path de Diverger

Plantilla de repositorio con la que el harness de Diverger crea cada aplicación: un stack fijo y una estructura conocida, para que los agentes trabajen sobre un terreno que ya compila y pasa el CI. Las decisiones están en el ADR 0004 del harness ([Diverger-ExP-Harness](https://github.com/DivergerThinking/Diverger-ExP-Harness/blob/main/docs/adr/0004-plantilla-del-golden-path.md)).

| Pieza | Elección |
|---|---|
| Backend | Node.js 22 con TypeScript y Fastify |
| Frontend | React con Vite |
| Inicio de sesión | Google Identity Services: el frontend obtiene un token de identidad y el servidor lo verifica |
| Tests | Vitest (servidor en Node, frontend con jsdom y Testing Library) |
| Contratos | OpenAPI 3.1 por contexto, con Redocly como linter y tipos generados con openapi-typescript |
| Dependencias entre contextos | dependency-cruiser |
| Despliegue | Una imagen con el Dockerfile, para Cloud Run |

## Crear una aplicación

```sh
gh repo create <propietario>/<aplicacion> --template DivergerThinking/diverger-golden-path --public --clone
cd <aplicacion>
npm ci
npm run check
```

Después, una persona administradora del repositorio:

1. Cambia `@joselcs` por el titular de la aplicación en `.github/CODEOWNERS`.
2. Aplica el ruleset `codeowners` con el script del harness: `infra/github/aplicar-ruleset.sh <propietario>/<aplicacion>`. Una plantilla de GitHub copia los ficheros, pero no las reglas de la rama. Con el plan Free, solo funciona si el repositorio es público.

## Estructura

```
spec/contextos/<id>/api.openapi.json   contrato de cada bounded context
src/<id>/index.ts                      interfaz pública del contexto: lo único que importan los demás
src/<id>/api.gen.ts                    tipos generados del contrato (npm run gen; no se versionan)
src/<id>/...                           lógica interna del contexto
lib/                                   código común sin negocio (por ejemplo, el inicio de sesión)
app/                                   servidor: arranque, autenticación y registro de los contextos
web/                                   frontend en React
test/                                  pruebas de las reglas del repo
```

El contexto `ejemplo` solo sirve para que todo funcione desde el primer momento: el arquitecto lo sustituye por los contextos de la aplicación. Para añadir un contexto: su contrato en `spec/contextos/<id>/api.openapi.json`, su código en `src/<id>/` con un `index.ts` que exporte sus funciones públicas y sus rutas, y una línea en `app/contextos.ts`.

## Reglas que comprueba el CI

- **Un contexto solo usa el `index.ts` de otro.** `npm run lint:deps` falla si `src/prestamos` importa cualquier otro fichero de `src/equipos`, si `app/` o `web/` entran en lo interno de un contexto, si `lib/` depende de algo de la aplicación o si hay ciclos.
- **El contrato manda en los datos.** Los tipos salen de OpenAPI con `npm run gen`; no se escriben a mano.
- **Todo pasa el lint y los tipos** con TypeScript estricto.
- **Cada commit de un agente dice quién lo hizo.** Lleva los trailers `Diverger-Rol`, `Diverger-Modelo` y `Diverger-Tarea`. El job del worker los añade con el hook de `scripts/git-hooks/` (`git config core.hooksPath scripts/git-hooks` y las variables `DIVERGER_ROL`, `DIVERGER_MODELO` y `DIVERGER_TAREA`). El job `trailers` falla con «Falta el trailer de tarea» si un commit de agente no los lleva. Es de agente si lleva algún trailer de Diverger o un `Co-Authored-By` de Claude. Los commits de personas no los necesitan.
- **La configuración del harness tiene dueño.** `.github/CODEOWNERS` hace al titular propietario de `.diverger/settings.json` (el modo de autonomía, entre otras cosas) y del propio CODEOWNERS. `node scripts/codeowners.mjs` falla si dejan de estar cubiertos, por ejemplo con una regla posterior sin propietarios. Con el ruleset `codeowners`, ni un agente ni nadie con escritura los cambia sin la aprobación del titular, también en modo yolo.
- **Seguridad en cada PR**, los cuatro análisis del diseño del harness:
  - código fuente (SAST) con CodeQL (`codeql.yml`);
  - dependencias con vulnerabilidades conocidas (SCA) con `npm audit` (`ci.yml`);
  - secretos con gitleaks (`secretos.yml`);
  - imagen del contenedor con Trivy (`ci.yml`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Todo lo que comprueba el CI, salvo la imagen y los análisis de seguridad |
| `npm run gen` | Genera los tipos desde los contratos |
| `npm run dev` | Frontend con recarga en el puerto 5173; las peticiones a `/api` van al servidor del puerto 8080 |
| `npm run build` | Construye el frontend en `dist/web` y el servidor en `dist/server` |
| `npm start` | Arranca el servidor construido |

## Inicio de sesión con Google

El servidor necesita la variable `GOOGLE_CLIENT_ID`, el ID de un cliente OAuth de tipo «Aplicación web» de Google Cloud, con la URL de la aplicación entre los orígenes de JavaScript autorizados. El frontend lo pide a `/api/config`, así que la misma imagen sirve en cualquier entorno. Cada petición a `/api` lleva el token en `Authorization: Bearer <token>`. Solo `/api/salud` y `/api/config` son públicas.
