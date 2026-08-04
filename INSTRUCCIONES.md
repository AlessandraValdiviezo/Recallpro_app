# RecallPro + Notion — Guía de instalación

## 1. Crear las 3 bases de datos en Notion

Crea tres bases de datos **de página completa** (no inline) con estas propiedades exactas (mayúsculas y tildes incluidas):

### 📁 RecallPro - Carpetas
| Propiedad | Tipo |
|---|---|
| Nombre | Title (ya viene por defecto) |
| Categoria | Select, con dos opciones: `universidad`, `personal` |

### 📚 RecallPro - Temas
| Propiedad | Tipo |
|---|---|
| Nombre | Title |
| Carpeta | Relation → apunta a "RecallPro - Carpetas" |
| ProximoRepaso | Date |
| Box | Number |
| Repeticiones | Number |

### 📈 RecallPro - Historial
| Propiedad | Tipo |
|---|---|
| Tema | Title |
| Curso | Text |
| Fecha | Date |
| Score | Number |
| Total | Number |

## 2. Crear la integración de Notion

1. Ve a https://www.notion.so/my-integrations → **New integration**.
2. Ponle un nombre (ej. "RecallPro"), asóciala a tu workspace, guarda.
3. Copia el **Internal Integration Secret** (empieza con `secret_` o `ntn_`).
4. En cada una de las 3 bases de datos: botón "···" (arriba a la derecha) → **Connections** → conecta la integración "RecallPro". Sin este paso la API no puede leer/escribir en ellas.

## 3. Obtener los IDs de las bases de datos

Abre cada base de datos en el navegador. La URL se ve así:

```
https://www.notion.so/tuworkspace/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d?v=...
```

El ID es el bloque de 32 caracteres antes del `?v=`. Copia uno por cada base de datos.

## 4. Desplegar en Netlify

1. Sube esta carpeta completa (`netlify.toml`, `estudio.html`, `netlify/functions/api.js`) a `app.netlify.com/drop`, o mejor, a un repositorio de GitHub conectado a Netlify (así puedes hacer `git push` para actualizar).
2. En el panel del sitio en Netlify: **Site configuration → Environment variables**, agrega:
   - `NOTION_TOKEN` = tu secreto de integración
   - `NOTION_DB_CARPETAS` = ID de la base de datos Carpetas
   - `NOTION_DB_TEMAS` = ID de la base de datos Temas
   - `NOTION_DB_HISTORIAL` = ID de la base de datos Historial
3. Vuelve a desplegar el sitio (Deploys → Trigger deploy) para que tome las variables nuevas.

## 5. Insertar en Notion

En tu página de Notion, escribe `/embed` y pega la URL de tu sitio de Netlify.

## Notas
- El botón 🔄 en la app fuerza una recarga de datos desde Notion.
- El botón ⬇️ Exportar sigue funcionando como respaldo local adicional.
- El botón ⬆️ Importar a Notion crea carpetas/temas nuevos a partir de un backup `.json` (no sobreescribe lo existente).
