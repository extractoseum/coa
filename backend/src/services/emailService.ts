import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configure transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const LOGO_URL = 'https://coa.extractoseum.com/logo_full.svg'; // Public root asset
const BRAND_COLOR = '#4F46E5';
const ACCENT_COLOR = '#D4AF37';

/**
 * Base template for emails
 */
const getBaseTemplate = (content: string, title: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; mx-auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; margin: 20px auto; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid ${BRAND_COLOR}; }
        .logo { width: 180px; height: auto; }
        .content { padding: 30px 20px; text-align: center; }
        .title { color: #1a1a1a; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .message { font-size: 16px; color: #4a5568; margin-bottom: 30px; }
        .button { display: inline-block; padding: 12px 24px; background-color: ${BRAND_COLOR}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #a0aec0; }
        .footer-links { margin-top: 10px; }
        .footer-links a { color: #a0aec0; text-decoration: underline; margin: 0 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${LOGO_URL}" alt="Extractos EUM" class="logo">
        </div>
        <div class="content">
            <h1 class="title">${title}</h1>
            <div class="message">${content}</div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} EXTRACTOS EUM&trade; . Todos los derechos reservados.</p>
            <div class="footer-links">
                <a href="https://extractoseum.com">Sitio Web</a>
                <a href="https://coa.extractoseum.com/dashboard">Mi Dashboard</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

export const sendDataEmail = async (to: string, subject: string, html: string, options?: { fromName?: string, replyTo?: string }) => {
    try {
        const fromName = options?.fromName || process.env.SMTP_FROM_NAME || 'Extractos EUM';
        const info = await transporter.sendMail({
            from: `"${fromName}" <${process.env.SMTP_USER}>`,
            to,
            replyTo: options?.replyTo,
            subject,
            html,
        });
        console.log('[EmailService] Message sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error('[EmailService] Error sending email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Notify user of a new COA assignment via Email
 */
export const sendNewCoaEmail = async (to: string, coaName: string, coaToken: string) => {
    const title = 'Nuevo Certificado Disponible';
    const coaUrl = `https://coa.extractoseum.com/coa/${coaToken}`;
    const content = `
        Se ha asignado un nuevo Certificado de Análisis (COA) a tu cuenta:<br>
        <strong style="font-size: 18px; color: ${BRAND_COLOR};">${coaName}</strong><br><br>
        Ya puedes consultarlo y verificar su autenticidad desde tu panel o haciendo clic en el siguiente botón:
        <br><br>
        <a href="${coaUrl}" class="button">Ver Certificado</a>
    `;

    return sendDataEmail(to, `[EUM] Nuevo COA: ${coaName}`, getBaseTemplate(content, title));
};

/**
 * Notify user of membership update via Email
 */
export const sendLoyaltyUpdateEmail = async (to: string, tierName: string, type: 'review' | 'active' | 'escalated') => {
    let title = '';
    let message = '';
    let subject = '';

    switch (type) {
        case 'review':
            title = 'Solicitud en Revisión';
            message = 'Hemos recibido tu solicitud para unirte al Club EUM Care. Nuestro equipo la está revisando y te notificaremos en cuanto sea aprobada.';
            subject = '[EUM] Membresía en Revisión';
            break;
        case 'active':
            title = '¡Bienvenido al Club EUM Care!';
            message = 'Tu solicitud ha sido aprobada con éxito. Ya eres <strong>Socio Partner</strong> y puedes disfrutar de los beneficios exclusivos.';
            subject = '[EUM] ¡Bienvenido al Club!';
            break;
        case 'escalated':
            title = `¡Has subido a nivel ${tierName}!`;
            message = `Felicidades por tu crecimiento. Tu cuenta ha sido actualizada al nivel <strong>${tierName}</strong>. Revisa tus nuevos beneficios en tu dashboard.`;
            subject = `[EUM] Actualización de Membresía: ${tierName}`;
            break;
    }

    const content = `
        ${message}
        <br><br>
        <a href="https://coa.extractoseum.com/dashboard" class="button">Ir a mi Dashboard</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of a new order via Email
 */
export const sendOrderCreatedEmail = async (to: string, orderNumber: string) => {
    const title = '¡Pedido Recibido!';
    const subject = `[EUM] Pedido Recibido: ${orderNumber}`;
    const content = `
        Hemos recibido tu pedido <strong>${orderNumber}</strong> correctamente.<br><br>
        Nuestro equipo ya está trabajando en su preparación. Te notificaremos por este mismo medio en cuanto el paquete sea entregado a la paquetería.
        <br><br>
        <a href="https://coa.extractoseum.com/dashboard" class="button">Ver estado del pedido</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of order shipment via Email
 */
export const sendOrderShippedEmail = async (to: string, orderNumber: string, carrier: string, trackingNumbers: string | string[]) => {
    const guides = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const isPlural = guides.length > 1;

    const title = '📦 ¡Tu pedido va en camino!';
    const subject = `[EUM] Pedido Enviado: ${orderNumber}`;

    const trackingHtml = isPlural
        ? `<ul style="list-style: none; padding: 0;">${guides.map(g => `<li style="margin-bottom: 5px;"><strong>Guía:</strong> ${g}</li>`).join('')}</ul>`
        : `<strong>Número de Guía:</strong> ${guides[0]}`;

    const content = `
        ¡Buenas noticias! Tu pedido <strong>${orderNumber}</strong> ha sido enviado.<br><br>
        <strong>Paquetería:</strong> ${carrier}<br>
        ${trackingHtml}<br><br>
        Puedes rastrear tu paquete desde nuestro portal o desde el sitio oficial de la paquetería.
        <br><br>
        <a href="https://coa.extractoseum.com/my-orders" class="button">Rastrear mi pedido</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of a tracking update via Email
 */
export const sendTrackingUpdateEmail = async (to: string, orderNumber: string, statusTitle: string, statusMessage: string) => {
    const title = statusTitle;
    const subject = `[EUM] Actualización de tu pedido: ${orderNumber}`;

    const content = `
        ${statusMessage}<br><br>
        Puedes seguir rastreando tu paquete desde nuestro portal.
        <br><br>
        <a href="https://coa.extractoseum.com/my-orders" class="button">Ver seguimiento</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Send email to recover abandoned orders or checkouts
 */
export const sendAbandonedRecoveryEmail = async (to: string, name: string, checkoutUrl: string, orderNumber: string | null = null) => {
    const title = '🛒 ¡No te quedes sin tus productos!';
    const subject = orderNumber ? `[EUM] Completa tu pedido: ${orderNumber}` : `[EUM] Tu carrito te extraña`;

    const content = `
        Hola ${name || 'amigo'},<br><br>
        Notamos que dejaste algunos productos increíbles en tu carrito. 
        ${orderNumber ? `Tu pedido <strong>${orderNumber}</strong> está casi listo, solo falta completar el pago para enviarlo.` : 'Están listos y esperándote.'}
        <br><br>
        Hemos guardado tu carrito por tiempo limitado para que puedas finalizar tu compra fácilmente.
        <br><br>
        <a href="${checkoutUrl}" class="button">Finalizar mi compra ahora</a>
        <br><br>
        Si tienes alguna duda, responde a este correo o contáctanos por WhatsApp.
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};
