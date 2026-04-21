# TCEE Study Hub

Base React/Vite para tu web de estudio de la oposicion de Tecnicos Comerciales y Economistas del Estado.

## Arranque

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env.local` si quieres activar las funciones de IA.
3. Arranca con `npm run dev`.

## Publicacion

La ruta mas simple es `GitHub + Vercel`.

- Guia rapida: `PUBLICAR.md`
- Configuracion lista: `vercel.json`

## Estructura

- `src/App.tsx`: componente principal con toda la logica actual.
- `src/styles.css`: variables visuales base y estilos globales.
- `.env.local`: clave `VITE_ANTHROPIC_API_KEY` para desarrollo local.

## Nota sobre IA

La app puede funcionar sin clave para toda la parte de planificacion, temas, tarjetas, repaso y simulacros.
Las funciones de chat, analisis de PDF y generacion asistida necesitan API key. Para produccion, mejor pasarlas a un backend.
