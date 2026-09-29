// ======================================================
// ÁNGELA PRO · GENERADOR DE IMÁGENES IA
// Archivo: /api/image.js
// Backend Vercel + Cloudflare Workers AI + FLUX
// ======================================================

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

function cors(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );
}

function responderError(res, status, mensaje, detalle = "") {
    return res.status(status).json({
        ok: false,
        error: mensaje,
        detail: detalle
    });
}

function construirPrompt(body) {

    const pedido =
        body.prompt ||
        body.text ||
        body.descripcion ||
        body.pedido ||
        "";

    const uso = String(
        body.uso ||
        body.tipo ||
        "general"
    ).toLowerCase();

    const transparente =
        body.transparent === true ||
        body.transparente === true ||
        body.fondoTransparente === true ||
        body.fondo === "transparente";

    let instrucciones = "";

    // ==========================
    // GRABADO LÁSER
    // ==========================

    if (
        uso.includes("laser") ||
        uso.includes("láser") ||
        pedido.toLowerCase().includes("laser") ||
        pedido.toLowerCase().includes("láser")
    ) {

        instrucciones += `
The image is intended for laser engraving.

Create a professional black and white engraving design.
Pure white background.
Strong black lines.
Very high contrast.
Clean and clearly defined contours.
No colors.
No unnecessary shadows.
No complex gradients.
No photographic background.
No decorative background.
Avoid extremely small details.
Keep the main subject completely visible.
Do not crop the main subject.
The design must remain readable when engraved on a small object.
`;

    }

    // ==========================
    // MEDALLAS
    // ==========================

    if (
        uso.includes("medalla") ||
        pedido.toLowerCase().includes("medalla")
    ) {

        instrucciones += `
The design will be engraved on a medal.

Center the main subject.
Keep the entire subject inside the composition.
Do not draw the physical medal.
Do not create a circular or rectangular medal mockup.
Generate only the artwork that will be engraved.
Clean white background.
Strong black engraving lines.
`;

    }

    // ==========================
    // VIROLAS DE MATE
    // ==========================

    if (
        uso.includes("virola") ||
        pedido.toLowerCase().includes("virola")
    ) {

        instrucciones += `
The artwork will be laser engraved on a mate rim (virola).

Create a clean horizontal engraving composition.
Do not draw the mate.
Do not draw the metal rim itself.
Generate only the artwork.
Use bold black lines and a clean white background.
Avoid tiny details.
`;

    }

    // ==========================
    // FOTOGRABADO
    // ==========================

    if (
        uso.includes("fotograbado") ||
        pedido.toLowerCase().includes("fotograbado")
    ) {

        instrucciones += `
Prepare the image for photographic laser engraving.

Use grayscale.
Excellent separation between highlights and shadows.
High facial definition when people are present.
Preserve natural facial features.
Avoid crushed blacks.
Avoid blown highlights.
Sharp important details.
Clean background.
`;

    }

    // ==========================
    // VECTOR / LINE ART
    // ==========================

    if (
        uso.includes("vector") ||
        uso.includes("lineart") ||
        uso.includes("line art")
    ) {

        instrucciones += `
Create clean vector-style line art.
Strong continuous lines.
No photographic textures.
No visual noise.
No unnecessary shading.
Suitable for tracing and laser engraving.
`;

    }

    // ==========================
    // SUBLIMACIÓN
    // ==========================

    if (uso.includes("sublim")) {

        instrucciones += `
Create a professional design for sublimation printing.
Sharp details.
Balanced composition.
Vivid and well separated colors.
High quality.
Keep the complete design inside the canvas.
`;

    }

    // ==========================
    // DTF
    // ==========================

    if (uso.includes("dtf")) {

        instrucciones += `
Create professional artwork for DTF printing.
Clean defined edges.
Strong colors.
High resolution appearance.
Keep the complete artwork visible.
No mockup.
`;

    }

    // ==========================
    // STICKERS
    // ==========================

    if (uso.includes("sticker")) {

        instrucciones += `
Create professional sticker artwork.
Clear silhouette.
Clean defined edges.
Centered subject.
No mockup.
`;

    }

    // ==========================
    // FONDO
    // ==========================

    if (transparente) {

        instrucciones += `
Isolate the main subject completely.
No scenery.
No decorative background.
Use a plain pure white background so it can be removed easily afterward.
Clear separation between subject and background.
`;

    }

    return `
USER REQUEST:
${pedido}

PRODUCTION INSTRUCTIONS:
${instrucciones}

IMPORTANT:
Follow the user's requested subject faithfully.
Do not add words, letters, names, numbers or text unless explicitly requested.
Do not add frames or product mockups unless explicitly requested.
Keep all important elements completely inside the image.
Create a clean, professional and clearly defined composition.
`;
}


export default async function handler(req, res) {

    cors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return responderError(
            res,
            405,
            "Método no permitido. Usá POST."
        );
    }

    const accountId =
        process.env.CLOUDFLARE_ACCOUNT_ID;

    const apiToken =
        process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId) {
        return responderError(
            res,
            500,
            "Falta CLOUDFLARE_ACCOUNT_ID en Vercel."
        );
    }

    if (!apiToken) {
        return responderError(
            res,
            500,
            "Falta CLOUDFLARE_API_TOKEN en Vercel."
        );
    }

    try {

        const body =
            typeof req.body === "string"
                ? JSON.parse(req.body || "{}")
                : (req.body || {});

        const prompt =
            construirPrompt(body).trim();

        if (!prompt) {
            return responderError(
                res,
                400,
                "Escribí qué imagen querés crear."
            );
        }

        const url =
            `https://api.cloudflare.com/client/v4/accounts/` +
            `${accountId}/ai/run/${IMAGE_MODEL}`;

        const respuesta = await fetch(url, {

            method: "POST",

            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                prompt: prompt,
                num_steps: 4
            })

        });

        const contentType =
            respuesta.headers.get("content-type") || "";

        let data;

        if (contentType.includes("application/json")) {
            data = await respuesta.json();
        } else {
            const buffer =
                Buffer.from(await respuesta.arrayBuffer());

            const base64 =
                buffer.toString("base64");

            const mimeType =
                contentType.includes("image/")
                    ? contentType
                    : "image/png";

            const dataUrl =
                `data:${mimeType};base64,${base64}`;

            return res.status(200).json({
                ok: true,
                image: dataUrl,
                imageUrl: dataUrl,
                url: dataUrl,
                dataUrl: dataUrl,
                mimeType: mimeType,
                model: IMAGE_MODEL
            });
        }

        if (!respuesta.ok || data?.success === false) {

            const detalle =
                data?.errors?.[0]?.message ||
                data?.errors?.[0]?.code ||
                data?.error ||
                `Cloudflare respondió ${respuesta.status}`;

            return responderError(
                res,
                respuesta.status || 500,
                "No se pudo generar la imagen.",
                String(detalle)
            );
        }

        const resultado =
            data?.result || data;

        let base64 =
            resultado?.image ||
            resultado?.data ||
            resultado?.base64 ||
            null;

        if (Array.isArray(base64)) {
            base64 = base64[0];
        }

        if (
            typeof base64 === "string" &&
            base64.startsWith("data:image")
        ) {

            return res.status(200).json({
                ok: true,
                image: base64,
                imageUrl: base64,
                url: base64,
                dataUrl: base64,
                mimeType: "image/png",
                model: IMAGE_MODEL
            });
        }

        if (typeof base64 === "string" && base64.length > 100) {

            const dataUrl =
                `data:image/png;base64,${base64}`;

            return res.status(200).json({
                ok: true,
                image: dataUrl,
                imageUrl: dataUrl,
                url: dataUrl,
                dataUrl: dataUrl,
                mimeType: "image/png",
                model: IMAGE_MODEL
            });
        }

        return responderError(
            res,
            502,
            "Cloudflare respondió pero no devolvió una imagen.",
            JSON.stringify(data).slice(0, 1000)
        );

    } catch (error) {

        console.error(
            "ANGELA CLOUDFLARE IMAGE ERROR:",
            error
        );

        return responderError(
            res,
            500,
            "Error interno al generar la imagen.",
            error?.message || String(error)
        );
    }
}
