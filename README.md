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
| Infraestructura | Cloud Run, Firestore y Artifact Registry descritos con OpenTofu en `infra/` |

## Crear una aplicación

```sh
gh repo create <propietario>/<aplicacion> --template DivergerThinking/diverger-golden-path --public --clone
cd <aplicacion>
npm ci
npm run check
```

Después, una persona administradora del repositorio:

1. Cambia `@joselcs` por el titular de la aplicación en `.github/CODEOWNERS`, y `@686f6c61` por la segunda persona que puede aprobar los cambios de la suite de aceptación.
2. Aplica el ruleset `codeowners` con el script del harness: `infra/github/aplicar-ruleset.sh <propietario>/<aplicacion>`. Una plantilla de GitHub copia los ficheros, pero no las reglas de la rama. Con el plan Free, solo funciona si el repositorio es público.

## Estructura

```
spec/contextos/<id>/api.openapi.json   contrato de cada bounded context
src/<id>/index.ts                      interfaz pública del contexto: lo único que importan los demás
src/<id>/api.gen.ts                    tipos generados del contrato (npm run gen; no se versionan)
src/<id>/...                           lógica interna del contexto
lib/                                   código común sin negocio: el inicio de sesión y el puerto de datos (datos.ts, firestore.ts)
app/                                   servidor: arranque, autenticación y registro de los contextos
web/                                   frontend en React
infra/                                 infraestructura como código de la aplicación en GCP
test/                                  pruebas de las reglas del repo
```

El contexto `ejemplo` solo sirve para que todo funcione desde el primer momento: el arquitecto lo sustituye por los contextos de la aplicación. Para añadir un contexto: su contrato en `spec/contextos/<id>/api.openapi.json`, su código en `src/<id>/` con un `index.ts` que exporte sus funciones públicas y sus rutas, y una línea en `app/contextos.ts`.

## Reglas que comprueba el CI

- **Un contexto solo usa el `index.ts` de otro.** `npm run lint:deps` falla si `src/prestamos` importa cualquier otro fichero de `src/equipos`, si `app/` o `web/` entran en lo interno de un contexto, si `lib/` depende de algo de la aplicación o si hay ciclos.
- **El contrato manda en los datos.** Los tipos salen de OpenAPI con `npm run gen`; no se escriben a mano.
- **Todo pasa el lint y los tipos** con TypeScript estricto.
- **Cada commit de un agente dice quién lo hizo.** Lleva los trailers `Diverger-Rol`, `Diverger-Modelo` y `Diverger-Tarea`. El job del worker (`diverger-worker.yml`) los pone en su commit; un agente que hace commits en una sesión los añade con el hook de `scripts/git-hooks/` (`git config core.hooksPath scripts/git-hooks` y las variables `DIVERGER_ROL`, `DIVERGER_MODELO` y `DIVERGER_TAREA`). El job `trailers` falla con «Falta el trailer de tarea» si un commit de agente no los lleva. Es de agente si lleva algún trailer de Diverger o un `Co-Authored-By` de Claude. Los commits de personas no los necesitan.
- **Cada commit del harness dice qué persona lo lanzó** (EN-OPS-06, ADR 0008 del harness). Un commit es del harness si su autor es `diverger-harness[bot]`, o una GitHub App (`…[bot]`) con trailers de Diverger; los de un agente en la sesión de una persona, con su cuenta, no lo son. Además de los de rol, modelo y tarea, lleva `Diverger-Iniciado-por: <login>` y `Co-authored-by: <nombre> <id+login@users.noreply.github.com>`, siempre con el correo noreply de GitHub, nunca el real. Quién lo lanzó lo dice GitHub, no el modelo (`scripts/lanzador.mjs`): quien lanzó el job del worker o, si lo lanzó el bucle con la identidad del harness, quien lanzó ese bucle. En el CI, el job `trailers` busca el job del worker que enlaza la descripción de la PR («Job del worker: …») y la iniciativa de su rama, comprueba con los datos de GitHub (no con lo que diga la PR) que ese job es del workflow del worker, de la tarea de la rama de la PR y de su rama base, pregunta a GitHub quién lanzó la ejecución y falla con «Falta el trailer de quien lanzó el harness» si un commit del harness no lo lleva, con «El trailer de quien lanzó el harness no coincide con quien lanzó la ejecución» si es de otra persona, y con «Falta el Co-authored-by de quien lanzó el harness» si no lleva su correo noreply. Si el job enlazado no es de esa tarea o de esa rama, falla con «No se puede comprobar quién lanzó la ejecución» y el motivo. Si alguien relanza un bucle o un worker con «Re-run», responde quien lo lanzó la primera vez (`actor`, igual que `github.actor`), no quien lo relanzó (decisión del titular). El job usa el script de la rama base, así que una PR no puede cambiar la comprobación que la juzga. Un agente en una sesión puede añadir los dos trailers con el hook y las variables `DIVERGER_INICIADO_POR`, `DIVERGER_INICIADO_POR_ID` y, si quiere, `DIVERGER_INICIADO_POR_NOMBRE`; en esos commits el CI no los compara.
- **Con la política «otra persona», aprueba una persona distinta de quien lanzó el harness** (EN-OPS-10, ADR 0008 del harness). El ruleset de esa política pide una aprobación y la de CODEOWNERS, pero GitHub deja que la dé quien lanzó el harness, porque la PR la abre la identidad del harness y no él. El workflow `aprobacion.yml` corre al abrir la PR y con cada revisión, y su job `otra-persona` falla con «La aprobación tiene que ser de una persona distinta de quien lanzó el harness» si nadie más que quien lo lanzó, el `Diverger-Iniciado-por` de sus commits, la tiene aprobada. Vale la última revisión de cada persona, y las de las GitHub Apps no cuentan. Con otra política, o en una PR sin commits del harness, pasa. Va en un workflow propio porque `ci.yml` no se lanza con las revisiones, y el script y la política son los de la rama base. El ruleset lo exige solo con esa política (`aplicar-politica.sh` del harness).
- **Los commits de mantenimiento del kit de evaluación del harness no se comparan con una ejecución del worker** (harness#528). Los hacen `preparar-nivel-0.yml` y `ajustes-nivel-0.yml` del harness, con la identidad del harness, en las ramas `diverger/reinicio/<número>` y `diverger/ajustes/<número>` (exactamente esas dos formas, con el número solo de dígitos). Llevan los cuatro trailers (`Diverger-Rol: Evaluación`, `Diverger-Modelo: ninguno`, `Diverger-Tarea: EN-GP-06` y `Diverger-Iniciado-por` con quien lanzó el workflow) y su `Co-authored-by` noreply. El harness es privado y el CI de la aplicación no puede leer sus ejecuciones, así que en esas ramas el job `trailers` no busca el job del worker: pide a la API de usuarios de GitHub el id de quien dice `Diverger-Iniciado-por` y comprueba que el `Co-authored-by` lleva su correo noreply. Falla si faltan los trailers o si `Diverger-Iniciado-por` es una GitHub App (`…[bot]`), en cualquier rama. Para que una iniciativa no aproveche esa excepción, el worker rechaza las iniciativas `reinicio` y `ajustes`. Cualquier otro commit del harness sigue con la comprobación completa.
- **La descripción de cada PR del harness dice quién lo lanzó** (EN-OPS-07, ADR 0047 del harness). Una PR es del harness si la abre `diverger-harness[bot]` o si tiene algún commit del harness. El job `trailers` falla con «Falta “Lanzado por” en la descripción de la PR» si no dice «Lanzado por @login», y con «“Lanzado por @x” no coincide con quien lanzó el harness» si ese login no es el `Diverger-Iniciado-por` de sus commits. Lee la descripción actual de la API (`pull-requests: read`), no la del evento, así que si se corrige a mano basta con volver a lanzar el job. Editar la descripción no lanza el job: a una PR que ya pasó y a la que alguien quita el texto después no se le vuelve a comprobar hasta el siguiente push. Las PR de las personas no lo necesitan, y para ellas no se lee la API.
- **La configuración del harness tiene dueño.** `.github/CODEOWNERS` hace al titular propietario de `.diverger/settings.json` (el modo de autonomía, entre otras cosas) y del propio CODEOWNERS. También de las instrucciones que siguen los agentes (EN-OPS-11): cualquier `CLAUDE.md`, porque Claude Code carga también el de la carpeta en la que trabaja, y todo `.claude/`, con los plugins y los permisos de `settings.json`. Así un agente no cambia sus propias reglas sin una persona. `node scripts/codeowners.mjs` falla si dejan de estar cubiertos, por ejemplo con una regla posterior sin propietarios. Con el ruleset `codeowners`, ni un agente ni nadie con escritura los cambia sin la aprobación del titular, también en modo yolo.
- **La suite de aceptación no la cambia la PR de una tarea** (EN-CAL-01, ADR 0031 del harness). `tests/aceptacion/` es el examen de las historias: la escribe `generate_features` desde los criterios del backlog y la cambia una persona. El job `suite` falla si la PR de una tarea la cambia, añade, borra o renombra algo de ella (`scripts/suite.mjs`, con el script de la rama base). Una PR es de una tarea si alguno de sus commits lleva el trailer `Diverger-Tarea`, salvo en las ramas de mantenimiento del kit de evaluación (`diverger/reinicio/<número>` y `diverger/ajustes/<número>`) en la del plan de una iniciativa (`plan/<iniciativa>`, harness#696), que trae la suite que generó `generate_features`, y en la de la aplicación de un cambio integrado (`cambio/<iniciativa>/C-NNN`, harness#35), que regenera el `.feature` de las historias que el cambio modifica (`/diverger-architect:apply`, ADR 0050 del harness). Cualquier PR que toque la suite, sea de quien sea, recibe la etiqueta `suite-modificada`, que cuenta cada modificación (`gh pr list --label suite-modificada --state all`). `.github/CODEOWNERS` le da dos propietarios, para que uno apruebe las PR del otro, y `scripts/codeowners.mjs` falla si se queda sin ellos. Con el ruleset `codeowners`, cada cambio de la suite necesita la aprobación de uno de ellos, también en modo yolo; las personas administradoras del repositorio pueden integrar sus propias PR sin ella, y la App del harness no lo es.
- **La PR de una tarea solo marca su propia tarea** (EN-EJE-04, ADR 0045 del harness). Cada tarea tiene su fichero, `.diverger/<iniciativa>/tasks/<id>.json`, y su PR lo pasa de `pending` a `done`. Con varios workers a la vez, el job `tareas` (`scripts/tareas.mjs`, con el script de la rama base) impide que uno dé por hecha una tarea ajena o reabra una integrada. Es la PR de una tarea la de la rama de un worker, `diverger/<iniciativa>/<tarea>`, lleve o no trailers, y la de otra rama con un trailer `Diverger-Tarea` cuya tarea tiene su fichero en la rama base. Un trailer con una issue, como `harness#695` en una PR de mantenimiento, no la hace de una tarea, y las ramas de mantenimiento del kit de evaluación no lo son. Falla:
  - con «El PR de TA-004 solo puede cambiar tasks/TA-004.json» si cambia, añade o borra el fichero de otra tarea;
  - con «Una tarea hecha no vuelve a pending: TA-004» si devuelve una tarea hecha a `pending`;
  - con «El PR de TA-004 no marca su tarea como hecha» si no pasa la suya a `done`, también si no la toca;
  - si cambia en su fichero algo más que `status` y `failures`, los fallos que corrigió el worker, o si nombra más de una tarea, también si en la rama de un worker el trailer nombra otra.

  En la rama de un worker, el fichero propio es el de su iniciativa. La PR del plan, en `plan/<iniciativa>`, da de alta tareas solo en `pending` y no cambia el estado de una que ya existe ni borra una hecha. Se compara desde el ancestro común con la rama base, así que una tarea que otra PR marcó en la base después no cuenta como de esta.
- **Seguridad en cada PR**, los cuatro análisis del diseño del harness:
  - código fuente (SAST) con CodeQL (`codeql.yml`);
  - dependencias con vulnerabilidades conocidas (SCA) con `npm audit` (`ci.yml`);
  - secretos con gitleaks (`secretos.yml`);
  - imagen del contenedor con Trivy (`ci.yml`).

## Bucle desatendido

`.github/workflows/diverger-bucle.yml` construye el plan de una iniciativa sin una sesión abierta (HU-EJE-01, ADR 0016 del harness). Se lanza a mano, con la iniciativa:

```sh
gh workflow run diverger-bucle.yml -f initiative=<iniciativa> [-f max-workers=<1 a 3>] [-f restart=true]
```

Es un programa sin modelo, `bucle.py` del núcleo, que el job descarga del harness con un token de la GitHub App de solo lectura. En cada vuelta actualiza la rama base, mira el job y la PR de cada worker y lanza `diverger-worker.yml` para las siguientes tareas listas, tantas a la vez como diga `maxCodeWorkers` en `.diverger/settings.json` (1 si no lo dice); `max-workers` solo lo baja (ADR 0035 del harness). Se para cuando todas las tareas están hechas, se agota el presupuesto de pasos o una espera su test de aceptación; el resumen del job dice por qué.

**Comprobación previa** (EN-GP-04, ADR 0049 del harness). Antes de pedir el token que lanza los workers, el bucle comprueba que el secreto `ANTHROPIC_API_KEY` no está vacío, que están las variables `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `GCP_ARTIFACT_REPO` y `GCP_TELEMETRY_SA`, y que la federación de identidades de GCP deja entrar a este repositorio: pide un token de la cuenta de telemetría (`token_format: access_token`), que solo aceptan los repositorios que `infra/entornos/gcp.sh` del harness tiene en `REPOS`. Sin `token_format`, la acción solo canjearía el token de GitHub en Google, y el proveedor acepta cualquier repositorio de la organización. Si algo falla, el job se para sin lanzar ningún worker ni tocar `run.json`, y el resumen del job dice qué falta y la orden que lo arregla (`gh secret set …`, `gh variable set …` o `PROJECT_ID=… REPOS=… ./infra/entornos/gcp.sh`). El secreto solo entra en el paso de la comprobación, que nunca lo imprime, y la variable de la cuenta de despliegue, solo para ver que no está vacía: ningún paso del bucle entra en GCP con ella. El script es `.github/diverger/bucle-previa.sh`.

**Escalera de reintentos** (HU-EJE-05, ADR 0029 del harness). Si un worker falla, el bucle relanza la tarea hasta tres veces con las entradas `attempt` y `previous` (el job anterior). El worker lee el diagnóstico que dejó ese job: en el intento 2 empieza de cero y en el 3 replanifica dentro de la tarea. Si el tercero también falla, la tarea queda bloqueada, el bucle abre una issue en este repositorio, asignada a quien lanzó el bucle (`github.actor`, si es una persona) y terminada con «Lanzado por @login», y sigue con las tareas que no dependen de ella. Se para con `blocked` cuando ya no puede lanzar nada más. Si se relanza, reanuda sin repetir lo hecho. `restart` levanta una parada por bloqueo o por presupuesto. `run.json` guarda en `build.startedBy` a la primera persona que lanzó la ejecución, y las filas del log `diverger-ejecucion` llevan `lanzado_por` (EN-OPS-07).

**Gasto.** A cada worker le pasa su tope en la entrada `max-usd`, que sale de `budget.maxWorkerUsd` de `.diverger/settings.json` (10 USD si no está), y suma lo que gasta cada uno, que lee del artefacto `diverger-coste` de su job. Un worker sin ese artefacto cuenta su tope entero. Se para con `budget-exhausted` cuando el total llega a `budget.maxRunUsd` (50 USD por defecto) (HU-EJE-06, ADR 0024 del harness). El estado, con el gasto, vive en `run.json`, que no se versiona: al terminar, también si falla, el job lo sube como artefacto `diverger-bucle-<iniciativa>`, y al relanzarse recupera el más reciente de una ejecución de este workflow en la rama base, también el de la propia ejecución si se relanza con «Re-run» (`.github/diverger/bucle-estado.sh`). Si GitHub da cualquier error, el job falla y no sube ningún `run.json`, en vez de empezar con el gasto a cero; solo empieza de cero si no hay ningún artefacto.

Necesita la GitHub App `diverger-harness` instalada en este repositorio (Actions e Issues: escritura, Contents y Pull requests: lectura) y en el harness (Contents: lectura), con las variables `DIVERGER_HARNESS_APP_ID` y el secreto `DIVERGER_HARNESS_APP_KEY`. La variable `DIVERGER_HARNESS_REF` fija la versión del núcleo (por defecto, `main`).

## Datos: el puerto de persistencia

Los contextos guardan y leen sus datos solo a través del puerto de `lib/datos.ts` (HU-GP-01). El servidor se lo pasa a cada contexto al registrarlo, en las opciones de su plugin:

```ts
import type { FastifyPluginAsync } from "fastify";
import type { OpcionesContexto } from "../../lib/datos.js";

export const rutas: FastifyPluginAsync<OpcionesContexto> = (app, { almacen }) => {
  app.post("/api/equipos/:id/prestamo", (request) =>
    almacen.transaccion(async (tx) => {
      const equipo = await tx.obtener<Equipo>("prestamos_equipos", request.params.id);
      // ... comprobar y guardar con tx.guardar(...): todo o nada, también con dos peticiones a la vez.
    }),
  );
  return Promise.resolve();
};
```

- **Operaciones:** `obtener`, `guardar`, `listar`, `borrar` y `transaccion`. La transacción es atómica: si otra cambia lo que ha leído, se repite.
- **Colecciones:** cada contexto usa las suyas, con su id delante (`prestamos_equipos`).
- **Adaptadores:** `lib/firestore.ts` usa la base de `FIRESTORE_DATABASE`. Sin esa variable, el servidor usa el almacén en memoria y lo avisa. En los tests se usa `almacenEnMemoria()`.
- **Regla:** `dependency-cruiser` impide que `src/`, `app/` o `web/` importen el cliente de la base (`datos-solo-por-el-puerto`).
- **Otro golden path,** con otra base, cambia solo el adaptador: los contextos no lo notan.

## Worker de cada tarea

`.github/workflows/diverger-worker.yml` construye una tarea del plan en su propio job (EN-EJE-02 y EN-FM-02). Lo lanza el bucle desatendido del harness con el contrato del ADR 0016 del harness:

| | |
|---|---|
| **Lanzamiento** | `workflow_dispatch` en la rama base con las entradas `initiative`, `task`, `run` (el identificador de la ejecución del bucle) y, opcionales, `max-usd` (el tope de gasto del job), `attempt` (el intento del bucle, 1 por defecto) y `previous` (el job del intento anterior) |
| **Diagnóstico** | Siempre sube el artefacto `diverger-diagnostico` (`diagnostico.md`): el motivo, el final de las últimas comprobaciones y de la respuesta del modelo, y el diagnóstico del intento anterior |
| **Nombre del job** | `diverger-worker <task> <run>` |
| **Rama y PR** | Rama `diverger/<iniciativa>/<tarea>`; la PR lleva `<!-- diverger:task=<tarea>;run=<run> -->` e incluye el código de la tarea y `tasks/<tarea>.json` en `done` |
| **Resultado** | Éxito: el job termina con una PR abierta. Fallo: termina sin PR y el resumen del job dice por qué |

Qué hace el job, en orden:

1. Comprueba las entradas, que la tarea existe y está pendiente en la rama base y que sus dependencias (`dependsOn`) están en el plan y hechas. Si no, termina sin gastar nada. Elige el modelo del rol Desarrollador: `models.developer` de `.diverger/settings.json`; si no está, la variable `DIVERGER_WORKER_MODEL`, y si tampoco, `claude-sonnet-5-5`.
2. Crea un worktree en la rama de la tarea. Si el repositorio tiene telemetría, entra en GCP con la cuenta de telemetría, arranca el OpenTelemetry Collector en el runner y escribe la configuración gestionada de Claude Code. Descarga el plugin `diverger-dev` del harness con un token de la App que solo lee su contenido.
3. Hasta tres intentos. En cada uno, el modelo construye la tarea con la skill `diverger-dev:implement` (`.github/diverger/worker-modelo.sh`) y después el job, en otro paso y sin la clave de Anthropic, ejecuta `npm run check` (`.github/diverger/worker-comprobar.sh`) en un contenedor de Node que solo ve el worktree: el código del modelo no puede tocar el tope, el coste ni lo que ejecutan los pasos que tienen la clave. Si las comprobaciones fallan, el siguiente intento sigue la misma sesión del modelo con el final de su salida. Cuando las corrige, el modelo resume la causa en una línea «FALLO:».
4. Comprueba el resultado: las comprobaciones en verde, algún cambio y ninguno en `.diverger/` ni en `.github/workflows/`. Entonces el job, no el modelo, marca la tarea como `done`. Si el modelo corrigió unas comprobaciones en rojo, guarda también sus líneas «FALLO:» en `failures` del fichero de la tarea (como mucho tres, de 300 caracteres), igual que el modo interactivo: así `/diverger:run` puede ver que un fallo se repite en dos tareas y proponer la regla (HU-NUC-20, harness#675). En el texto del fichero solo cambian la línea de `status` y, debajo, la de `failures`, como en el modo interactivo: así una PR del plan que cambió en la rama base otro campo de la tarea que no está en la línea de al lado de `status`, como `modules`, se une sin conflicto (harness#728). Si cambió `title` o `story`, que están pegados a `status`, sigue habiendo conflicto, como en cualquier par de cambios en líneas contiguas. Sin cambios solo sigue si el modelo terminó con una línea «YA-CUBIERTA:» que dice qué tarea anterior ya la construyó y qué test cubre cada criterio (harness#538). Entonces el commit es `chore:`, la PR solo marca la tarea y dice arriba, con ese motivo, que hay que revisarlo antes de integrarla.
5. Pide un token de la GitHub App `diverger-harness`, hace el commit con los trailers (`Diverger-Rol`, `Diverger-Modelo`, `Diverger-Tarea`, `Diverger-Iniciado-por` y `Co-authored-by` de quien lo lanzó, con su nombre y su correo noreply de GitHub), empuja la rama y abre la PR. Después activa el auto-merge de la PR: GitHub la integra cuando se cumplen las reglas de `main`, y la política de aprobación del ruleset decide si antes hace falta que una persona la apruebe (ADR 0008 del harness). Si el repositorio no tiene «Allow auto-merge», lo avisa y la PR queda abierta. Quien lo lanzó no es `github.actor` del worker, que es `diverger-harness[bot]` cuando lo lanza el bucle, sino la persona que lanzó el bucle de la iniciativa (`scripts/lanzador.mjs`, con el permiso `actions: read` del job). El job lo averigua al principio, antes del modelo, en el paso «Quién lanzó la ejecución», y lo pasa al commit, a la PR y a la telemetría por las salidas de ese paso; si no se sabe, termina antes de lanzar el modelo y dice por qué. La PR dice «Lanzado por @login».
6. Siempre, también si algo falla o se corta: para el Collector para que mande lo pendiente, escribe el coste del job en el artefacto `diverger-coste` (`coste.json`, con `.github/diverger/worker-coste.sh`), elimina el worktree y escribe el resumen con el resultado, el coste del job, las herramientas denegadas y el estado de las comprobaciones.

**Permisos.** El modelo solo recibe la clave de Anthropic. No tiene ningún token de GitHub: el checkout no guarda credenciales y el token de la App se pide después del worker, con permiso solo para contenido y PR, así que no puede lanzar otros workers ni cambiar workflows. El token del propio job solo lee el contenido y las ejecuciones de Actions (para saber quién lanzó la ejecución). El job tiene `id-token: write` solo para la telemetría: en GCP, la cuenta de telemetría (que solo escribe logs y métricas) solo acepta este workflow y `worker-humo.yml`, y la cuenta de despliegue solo acepta el environment `staging`, que el worker no usa. Así que, aunque pida un token, no puede desplegar. Además, al modelo se le quitan del entorno las variables para pedir tokens de OIDC y las credenciales de GCP. Herramientas: las únicas que existen son `Read`, `Glob`, `Grep`, `Edit`, `Write` y `Skill`, sin `Bash`; las permitidas son leer el repositorio, la skill `diverger-dev:implement` y escribir en `src/`, `web/` y `app/contextos.ts`. Cualquier otra llamada se deniega y el worker sigue sin ella. Las comprobaciones, que ejecutan el código que ha escrito el modelo, corren en otro paso sin la clave de Anthropic ni las variables para pedir tokens de OIDC. Con `--setting-sources user` y `--strict-mcp-config`, el `.claude/settings.json` y el `.mcp.json` del repositorio no pueden añadir permisos, hooks ni servidores MCP. El commit y el push no ejecutan los hooks del repositorio.

**Topes.** El de gasto es del job entero, no de cada intento (HU-EJE-06, ADR 0024 del harness). Vale la entrada `max-usd`; sin ella, la variable `DIVERGER_WORKER_MAX_BUDGET_USD`, y si tampoco, 10 USD. Nunca supera `budget.maxWorkerUsd` de `.diverger/settings.json` de la rama base (10 USD si no está), así que `max-usd` solo puede bajarlo. `--max-budget-usd` no cuenta lo gastado antes de reanudar la sesión, así que cada intento recibe lo que queda del tope; con menos de 0,50 USD no se lanza otro. Los intentos 2 y 3 reanudan la sesión y su coste ya incluye lo anterior: el coste del job es el último, no la suma. Sale de las salidas de los pasos del modelo, que el código de las comprobaciones no puede cambiar; si un intento lanzado no deja coste, no hay `coste.json` y el bucle cuenta el tope entero. El de turnos sí es por intento: `DIVERGER_WORKER_MAX_TURNS` (`--max-turns`, 40). Cada paso del modelo se corta a los 20 minutos, cada paso de comprobaciones a los 15 y el job a los 60.

**Red.** Un runner hospedado de GitHub no permite limitar la salida a internet: no hay cortafuegos de salida configurable. Lo que sí se limita es lo que puede hacer el modelo: sin `WebFetch`, `WebSearch` ni `Bash`, su única conexión es la API de Anthropic, y `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` apaga el tráfico no esencial de Claude Code. Los pasos del propio job (npm, git y la API de GitHub) sí salen a internet, también las comprobaciones, que ejecutan el código del modelo: por eso corren sin la clave de Anthropic. Una lista de destinos permitidos para todo el job necesitaría un runner propio con cortafuegos o una acción de terceros que filtre la salida; queda pendiente.

**Telemetría.** Con las variables `GCP_WIF_PROVIDER`, `GCP_TELEMETRY_SA` y `GCP_PROJECT_ID`, el job manda la telemetría de Claude Code a Cloud Logging y Cloud Monitoring con el Collector de `.github/telemetria/collector.yaml`, y de ahí a BigQuery (ADR 0007 del harness). Las variables del exportador van en la configuración gestionada (`/etc/claude-code/managed-settings.json`, a partir de `.github/telemetria/managed-settings.json`), porque Claude Code no las acepta del repositorio; el texto de los prompts, las respuestas y las herramientas no se manda. Los eventos llevan `github.run_id`, `diverger.task`, `diverger.run` y `diverger.lanzado_por`, la persona que lanzó la ejecución (EN-OPS-07). Sin esas variables, el job se salta la telemetría. El repositorio tiene que estar en `REPOS` de `infra/entornos/gcp.sh` del harness para que GCP acepte el token.

Necesita, en el repositorio de la aplicación, el secreto `ANTHROPIC_API_KEY`, la variable `DIVERGER_HARNESS_APP_ID`, el secreto `DIVERGER_HARNESS_APP_KEY` y la App `diverger-harness` instalada en el repositorio y en el harness, con lectura de contenido en este (`infra/entornos/LEEME.md` del harness). `test/reglas/worker.test.ts` comprueba la forma del workflow y ejecuta con bash los pasos y los scripts que no necesitan GitHub, con un `claude` y un `npm` de mentira.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Todo lo que comprueba el CI, salvo la imagen y los análisis de seguridad |
| `npm run gen` | Genera los tipos desde los contratos |
| `npm run dev` | Frontend con recarga en el puerto 5173; las peticiones a `/api` van al servidor del puerto 8080 |
| `npm run build` | Construye el frontend en `dist/web` y el servidor en `dist/server` |
| `npm start` | Arranca el servidor construido |

## Infraestructura como código

`infra/` describe con [OpenTofu](https://opentofu.org) lo que necesita la aplicación en GCP, todo con el nombre de la aplicación y en `europe-west1` (ADR 0013 del harness):

| Fichero | Qué describe |
|---|---|
| `cloud_run.tf` | El servicio de Cloud Run: cuenta de ejecución, escala de 0 a 2 instancias, 1 CPU y 512 MiB, sonda de arranque en `/api/salud` y las variables `FIRESTORE_DATABASE` y `GOOGLE_CLIENT_ID` |
| `firestore.tf` | Una base de Firestore propia de la aplicación (nativa, con transacciones pesimistas), sus índices compuestos y el permiso de la cuenta de ejecución sobre esa base y ninguna otra |
| `firestore.indexes.json` | Los índices compuestos, en el formato de Firebase. La plantilla no trae ninguno: los añade el arquitecto cuando una consulta los pide |
| `artifact_registry.tf` | El repositorio de imágenes, que conserva las 10 versiones más recientes y borra las imágenes sin etiqueta de más de 7 días |
| `cloud_deploy.tf` | La cadena de Cloud Deploy de la aplicación, con un único destino: su Cloud Run de staging. Cloud Deploy despliega con su propia cuenta (`cuenta_cloud_deploy`) y guarda lo que genera en el almacén del proyecto (`almacen_cloud_deploy`) |
| `staging.tfvars` y `staging.gcs.tfbackend` | Los valores de staging en el proyecto de pruebas y dónde se guarda su estado. Una aplicación nueva cambia `aplicacion` y el prefijo por su nombre y puede añadir sus propias variables de entorno en `variables_entorno`, por ejemplo `variables_entorno = { CORREOS_IT = "ana@empresa.com" }`. No son secretos y no pueden cambiar `FIRESTORE_DATABASE`, `GOOGLE_CLIENT_ID` ni `PORT` |

La imagen del servicio es del despliegue continuo: la infraestructura crea el servicio con una imagen de ejemplo de Google y no vuelve a tocarla. El despliegue solo cambia la imagen (ver *Despliegue en staging*); cualquier otro cambio en el servicio se hace en `infra/`.

### Aplicar

Hace falta OpenTofu 1.12 o posterior (`winget install OpenTofu.Tofu` en Windows) y la sesión de gcloud de quien aplica, con permisos sobre el proyecto (`gcloud auth application-default login`). No hay ficheros de claves: el proveedor usa esa sesión. El estado se guarda en el bucket de `staging.gcs.tfbackend`, que tiene que existir antes.

```sh
cd infra
tofu init "-backend-config=staging.gcs.tfbackend"
tofu plan "-var-file=staging.tfvars"
tofu apply "-var-file=staging.tfvars"
```

Las comillas hacen falta en PowerShell: sin ellas parte por el punto un argumento que empieza por `-`, y `tofu init` pide el bucket a mano. En bash no cambian nada.

`infra/.terraform.lock.hcl` fija las sumas del proveedor y se versiona: así todos aplican con el mismo proveedor. `tofu init -upgrade` lo actualiza cuando se sube la versión en `versions.tf`.

Al terminar, `tofu output` da la URL del servicio, la ruta del repositorio de imágenes y el nombre de la base.

### Detectar la deriva

Un cambio hecho a mano (en la consola o con gcloud) es deriva: el servicio ya no es lo que dice el código. `tofu plan -detailed-exitcode` la enseña y termina con el código 2; con el código 0 no hay ninguna. `tofu apply` la revierte al estado descrito en `infra/`.

```sh
tofu plan "-var-file=staging.tfvars" -detailed-exitcode
tofu apply "-var-file=staging.tfvars"
```

Solo la imagen y la revisión del servicio, que cambia el despliegue, quedan fuera de esa comprobación.

### Pruebas sin tocar GCP

El job `infraestructura` del CI comprueba primero el mínimo privilegio en GCP con `scripts/iam.mjs` (EN-GP-05 del harness). Falla con «serviceAccountUser debe concederse solo sobre la cuenta de ejecución, no a nivel de proyecto» si `roles/iam.serviceAccountUser` aparece en `infra/` fuera de un `google_service_account_iam_member` o `_binding`, el único sitio donde se limita a una cuenta concreta: en otro recurso, en `locals`, en una variable, en un `for_each`, en un `data` o en un heredoc. Falla también con un rol básico (Editor, Owner o Viewer) en cualquier sitio, con una política completa (`google_*_iam_policy`), que sustituye la política entera del proyecto, con un rol de un recurso de IAM del proyecto que no sea una cadena literal, como `local.rol` o `each.value`, y con un `.tf.json` o `.tofu.json`. Los `.tofu` se revisan como los `.tf`. La plantilla no concede serviceAccountUser: lo hace `infra/entornos/gcp.sh` del harness, solo sobre la cuenta de ejecución, y esto impide que la aplicación lo deshaga. Lee el texto, no el plan, así que un rol que llega de un módulo externo no lo ve. Después pasa `tofu fmt -check`, `tofu validate` y `tofu test`, y después `terraform init`, `terraform validate` y `terraform test` sobre una copia de `infra/` sin el fichero de bloqueo, que es el de OpenTofu: así vigila la regla de portabilidad del ADR 0013 del harness (solo lo que entienden OpenTofu y Terraform; nada de variables en el bloque `backend`, `enabled` ni otras funciones propias de OpenTofu). Las pruebas de `infra/tests/` comprueban el plan con el proveedor simulado: qué recursos se crean, con qué nombre y en qué región, la cuenta de ejecución, el permiso limitado a la base, la protección de borrado y los índices. `test/reglas/infraestructura.test.ts` comprueba además que no hay credenciales ni estado en el repositorio y que la deriva solo ignora la imagen, la revisión y las etiquetas que Cloud Deploy pone en cada revisión. En local, desde `infra/`: `tofu init -backend=false` y `tofu test`.

## Despliegue en staging

Al integrar un PR en `main`, el job `despliegue` de `ci.yml` lleva la aplicación al Cloud Run de staging (EN-FM-04, ADR 0015 del harness):

1. Espera a que pasen `calidad`, `imagen` e `infraestructura`, y toma la imagen que `imagen` construyó y analizó con Trivy: se despliega esa y no otra.
2. Entra en GCP con Workload Identity Federation, sin claves, como la cuenta de despliegue (`GCP_DEPLOY_SA`).
3. Sube la imagen a Artifact Registry, etiquetada con el commit, y la despliega por su digest.
4. Crea una versión en la cadena de Cloud Deploy de la aplicación. El manifiesto es el del servicio tal como está en staging, con la imagen nueva y sin nada más: el resto del servicio lo describe `infra/`.
5. Espera a que Cloud Deploy termine y comprueba que staging sirve la imagen nueva y que `/api/salud` responde. La URL queda en el environment `staging` del repositorio.

El proyecto, la región, el nombre de la aplicación y el almacén de Cloud Deploy salen de `infra/staging.tfvars`, el mismo fichero que usa la infraestructura.

**Quién puede desplegar.** La cuenta de despliegue solo acepta tokens de los jobs del environment `staging` de los repositorios autorizados, y ese environment solo admite `main`. Un worker corre en su propio job, fuera del environment: aunque pida un token de GitHub (lo necesita para la telemetría), GCP no le deja usar la cuenta de despliegue. Además, la identidad del harness no puede cambiar los workflows.

**Sin despliegue configurado,** el job no corre y el pipeline termina con el PR integrado. Para configurarlo en un repositorio creado desde la plantilla, una persona con permisos sobre el proyecto de GCP:

1. Añade el repositorio a `DEPLOY_REPOS` y vuelve a ejecutar `infra/entornos/gcp.sh` del harness, que lo autoriza en la cuenta de despliegue solo desde su environment `staging`.
2. Aplica `infra/` (*Aplicar*): crea, además del servicio, la cadena de Cloud Deploy.
3. Crea el environment `staging`, limitado a `main`, con `infra/github/entorno-staging.sh <propietario>/<aplicacion>` del harness.
4. Da al repositorio las variables `GCP_WIF_PROVIDER` y `GCP_DEPLOY_SA` (no son secretos), con los valores que imprime `gcp.sh`.

Para volver a desplegar `main` sin un commit nuevo: *Actions → ci → Run workflow* sobre `main`.



El servidor necesita la variable `GOOGLE_CLIENT_ID`, el ID de un cliente OAuth de tipo «Aplicación web» de Google Cloud, con la URL de la aplicación entre los orígenes de JavaScript autorizados. El frontend lo pide a `/api/config`, así que la misma imagen sirve en cualquier entorno. Cada petición a `/api` lleva el token en `Authorization: Bearer <token>`. Solo `/api/salud` y `/api/config` son públicas. Sin `GOOGLE_CLIENT_ID` la aplicación arranca igual, con el inicio de sesión cerrado: el resto de `/api` responde 503 «Inicio de sesión sin configurar.» y el frontend lo muestra. Así se puede desplegar antes de crear el cliente OAuth. En staging, el ID va en `google_client_id` de `infra/staging.tfvars`: lo usan las personas para iniciar sesión y el validador de `diverger-quality`, que llama a la API con un token de identidad de su cuenta de servicio emitido para esa audiencia (EN-FM-03, ADR 0020 del harness). Cualquier cuenta de Google con el correo verificado entra en la API, también esa cuenta de servicio: la aplicación no tiene lista de personas autorizadas.
