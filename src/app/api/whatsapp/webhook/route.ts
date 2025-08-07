
import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppMessage } from '@/ai/flows/whatsapp-bot';

// --- Constantes de Configuración ---
// Estos valores se leen desde el archivo .env
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

/**
 * Endpoint para verificar la URL del Webhook con la API de WhatsApp.
 * Meta/Facebook enviará una solicitud GET a esta URL para confirmar que te pertenece.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verificación exitosa!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.warn('[Webhook] Fallo en la verificación. Tokens no coinciden.');
    return new NextResponse(null, { status: 403 });
  }
}

/**
 * Endpoint para recibir los mensajes entrantes de WhatsApp.
 * Este es el núcleo de la integración.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Webhook] Mensaje recibido:', JSON.stringify(body, null, 2));

    // Validamos que el mensaje sea de WhatsApp y tenga el formato esperado
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value.messages) {
            for (const message of change.value.messages) {
              if (message.type === 'text') {
                const from = message.from; // Número del cliente
                const msg_body = message.text.body; // Contenido del mensaje

                // 1. Llama a nuestro bot de IA para obtener una respuesta
                const { reply } = await handleWhatsAppMessage({ from, message: msg_body });
                
                // 2. Envía la respuesta de vuelta al cliente usando la API de WhatsApp
                await sendWhatsAppMessage(from, reply);

                console.log(`[Webhook] Respuesta enviada a ${from}: "${reply}"`);
              }
            }
          }
        }
      }
    }
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[Webhook] Error procesando el mensaje:', error);
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * Función para enviar un mensaje a través de la API de WhatsApp.
 * @param to El número de teléfono del destinatario.
 * @param text El contenido del mensaje a enviar.
 */
async function sendWhatsAppMessage(to: string, text: string) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.error("[sendWhatsAppMessage] Faltan credenciales de WhatsApp en el archivo .env");
    return;
  }

  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    text: { body: text },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error de la API de WhatsApp: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    console.log('[sendWhatsAppMessage] Mensaje enviado con éxito:', responseData);
  } catch (error) {
    console.error('[sendWhatsAppMessage] Error al enviar el mensaje:', error);
  }
}
