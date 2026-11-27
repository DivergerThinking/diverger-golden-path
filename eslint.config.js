// Lint de todo el repo: TypeScript con reglas de tipos y React con las reglas de hooks.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "src/*/api.gen.ts", "app/contextos.gen.ts", "web/pantallas.gen.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: reactHooks.configs.recommended.rules,
  },
  // Las pantallas usan solo el sistema de diseño (ADR 0058 del harness, EN-GP-14): en web/<id>/ no hay estilos propios
  // ni elementos que ya cubre web/kit/, y nada importa react-aria-components ni una hoja de estilos. web/kit/ sí.
  {
    files: ["web/*/**/*.{ts,tsx}"],
    ignores: ["web/kit/**", "web/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='style']",
          message: "Una pantalla no lleva estilos propios: usa los componentes de web/kit/ (ADR 0058).",
        },
        {
          selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea|form|label|table|dialog)$/]",
          message: "Este elemento lo cubre web/kit/: usa su componente (Boton, Campo, Selector, Formulario, Tabla o DialogoConfirmacion), que ya es accesible (ADR 0058).",
        },
        {
          selector: "ImportDeclaration[source.value=/\\.(css|scss|sass|less)$/]",
          message: "Una pantalla no trae hojas de estilo propias: el aspecto lo ponen los tokens de web/kit/ (ADR 0058).",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react-aria-components", "react-aria-components/*", "react-aria", "react-aria/*"],
              message: "Las pantallas importan web/kit/, nunca la biblioteca que lleva dentro: así un cliente puede cambiar el kit (ADR 0058).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
);
