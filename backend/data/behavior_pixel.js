/**
 * SWIS Watch - CRM Behavior Pixel v3.1 (ULTIMATE VOICE-READY)
 * 
 * Instrucciones: 
 * 1. Pegar en theme.liquid ANTES de la etiqueta </body>
 * 2. Para rastrear eventos nuevos (como Voz o Botones especiales), simplemente agrega
 *    el atributo `data-track-event="nombre_evento"` a cualquier elemento HTML.
 *    Ejemplo: <button data-track-event="voice_search_start">🎤 Buscar</button>
 */

(function () {
    // --- [CONFIGURACIÓN] ---
    const CONFIG = {
        API_URL: 'https://coa.extractoseum.com/api/v1/behavior/track',
        DEBUG: true, // true para ver logs en consola
        VERSION: 'v3.1-Ultimate'
    };

    // --- [IDENTIDAD] ---
    const userEmail = "{{ customer.email }}";

    // --- [CORE TRACKER] ---
    const trackEvent = async (type, metadata = {}) => {
        // Filtro de Seguridad: Solo usuarios logueados
        if (!userEmail || userEmail === "" || userEmail.includes("customer.email")) return;

        const payload = {
            event_type: type,
            handle: userEmail,
            url: window.location.href,
            metadata: {
                ...metadata,
                title: document.title,
                timestamp: new Date().toISOString(),
                pixel_version: CONFIG.VERSION
            }
        };

        if (CONFIG.DEBUG) console.log(`[SWIS ${CONFIG.VERSION}] 📡 Enviando:`, type, payload);

        try {
            await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors',
                keepalive: true, // Crítico para no perder datos al navegar
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error('[SWIS] Error de conexión:', e);
        }
    };

    // --- [1. RASTREO AUTOMÁTICO DE NAVEGACIÓN] ---
    const path = window.location.pathname;

    // Producto
    if (path.includes('/products/')) {
        const price = document.querySelector('meta[property="og:price:amount"]')?.content;
        const currency = document.querySelector('meta[property="og:price:currency"]')?.content;
        trackEvent('view_product', {
            product_name: document.title,
            price: price || 'unknown',
            currency: currency || 'MXN'
        });
    }
    // Colección
    else if (path.includes('/collections/')) {
        trackEvent('view_collection', { collection_name: document.title });
    }
    // Carrito
    else if (path.includes('/cart')) {
        trackEvent('view_cart', { step: 'review' });
    }

    // Búsqueda (Query Param)
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) trackEvent('search', { query: q, source: 'url' });

    // --- [2. INTERCEPTOR DE CARRITO (AJAX)] ---
    const originalFetch = window.fetch;
    window.fetch = function () {
        const url = arguments[0] ? arguments[0].toString() : '';

        if (url.includes('/cart/add')) {
            trackEvent('add_to_cart', { source: 'ajax_interceptor' });
        }
        if (url.includes('/cart/change') || url.includes('/cart/update')) {
            trackEvent('update_cart', { source: 'ajax_interceptor' });
        }

        return originalFetch.apply(this, arguments);
    };

    // --- [3. RASTREO DE CLICS DE ALTA INTENCIÓN] ---
    document.addEventListener('click', (e) => {
        const target = e.target.closest('button, a, input[type="submit"]');
        if (!target) return;

        const name = (target.name || '').toLowerCase();
        const href = (target.href || '').toLowerCase();
        const text = (target.innerText || '').toLowerCase();

        // Checkout
        if (name === 'checkout' || href.includes('/checkout') || text.includes('pagar') || text.includes('checkout')) {
            trackEvent('initiate_checkout', { origin: 'button_click' });
        }
        // Contacto (WhatsApp / Email)
        if (href.includes('wa.me') || href.includes('whatsapp.com')) {
            trackEvent('click_contact', { channel: 'whatsapp' });
        } else if (href.includes('mailto:')) {
            trackEvent('click_contact', { channel: 'email' });
        }
    }, { passive: true });

    // --- [4. HOOKS UNIVERSALES (VOZ Y PERSONALIZADO)] ---

    // A. Captura automática por atributos HTML (Future Proofing)
    // Uso: <button data-track-event="voice_start" data-track-meta='{"mode":"mic"}'>...</button>
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-track-event]');
        if (target) {
            const eventName = target.getAttribute('data-track-event');
            let meta = {};
            try {
                const metaStr = target.getAttribute('data-track-meta');
                if (metaStr) meta = JSON.parse(metaStr);
            } catch (err) { console.warn('[SWIS] Invalid JSON in data-track-meta'); }

            trackEvent(eventName, meta);
        }
    }, { passive: true });

    // B. Listener de Eventos Javascript (Para desarrolladores)
    // Uso: document.dispatchEvent(new CustomEvent('swis-track', { detail: { type: 'voice_command', meta: { text: 'hola' } } }))
    document.addEventListener('swis-track', (e) => {
        if (e.detail && e.detail.type) {
            trackEvent(e.detail.type, e.detail.meta || {});
        }
    });

    console.log(`[SWIS Pixel] ${CONFIG.VERSION} Loaded & Ready.`);

})();
