# 👼 ÁNGELA · Asistente IA del Comedor Ángel Guardián

**ÁNGELA** es una asistente virtual hecha en casa por la **Asociación Civil Ángel Guardián para la Niñez de Merlo** (Mariano Acosta, Buenos Aires). Reúne en una sola app el chat con inteligencia artificial, la gestión del comedor, las herramientas del taller (láser y sublimación), el trabajo con fotos y archivos, y un estudio para crear videos con IA.

Funciona desde el navegador, en la computadora o en el celular, y **se puede instalar como app**.

🔗 **Abrir ÁNGELA:** https://orion-ia-sooty.vercel.app

---

## 💬 Conversación en vivo
- Chat con IA en español rioplatense, con respuestas cortas y claras.
- **Manos libres**: le hablás y te responde con voz.
- **Memoria**: recuerda datos de tu perfil y el hilo de la charla (se puede ver, editar y borrar).
- Entiende **fotos, audios y archivos** que le adjuntás.
- Busca información actual en internet cuando la pregunta lo necesita.
- **Modo Agente**: hace tareas de varios pasos y muestra el resultado en planillas.

## 🧩 Centro de Gestión
Todo lo que el comedor necesita organizar, guardado en la propia computadora:
- 👨‍👩‍👧 **Familias y personas**: base de datos de las familias que acompaña el comedor, con importación desde Excel.
- 📁 **Documentación**: documentos de cada persona y su dirección.
- 💰 **Gastos e ingresos** y 💳 **donantes**.
- 🏢 **Empresas / RSE**, para contactos de responsabilidad social.
- 📧 **Gmail y Mercado Pago**: lee los avisos de ingresos para registrarlos.
- 📅 **Recordatorios** y 🧠 **memoria local**.
- 🧮 **Costos y presupuestos**, 📦 **inventario y stock**, 📋 **pedidos y clientes**.
- 📸 **Google Fotos**: encuentra fotos duplicadas.
- 🎟️ **Tarjetas y códigos QR** para eventos.
- 🎁 **Regalos QR**: más de 35 ocasiones (también Halloween, Familia, Pascuas y campañas del comedor), **carta digital** con sobre interactivo que se abre deslizando el dedo, música, fotos tipo polaroid, contador de días y versículo.
- 🎉 **Eventos QR**: ubicación con botón "Cómo llegar", confirmación por WhatsApp, cuenta regresiva, trivia, ruleta de premios, "Mis retos" con puntos y **carpeta de recuerdos (.zip)**.

## 🧰 Herramientas del taller
- 🖼️ **Editor de imágenes**: blanco y negro, line art, stencil, tramados para grabar, quitar fondo, recortar, mejorar nitidez y resolución.
- 🔥 **Láser**: biblioteca de parámetros por material (madera, MDF, acero, aluminio, cuero, acrílico, mates, termos…) y máquinas personalizadas.
- 👕 **Sublimación**: guías para tazas, remeras y gorras.
- ✨ **Tipografía 3D con movimiento**: arma prompts para Spline, Blender o CapCut y prepara videos para TikTok.
- 📂 **Proyectos** e **insumos**.

## 📎 Archivos y multimedia
- Lee **PDF, Word y Excel**; **cruza y unifica planillas** y descarga el resultado.
- Cámara, fotos, videos y Google Drive.
- Analiza videos, recorta tramos y pasa fotogramas al editor.

## 🎬 ÁNGELA Studio IA
Estudio para crear videos con inteligencia artificial:
- Crear video desde una idea, un guion o un link de YouTube o TikTok.
- **Canales IA**, **guiones**, **escenas**, **voces**, **música**, **subtítulos** y **editor**.
- **Producción de mininovelas** por capítulos.
- 🎙️ **Voces del comedor**: clonar una voz, ponerle voz a una foto ("foto que habla") o a un video.
- 🎵 **Música libre** de Internet Archive y Jamendo, con descarga en ZIP para el pendrive.
- Mis proyectos, guardados y recuperables. Zona privada protegida con PIN.

## 🥣 Comedor Ángel Guardián
- 📻 Radio Ángel Guardián.
- Datos de contacto y redes del comedor.
- Accesos rápidos: Google, YouTube, WhatsApp, Canva, Maps, clima y calendario.

## ⚙️ Configuración
- Voz, idiomas y accesibilidad.
- Exportar e importar la configuración, y hacer backup.
- Diagnóstico de ÁNGELA y registro de actividad.
- 📲 **Instalar ÁNGELA** como app.
- Seguridad: las claves privadas nunca van dentro de la página.

---

## 📲 Instalar en el celular
1. Abrí el link de ÁNGELA en **Chrome**.
2. Tocá los **tres puntitos ⋮** → **"Instalar app"**.
3. Queda con su ícono en la pantalla y **se actualiza sola** cada vez que se sube una versión nueva.

También se puede instalar desde **Configuración → 📲 Instalar ÁNGELA**.

## 🔐 Configuración en Vercel (variables de entorno)
Las claves se guardan **solo en Vercel**, nunca en el código:

| Variable | Para qué sirve |
|---|---|
| `GEMINI_API_KEY` | Chat e imágenes con Gemini (gratis) |
| `OPENROUTER_API_KEY` | IA de respaldo para el chat (opcional) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Guardado en la nube y eventos QR |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Conexión con Gmail / Mercado Pago |
| `FAL_KEY`, `HF_TOKEN` | Generación de video y audio en el Studio (opcional) |

## 📁 Archivos del proyecto
- `index.html`: la app completa.
- `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`: permiten instalarla como app.
- `api/`: funciones del servidor (chat, imágenes, Studio, Gmail, Supabase).

---

Hecho con ❤️ en Merlo para el **Comedor Ángel Guardián**: trece años acompañando a la comunidad.
