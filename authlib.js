const jwt = require("jsonwebtoken");
const { HttpError } = require("./http");

const SECRET = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não configurado");
  return process.env.JWT_SECRET;
};

function signToken(user) {
  return jwt.sign({ sub: user.id, handle: user.handle }, SECRET(), { expiresIn: "30d" });
}

// Exige login: lê "Authorization: Bearer <token>"
function requireAuth(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return next(new HttpError(401, "Faça login para continuar."));
  try {
    const p = jwt.verify(token, SECRET());
    req.user = { id: p.sub, handle: p.handle };
    next();
  } catch {
    next(new HttpError(401, "Sessão expirada. Entre de novo."));
  }
}

// Login opcional: preenche req.user se houver token válido
function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(h.slice(7), SECRET());
      req.user = { id: p.sub, handle: p.handle };
    } catch {}
  }
  next();
}

module.exports = { signToken, requireAuth, optionalAuth };
