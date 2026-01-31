# bun-ai-service-api-main

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Proyecto de servicios AI para integración rápida y ligeras utilities.

**Autor:** Morenosebas — https://github.com/Morenosebas

## Descripción

Este repositorio contiene una API/colección de servicios para integrar distintos modelos y proveedores de IA (texto->texto, imagen->imagen, visión->texto, etc.). Está diseñado para ejecutarse con `bun` y ofrece una estructura modular en las carpetas `services/`, `provider/` y `workflows/`. Inspirado en el repositorio https://github.com/midudev/bun-ai-api

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

## Ejemplos de uso

Nota: Si has configurado `API_KEY` en el entorno, incluye el header `Authorization: Bearer <API_KEY>` en las peticiones.

- Health / info (GET):

```bash
curl http://localhost:3000/
```

- Texto / chat (POST, SSE stream):

```bash
curl -N -H "Content-Type: application/json" \
	-H "Authorization: Bearer $API_KEY" \
	-d '{"messages":[{"role":"user","content":"Escribe un poema corto en español."}]}' \
	http://localhost:3000/text
```

El endpoint `POST /chat` es un alias de `/text`.

- Visión / análisis de imagen (POST, SSE stream):

```bash
curl -N -H "Content-Type: application/json" \
	-H "Authorization: Bearer $API_KEY" \
	-d '{"messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.com/image.jpg"}}]}]}' \
	http://localhost:3000/vision
```

- Generación de imagen (POST, JSON response):

```bash
curl -s -H "Content-Type: application/json" \
	-H "Authorization: Bearer $API_KEY" \
	-d '{"prompt":"A serene landscape, sunrise over mountains","options":{"width":1024,"height":768}}' \
	http://localhost:3000/image
```

- Workflows:

	- Listar workflows (GET):

	```bash
	curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/workflow
	```

	- Iniciar workflow (POST):

	```bash
	curl -X POST -H "Content-Type: application/json" \
		-H "Authorization: Bearer $API_KEY" \
		-d '{"input":{"prompt":"Generate a marketing blurb for a product"}}' \
		http://localhost:3000/workflow/<workflow-name>
	```

	- Obtener estado (GET):

	```bash
	curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/workflow/<workflow-id>/status
	```

	- Conectarse al stream SSE de un workflow (GET):

	```bash
	curl -N -H "Authorization: Bearer $API_KEY" http://localhost:3000/workflow/<workflow-id>/stream
	```



## Contribuir

1. Haz fork del repositorio.
2. Crea una rama con tu feature: `git checkout -b feature/nombre`
3. Abre un PR describiendo los cambios.


## Licencia

Este proyecto se publica bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para el texto completo.

Copyright (c) 2026 Morenosebas

---

