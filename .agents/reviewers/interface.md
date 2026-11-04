# Revisión de interfaz y lenguaje clínico

Comprobá que la interfaz sea consistente, accesible y que no presente resultados de IA como diagnósticos. Si la skill `web-design-guidelines` está disponible, usala como referencia adicional. Si no podés obtener sus guías, seguí con este documento e indicalo en tu respuesta.

Documentos de referencia: los principios I y VII de la constitución, `memory/design.md` y la sección "Componentes" de `memory/coding-standards.md`.

## Qué comprobar

- **Lenguaje clínico:** los resultados se presentan como posibles hallazgos, sin afirmar diagnósticos ni precisión o validación clínica sin evidencia.
- **Textos:** están en español, con mayúscula inicial solo en la primera palabra, salvo nombres propios y siglas.
- **Tokens:** los colores salen de tokens semánticos, sin valores fijos dispersos en los componentes.
- **Temas:** la vista funciona en modo claro, oscuro y preferencia del sistema, sin pantallas duplicadas.
- **Responsive:** funciona en móvil, tablet y escritorio, sin desbordes ni pérdida de información.
- **Accesibilidad:** hay contraste suficiente, navegación por teclado, foco visible y estados que no dependen solo del color.
- **Estados:** se manejan la carga, el error y los datos vacíos cuando la vista los requiere, además de `PENDING`, `PROCESSING`, `COMPLETED` y `FAILED` donde se muestren.
- **Componentes:** son Server Components por defecto, usan `'use client'` solo cuando hace falta y reciben únicamente los campos que necesitan.
- **Reutilización:** se aprovechan los componentes existentes y no se duplica interfaz sin necesidad.
