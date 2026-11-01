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

1. Cambia `@joselcs` por el titular de la aplicación en `.github/CODEOWNERS`.
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
- **La configuración del harness tiene dueño.** `.github/CODEOWNERS` hace al titular propietario de `.diverger/settings.json` (el modo de autonomía, entre otras cosas) y del propio CODEOWNERS. `node scripts/codeowners.mjs` falla si dejan de estar cubiertos, por ejemplo con una regla posterior sin propietarios. Con el ruleset `codeowners`, ni un agente ni nadie con escritura los cambia sin la aprobación del titular, también en modo yolo.
- **Seguridad en cada PR**, los cuatro análisis del diseño del harness:
  - código fuente (SAST) con CodeQL (`codeql.yml`);
  - dependencias con vulnerabilidades conocidas (SCA) con `npm audit` (`ci.yml`);
  - secretos con gitleaks (`secretos.yml`);
  - imagen del contenedor con Trivy (`ci.yml`).

## Bucle desatendido

`.github/workflows/diverger-bucle.yml` construye el plan de una iniciativa sin una sesión abierta (HU-EJE-01, ADR 0016 del harness). Se lanza a mano, con la iniciativa:

```sh
gh workflow run diverger-bucle.yml -f initiative=<iniciativa> [-f max-workers=1] [-f restart=true]
```

Es un programa sin modelo, `bucle.py` del núcleo, que el job descarga del harness con un token de la GitHub App de solo lectura. En cada vuelta actualiza la rama base, mira el job y la PR de cada worker y lanza `diverger-worker.yml` para las siguientes tareas listas, de una en una por defecto. Se para cuando todas las tareas están hechas, una falla tres veces, se agota el presupuesto de pasos o una espera su test de aceptación; el resumen del job dice por qué. Si se relanza, reanuda sin repetir lo hecho. `restart` levanta una parada por bloqueo o por presupuesto.

Necesita la GitHub App `diverger-harness` instalada en este repositorio (Actions: escritura, Contents y Pull requests: lectura) y en el harness (Contents: lectura), con las variables `DIVERGER_HARNESS_APP_ID` y el secreto `DIVERGER_HARNESS_APP_KEY`. La variable `DIVERGER_HARNESS_REF` fija la versión del núcleo (por defecto, `main`).

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
| **Lanzamiento** | `workflow_dispatch` en la rama base con las entradas `initiative`, `task` y `run` (el identificador de la ejecución del bucle) |
| **Nombre del job** | `diverger-worker <task> <run>` |
| **Rama y PR** | Rama `diverger/<iniciativa>/<tarea>`; la PR lleva `<!-- diverger:task=<tarea>;run=<run> -->` e incluye el código de la tarea y `tasks/<tarea>.json` en `done` |
| **Resultado** | Éxito: el job termina con una PR abierta. Fallo: termina sin PR y el resumen del job dice por qué |

Qué hace el job, en orden:

1. Comprueba las entradas, que la tarea existe y está pendiente en la rama base y que sus dependencias (`dependsOn`) están en el plan y hechas. Si no, termina sin gastar nada. Elige el modelo del rol Desarrollador: `models.developer` de `.diverger/settings.json`; si no está, la variable `DIVERGER_WORKER_MODEL`, y si tampoco, `claude-sonnet-5-5`.
2. Crea un worktree en la rama de la tarea. Si el repositorio tiene telemetría, entra en GCP con la cuenta de telemetría, arranca el OpenTelemetry Collector en el runner y escribe la configuración gestionada de Claude Code. Descarga el plugin `diverger-dev` del harness con un token de la App que solo lee su contenido.
3. Hasta tres intentos. En cada uno, el modelo construye la tarea con la skill `diverger-dev:implement` (`.github/diverger/worker-modelo.sh`) y después el job, en otro paso y sin la clave de Anthropic, ejecuta `npm run check` (`.github/diverger/worker-comprobar.sh`). Si las comprobaciones fallan, el siguiente intento sigue la misma sesión del modelo con el final de su salida.
4. Comprueba el resultado: las comprobaciones en verde, algún cambio y ninguno en `.diverger/` ni en `.github/workflows/`. Entonces el job, no el modelo, marca la tarea como `done`.
5. Pide un token de la GitHub App `diverger-harness`, hace el commit con los trailers (`Diverger-Rol`, `Diverger-Modelo`, `Diverger-Tarea`, `Diverger-Iniciado-por` y `Co-authored-by` de quien lo lanzó), empuja la rama y abre la PR.
6. Siempre, también si algo falla o se corta: para el Collector para que mande lo pendiente, elimina el worktree y escribe el resumen con el resultado, el coste de todos los intentos, las herramientas denegadas y el estado de las comprobaciones.

**Permisos.** El modelo solo recibe la clave de Anthropic. No tiene ningún token de GitHub: el checkout no guarda credenciales y el token de la App se pide después del worker, con permiso solo para contenido y PR, así que no puede lanzar otros workers ni cambiar workflows. El token del propio job solo lee el contenido. El job tiene `id-token: write` solo para la telemetría: en GCP, la cuenta de telemetría (que solo escribe logs y métricas) solo acepta este workflow y `worker-humo.yml`, y la cuenta de despliegue solo acepta el environment `staging`, que el worker no usa. Así que, aunque pida un token, no puede desplegar. Además, al modelo se le quitan del entorno las variables para pedir tokens de OIDC y las credenciales de GCP. Herramientas: las únicas que existen son `Read`, `Glob`, `Grep`, `Edit`, `Write` y `Skill`, sin `Bash`; las permitidas son leer el repositorio, la skill `diverger-dev:implement` y escribir en `src/`, `web/` y `app/contextos.ts`. Cualquier otra llamada se deniega y el worker sigue sin ella. Las comprobaciones, que ejecutan el código que ha escrito el modelo, corren en otro paso sin la clave de Anthropic ni las variables para pedir tokens de OIDC. Con `--setting-sources user` y `--strict-mcp-config`, el `.claude/settings.json` y el `.mcp.json` del repositorio no pueden añadir permisos, hooks ni servidores MCP. El commit y el push no ejecutan los hooks del repositorio.

**Topes.** Por intento del modelo, variables del repositorio: `DIVERGER_WORKER_MAX_BUDGET_USD` (`--max-budget-usd`, 2.00 USD) y `DIVERGER_WORKER_MAX_TURNS` (`--max-turns`, 40). Cada paso del modelo se corta a los 20 minutos, cada paso de comprobaciones a los 15 y el job a los 60.

**Red.** Un runner hospedado de GitHub no permite limitar la salida a internet: no hay cortafuegos de salida configurable. Lo que sí se limita es lo que puede hacer el modelo: sin `WebFetch`, `WebSearch` ni `Bash`, su única conexión es la API de Anthropic, y `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` apaga el tráfico no esencial de Claude Code. Los pasos del propio job (npm, git y la API de GitHub) sí salen a internet, también las comprobaciones, que ejecutan el código del modelo: por eso corren sin la clave de Anthropic. Una lista de destinos permitidos para todo el job necesitaría un runner propio con cortafuegos o una acción de terceros que filtre la salida; queda pendiente.

**Telemetría.** Con las variables `GCP_WIF_PROVIDER`, `GCP_TELEMETRY_SA` y `GCP_PROJECT_ID`, el job manda la telemetría de Claude Code a Cloud Logging y Cloud Monitoring con el Collector de `.github/telemetria/collector.yaml`, y de ahí a BigQuery (ADR 0007 del harness). Las variables del exportador van en la configuración gestionada (`/etc/claude-code/managed-settings.json`, a partir de `.github/telemetria/managed-settings.json`), porque Claude Code no las acepta del repositorio; el texto de los prompts, las respuestas y las herramientas no se manda. Los eventos llevan `github.run_id`, `diverger.task` y `diverger.run`. Sin esas variables, el job se salta la telemetría. El repositorio tiene que estar en `REPOS` de `infra/entornos/gcp.sh` del harness para que GCP acepte el token.

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
| `staging.tfvars` y `staging.gcs.tfbackend` | Los valores de staging en el proyecto de pruebas y dónde se guarda su estado. Una aplicación nueva cambia `aplicacion` y el prefijo por su nombre |

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

El job `infraestructura` del CI pasa `tofu fmt -check`, `tofu validate` y `tofu test`, y después `terraform init`, `terraform validate` y `terraform test` sobre una copia de `infra/` sin el fichero de bloqueo, que es el de OpenTofu: así vigila la regla de portabilidad del ADR 0013 del harness (solo lo que entienden OpenTofu y Terraform; nada de variables en el bloque `backend`, `enabled` ni otras funciones propias de OpenTofu). Las pruebas de `infra/tests/` comprueban el plan con el proveedor simulado: qué recursos se crean, con qué nombre y en qué región, la cuenta de ejecución, el permiso limitado a la base, la protección de borrado y los índices. `test/reglas/infraestructura.test.ts` comprueba además que no hay credenciales ni estado en el repositorio y que la deriva solo ignora la imagen, la revisión y las etiquetas que Cloud Deploy pone en cada revisión. En local, desde `infra/`: `tofu init -backend=false` y `tofu test`.

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
