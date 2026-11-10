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

module.exports = { HttpError, wrap, need, pick };
