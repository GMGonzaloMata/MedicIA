import { existsSync, readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const MODULES_DIRECTORY = "src/modules";

// Los módulos se detectan solos para que uno nuevo no quede sin protección por olvido.
const moduleNames = existsSync(MODULES_DIRECTORY)
  ? readdirSync(MODULES_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

const EXTERNAL_SERVICES = ["@prisma/*", "@aws-sdk/*"];
const FRAMEWORKS = ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"];
const INFRASTRUCTURE = ["**/infrastructure", "**/infrastructure/**"];
const COMPOSITION = ["**/composition"];
const APPLICATION = ["**/application", "**/application/**"];
const PRESENTATION = ["@/app/**", "@/components/**"];

const restrict = (group, message) => ({ group, message });

const frameworkAndServicePattern = restrict(
  [...FRAMEWORKS, ...EXTERNAL_SERVICES],
  "El núcleo no depende de Next.js, React, Prisma ni SDK de AWS: usá un puerto.",
);

// Otro módulo solo se usa por sus puertos de entrada. Cada `composition.ts` puede además
// importar el `composition.ts` de otro módulo, porque ahí se conectan los casos de uso.
// Se usa una expresión regular porque una excepción con `!` no aplica dentro de una carpeta excluida.
const otherModulesPattern = (moduleName, { allowComposition = false } = {}) => {
  const otherNames = moduleNames.filter((otherName) => otherName !== moduleName);
  if (otherNames.length === 0) {
    return null;
  }

  const composition = allowComposition ? "" : "|composition";

  return {
    regex: `(^|/)(${otherNames.join("|")})/(domain|infrastructure|application(?!/ports/in(/|$))${composition})(/|$)`,
    message: "Otro módulo solo se usa mediante sus puertos de entrada.",
  };
};

const restrictImports = (files, patterns) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: patterns.filter(Boolean) }],
  },
});

const moduleLayerRules = moduleNames.flatMap((moduleName) => {
  const otherModules = otherModulesPattern(moduleName);

  return [
    restrictImports([`src/modules/${moduleName}/domain/**`], [
      frameworkAndServicePattern,
      restrict(
        [...APPLICATION, ...INFRASTRUCTURE, ...COMPOSITION, ...PRESENTATION],
        "El dominio no depende de las capas externas.",
      ),
      otherModules,
    ]),
    restrictImports([`src/modules/${moduleName}/application/**`], [
      frameworkAndServicePattern,
      restrict(
        [...INFRASTRUCTURE, ...COMPOSITION, ...PRESENTATION],
        "La aplicación depende de puertos; las implementaciones se inyectan en composition.ts.",
      ),
      otherModules,
    ]),
    restrictImports([`src/modules/${moduleName}/infrastructure/**`], [otherModules]),
    restrictImports([`src/modules/${moduleName}/composition.ts`], [
      otherModulesPattern(moduleName, { allowComposition: true }),
    ]),
  ];
});

const presentationRule = restrictImports(["src/app/**", "src/components/**"], [
  restrict(
    [...EXTERNAL_SERVICES, ...INFRASTRUCTURE],
    "La interfaz obtiene los casos de uso de composition.ts.",
  ),
]);

const BASE_NAMING_RULES = [
  { selector: "default", format: ["camelCase"] },
  { selector: "import", format: null },
  { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"] },
  { selector: "function", format: ["camelCase", "PascalCase"] },
  { selector: "typeLike", format: ["PascalCase"] },
  { selector: "enumMember", format: ["UPPER_CASE"] },
  { selector: "objectLiteralProperty", format: ["camelCase", "UPPER_CASE"] },
  // Lo desestructurado y las claves entre comillas conservan el nombre que define el dato externo.
  { selector: ["variable", "parameter"], modifiers: ["destructured"], format: null },
  {
    selector: ["objectLiteralProperty", "typeProperty"],
    modifiers: ["requiresQuotes"],
    format: null,
  },
];

// Entre reglas con el mismo selector gana la primera, por eso las excepciones van adelante.
const namingRule = (files, exceptions = []) => ({
  files,
  rules: {
    "@typescript-eslint/naming-convention": ["error", ...exceptions, ...BASE_NAMING_RULES],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  namingRule(["**/*.{ts,tsx}"]),
  // Los SDK de AWS definen sus parámetros en PascalCase.
  namingRule(["src/**/infrastructure/**/*.ts"], [
    { selector: "objectLiteralProperty", format: null },
  ]),
  presentationRule,
  ...moduleLayerRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Herramientas de terceros para los agentes:
    ".agents/**",
    ".claude/**",
    ".specify/**",
    // Reportes generados por las pruebas:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
