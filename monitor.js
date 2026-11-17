// Aviso de erros no Sentry. Só liga se SENTRY_DSN estiver configurada.
// Não manda corpo de requisição, cabeçalhos, cookies nem IP: os documentos
// do app levam fotos, WhatsApp e dados da coleção.
const Sentry = require("@sentry/node");

const enabled = !!process.env.SENTRY_DSN;
if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    release: "time-collection-api@" + require("./package.json").version,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}

// Registra um erro com um pouco de contexto (rota, agente). Nunca lança.
function report(err, context = {}) {
  if (!enabled) return;
  try { Sentry.withScope((s) => { for (const [k, v] of Object.entries(context)) s.setTag(k, String(v)); Sentry.captureException(err); }); }
  catch (_) { /* aviso de erro nunca derruba a API */ }
}

module.exports = { report, enabled, flush: (ms = 2000) => (enabled ? Sentry.flush(ms) : Promise.resolve(true)) };
