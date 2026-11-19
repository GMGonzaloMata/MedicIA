# Diseño visual de la plataforma

## Objetivo

Mantener una interfaz **moderna, elegante y profesional** para el análisis de estudios médicos con IA. Debe transmitir confianza, precisión y claridad, con **modo claro y oscuro** y la misma identidad visual en ambos.

## Estilo general

- **Temas:** claro y oscuro, con opción de selección por el usuario y respeto de la preferencia del sistema.
- **Estética:** minimalista, sobria y tecnológica; sin neón ni gradientes llamativos.
- **Jerarquía:** superficies diferenciadas, bordes discretos y espaciado consistente.
- **Usabilidad:** priorizar legibilidad de resultados, gráficos y datos clínicos; diseño adaptable a escritorio, tablet y móvil.

## Paleta de colores

### Identidad compartida

- **Principal (teal):** `#0D9488`.
- **Acento secundario (azul):** `#3B82F6`.
- **Interacción y foco:** utilizar una variante de teal con contraste adecuado en cada tema.

### Modo oscuro

- **Fondo:** `#0B0F15`.
- **Paneles:** `#111722`.
- **Tarjetas y tablas:** `#18202F`.
- **Elementos elevados:** `#1E293B`.
- **Texto principal:** `#F1F5F9`.
- **Texto secundario:** `#94A3B8`.
- **Bordes:** `rgba(255, 255, 255, 0.07)`.

### Modo claro

- **Fondo:** `#FFFFFF`.
- **Paneles:** `#F8FAFC`.
- **Tarjetas y tablas:** `#FFFFFF`.
- **Elementos elevados:** `#F1F5F9`.
- **Texto principal:** `#0F172A`.
- **Texto secundario:** `#475569`.
- **Bordes:** `#E2E8F0`.

*La paleta clara es una adaptación de la identidad creada por Stitch; la referencia original detallaba principalmente el modo oscuro.*

### Colores semánticos

- **Error o alerta:** rojo (`#EF4444` como referencia).
- **Advertencia o incertidumbre:** ámbar (`#F59E0B` como referencia).
- **Éxito o validación:** verde (`#10B981` como referencia).

Adaptar tonos, texto y fondos de estos estados para mantener contraste en ambos modos. Un hallazgo sugerido por IA **no debe presentarse como diagnóstico confirmado**.

## Tipografía

- **Plus Jakarta Sans:** títulos y textos generales.
- **Inter:** etiquetas, fechas, métricas y tablas.
- **Títulos principales:** 36 px en escritorio y 28 px en móvil.
- **Texto general:** 14–16 px.
- **Datos numéricos:** cifras tabulares para alinear valores.

## Componentes y espaciado

- **Botones:** teal como acento principal, con estados hover y foco visibles en ambos temas.
- **Tarjetas y formularios:** usar superficies y bordes propios del tema activo.
- **Estados e indicadores:** combinar color con texto o iconos; evitar depender solo del color.
- **Bordes redondeados:** 4 px en controles, 8 px en tarjetas y 12 px en paneles y diálogos.
- **Espaciado:** escala consistente basada en 4 y 8 px.
- **Gráficos y resultados:** etiquetas, unidades y contrastes legibles en ambos modos.

## Diseño responsivo

- La interfaz debe ser **totalmente responsiva** y adaptarse a móviles, tablets, notebooks y monitores de escritorio, sin perder funcionalidad.
- Usar layouts fluidos y breakpoints según el contenido; evitar anchos fijos que provoquen desplazamiento horizontal.
- Reorganizar navegación, formularios, tarjetas, tablas y paneles según el espacio disponible.
- Mantener gráficos y visores de estudios legibles y utilizables en pantallas pequeñas, con zoom o desplazamiento interno cuando corresponda.
- Garantizar controles táctiles accesibles y comprobar ambos temas en distintos tamaños de pantalla.

## Reglas de diseño

1. Ofrecer **modo claro, oscuro y preferencia del sistema**, manteniendo la elección del usuario.
2. Definir colores mediante **tokens semánticos** (`background`, `foreground`, `card`, `border`, `primary`, etc.), no colores fijos dispersos en componentes.
3. Mantener el mismo diseño funcional y jerarquía visual en ambos temas.
4. Evitar colores saturados y efectos que distraigan de la información médica.
5. Garantizar contraste suficiente, navegación por teclado y estados de foco visibles.
6. Reutilizar componentes y tokens; no duplicar pantallas para implementar los temas.
7. Verificar que todas las vistas funcionen correctamente en móvil, tablet y escritorio, sin desbordes ni pérdida de información.

## Adaptación del marco protegido (Dark Tech)

- Referencia visual: dashboard suministrado en `code.html` y `screen.png` del proyecto Stitch
  `343470474446151314`; la imagen/HTML prevalecen sobre las paletas divergentes de `DESIGN.md`.
- Superficies oscuras implementadas: fondo `#0C1017`, panel `#0F141D`, tarjeta `#131924` y
  elevado `#1B2333`. Sustituyen los valores oscuros anteriores de esta guía para esos cuatro roles.
- El marco usa `--workspace-border` (`rgba(38, 51, 70, 0.7)` en oscuro),
  `--workspace-accent` (`#5EEAD4`) y `--workspace-accent-surface` (`rgba(4, 47, 46, 0.5)`).
  El acento de texto se adapta para legibilidad; los botones compartidos conservan sus tokens.
- Navegación lateral de 288 px desde 1024 px; por debajo se presenta arriba, con enlaces visibles
  que se reorganizan sin menú desplegable. La clínica y el vínculo reales permanecen visibles.
- Inicio conserva el contexto y los accesos por rol; no replica métricas, pacientes, marcas ni
  capacidades ficticias de la referencia. Tarjetas compactas de 8 px de radio, sin brillo ni sombras.
- Se conservan Plus Jakarta Sans/Inter y la preferencia automática del sistema, sin selector nuevo.
  Los tokens claros permanecen; los nuevos tokens del marco tienen equivalentes claros.
- Carga, listas de estudios/pacientes y contenedor de análisis reutilizan esas superficies y radios.
  Las tablas conservan su variante móvil, con cabecera en superficie panel y filas con hover elevado;
  metadatos y separadores agrupan el resultado sin cambiar hallazgos, estados ni advertencias clínicas.
- Esta adaptación describe la implementación, no una validación visual o de accesibilidad en runtime.

## Alcance

Este documento define la **identidad visual y las reglas generales de interfaz**. El negocio, la arquitectura y los patrones de diseño se documentan por separado.
