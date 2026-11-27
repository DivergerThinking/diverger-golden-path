# Sistema de diseño de la aplicación (`web/kit/`)

Todas las pantallas de la aplicación se dibujan con estos componentes, para que se parezcan entre sí y sean accesibles sin depender de quien las escribe ([ADR 0058 del harness](https://github.com/DivergerThinking/Diverger-ExP-Harness/blob/main/docs/adr/0058-sistema-de-diseno-por-defecto.md)). Por dentro son [React Aria Components](https://react-spectrum.adobe.com/react-aria/components.html), que pone las etiquetas, el teclado y los anuncios a los lectores de pantalla; por fuera tienen su propia interfaz, que es el contrato del kit.

Una pantalla importa siempre de `web/kit/index.js`, nunca de `react-aria-components`, y no escribe estilos propios: el aspecto lo ponen los tokens.

```tsx
import { Aviso, Boton, Campo, Formulario } from "../kit/index.js";
```

## Cómo cambiar el aspecto

- **Solo los colores, la fuente o los espacios:** se cambia `tokens.css`. `kit.css` usa solo sus variables, así que ni el kit ni las pantallas cambian. `tokens.test.tsx` comprueba que cada texto contrasta con su fondo (WCAG AA) en los dos temas.
- **El kit entero:** se puede sustituir por otro siempre que `index.ts` exporte los mismos componentes con las mismas propiedades. Las lista `contrato.ts`, y `contrato.test.tsx` falla nombrando el componente y la propiedad que falten.

El tema oscuro, el de Diverger, va por defecto. El claro se aplica con la preferencia del sistema o con `data-tema="claro"` en `<html>`.

## Componentes

**Pagina y Menu.** La página con su título y el menú de pantallas. `App.tsx` ya los usa: una pantalla empieza en su `<section>` con su `<h2>`.

```tsx
<Pagina titulo="Préstamos" menu={<Menu etiqueta="Pantallas" opciones={[{ id: "pedir", texto: "Pedir" }]} actual="pedir" alElegir={abrir} />}>
  …
</Pagina>
```

**Boton.** `variante` es `primario` (la acción principal), `secundario` (por defecto) o `peligro`. `enviar` lo hace enviar su formulario.

```tsx
<Boton variante="primario" enviar desactivado={enviando}>Pedir</Boton>
<Boton alPulsar={cancelar}>Cancelar</Boton>
```

**Formulario y Campo.** El campo lleva su etiqueta unida (se encuentra con `getByLabelText`), su descripción y su error, que lo marca como no válido y se anuncia.

```tsx
<Formulario etiqueta="Pedir un equipo" alEnviar={pedir}>
  <Campo etiqueta="Fecha de devolución" tipo="date" valor={fecha} alCambiar={setFecha} error={errorFecha} obligatorio />
  <Boton variante="primario" enviar>Pedir</Boton>
</Formulario>
```

**Selector.** Un desplegable con su etiqueta. `valor` es el id elegido o `null`.

```tsx
<Selector etiqueta="Equipo" opciones={equipos.map((e) => ({ id: e.id, texto: e.nombre }))} valor={equipo} alCambiar={setEquipo} />
```

**Tabla y ListaVacia.** La tabla necesita su `etiqueta`; la primera columna nombra cada fila. Sin filas enseña `vacia`. `ListaVacia` sirve para cualquier otra lista sin nada.

```tsx
<Tabla etiqueta="Préstamos vencidos" columnas={[{ id: "equipo", titulo: "Equipo" }, { id: "fecha", titulo: "Vence" }]} filas={filas} vacia="No hay préstamos vencidos." />
```

**Aviso.** `error` se anuncia en el momento (`role="alert"`); `exito` e `info`, cuando el lector termina (`role="status"`). El mensaje de error de la API se enseña tal cual.

```tsx
{error && <Aviso tipo="error">{error}</Aviso>}
{hecho && <Aviso tipo="exito">Préstamo registrado.</Aviso>}
```

**EtiquetaEstado.** El estado de algo. El texto lo dice todo; el `tono` (`neutro`, `exito`, `error`) solo acompaña.

```tsx
<EtiquetaEstado texto="Vencido" tono="error" />
```

**DialogoConfirmacion.** Antes de una acción que no se deshace. Escape o «Cancelar» lo cierran sin hacer nada.

```tsx
<DialogoConfirmacion abierto={confirmando} titulo="¿Borrar el equipo?" mensaje="No se puede deshacer." textoConfirmar="Borrar" alConfirmar={borrar} alCancelar={() => setConfirmando(false)} />
```

## Tests

`componentes.test.tsx` prueba cada componente por su rol y su nombre y pasa `axe-core` sin fallos. Las pantallas se prueban igual, con Testing Library, como `web/ejemplo/Saludo.test.tsx`. El contraste en la pantalla real lo comprueban las pruebas de navegador en staging.
