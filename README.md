# bun-ai-service-api-main

Proyecto de servicios AI para integración rápida y ligeras utilities.

**Autor:** Morenosebas — https://github.com/Morenosebas

## Descripción

Este repositorio contiene una API/colección de servicios para integrar distintos modelos y proveedores de IA (texto->texto, imagen->imagen, visión->texto, etc.). Está diseñado para ejecutarse con `bun` y ofrece una estructura modular en las carpetas `services/`, `provider/` y `workflows/`.

## Features

- Integración con proveedores como Pollinations, Groq y Cerebras.
- Organización modular por tipo de servicio (imagen, texto, visión).
- Workflows y registry para componer y ejecutar transformaciones.

## Requisitos

- Node/Bun: este proyecto se ejecuta con `bun` (ver scripts).
- TypeScript (peer dependency indicada).

## Instalación

Instala dependencias con `bun` o el gestor que prefieras. Por ejemplo, con `bun`:

```bash
bun install
```

## Ejecución

Scripts disponibles (extraídos de `package.json`):

- `start`: inicia la app con `bun run index.ts`
- `dev`: inicia en modo desarrollo con watch: `bun --watch run index.ts`

Ejecutar en desarrollo:

```bash
bun run dev
```

O en producción:

```bash
bun run start
```

## Estructura relevante

- `index.ts` — punto de entrada
- `lib/` — utilidades compartidas (auth, executor, registry, types)
- `services/` — implementaciones por tipo de servicio
- `provider/` — adaptadores a proveedores externos
- `workflows/` — composición de flujos y ejecución

## Uso / API

Consulta `docs/` para referencia de la API y flujos:

- [docs/api-reference.md](docs/api-reference.md)
- [docs/adding-services.md](docs/adding-services.md)

Para añadir un nuevo servicio, revisa `docs/adding-services.md` y el patrón en `services/`.

## Contribuir

1. Haz fork del repositorio.
2. Crea una rama con tu feature: `git checkout -b feature/nombre`
3. Abre un PR describiendo los cambios.

## Licencia

Indica la licencia del proyecto si corresponde. Si no hay licencia, añade una para clarificar usos.

---

Si quieres que refine el README (añada ejemplos de endpoints, diagramas de arquitectura o instrucciones de despliegue), dime qué se ajusta a tus necesidades y lo amplío.
