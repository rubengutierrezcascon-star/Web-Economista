# Publicar Tu Web

La forma mas facil para ti es: `GitHub + Vercel`.

No necesitas saber programar para hacerlo si sigues estos pasos.

## Opcion recomendada

1. Crea una cuenta en GitHub.
2. Crea una cuenta en Vercel.
3. Sube esta carpeta a un repositorio de GitHub.
4. En Vercel, pulsa `Add New Project`.
5. Selecciona el repositorio.
6. Vercel detectara que es una app Vite.
7. Pulsa `Deploy`.

## Si quieres activar la IA

En Vercel, dentro del proyecto:

1. Ve a `Settings`.
2. Ve a `Environment Variables`.
3. Crea la variable `VITE_ANTHROPIC_API_KEY`.
4. Pega tu clave.
5. Guarda y vuelve a desplegar.

## Si no activas la IA

La web seguira funcionando para:

- Temas
- Plan semanal
- Tarjetas
- Repasos
- Simulacros
- Progreso

No funcionaran:

- Chat IA
- Analisis de PDF con IA
- Generacion asistida con IA

## Antes de subirla

Tu proyecto ya esta preparado como web, pero en tu ordenador todavia necesitas instalar dependencias para probarlo localmente:

1. Abre una terminal en esta carpeta.
2. Ejecuta `npm install`.
3. Ejecuta `npm run dev`.

## Si quieres una ayuda aun mas simple

La siguiente tarea util es que te deje tambien:

1. Una version con textos limpios y sin caracteres raros.
2. Un backend sencillo para que la IA sea segura.
