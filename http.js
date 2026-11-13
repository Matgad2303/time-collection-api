// Erro com status HTTP, para responder mensagens claras ao front
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Envolve rotas async para que erros caiam no tratador central
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validação simples de campos obrigatórios
function need(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || String(body[f]).trim() === "") {
      throw new HttpError(400, `Campo obrigatório: ${f}`);
    }
  }
}

// Mantém só os campos permitidos
function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out;
}

// Limite simples de requisições por IP, em memória (suficiente para uma instância só)
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
  }, windowMs).unref();
  return (req, _res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    h.count++;
    if (h.count > max) return next(new HttpError(429, "Muitas tentativas. Espere alguns minutos e tente de novo."));
    next();
  };
}

module.exports = { HttpError, wrap, need, pick, rateLimit };
