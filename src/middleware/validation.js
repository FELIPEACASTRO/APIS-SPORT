// src/middleware/validation.js
// Validação leve sem dep externa. Cada schema é uma função (input) -> {ok, errors, value}.
// Compose com middleware factory.

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema(req.body || {});
    if (!result.ok) {
      const status = result.status || 400;
      return res.status(status).json({
        error: status === 413 ? 'payload muito grande' : 'requisição inválida',
        details: result.errors,
        request_id: req.id,
      });
    }
    req.validBody = result.value;
    next();
  };
}

// ── Schemas ────────────────────────────────────────────────────────────────
export function invokeSchema(body) {
  const errors = [];
  const out = {};

  if (body.apiId === undefined || body.apiId === null) {
    errors.push('apiId é obrigatório');
  } else {
    const id = Number(body.apiId);
    if (!Number.isInteger(id) || id < 1 || id > 100000) {
      errors.push('apiId deve ser inteiro positivo');
    } else out.apiId = id;
  }

  if (body.endpoint !== undefined) {
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 1000) {
      errors.push('endpoint deve ser string < 1000 chars');
    } else out.endpoint = body.endpoint;
  }

  if (body.mode !== undefined) {
    if (!['mock', 'real'].includes(body.mode)) {
      errors.push('mode deve ser "mock" ou "real"');
    } else out.mode = body.mode;
  }

  if (body.query !== undefined) {
    if (typeof body.query !== 'object' || Array.isArray(body.query) || body.query === null) {
      errors.push('query deve ser objeto');
    } else {
      const cleanQuery = {};
      for (const [k, v] of Object.entries(body.query)) {
        if (typeof k !== 'string' || k.length > 64) continue;
        const sv = String(v);
        if (sv.length > 256) continue;
        cleanQuery[k] = sv;
      }
      out.query = cleanQuery;
    }
  }

  if (body.rapidApiKey !== undefined) {
    if (typeof body.rapidApiKey !== 'string' || body.rapidApiKey.length > 200) {
      errors.push('rapidApiKey inválida');
    } else out.rapidApiKey = body.rapidApiKey;
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

export function invokeBatchSchema(body) {
  const errors = [];
  const out = {};
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items deve ser array não vazio');
  } else if (body.items.length > 50) {
    return { ok: false, status: 413, errors: ['máximo 50 chamadas por batch'] };
  } else {
    out.items = [];
    for (let i = 0; i < body.items.length; i++) {
      const r = invokeSchema(body.items[i]);
      if (!r.ok) {
        errors.push(`items[${i}]: ${r.errors.join(', ')}`);
        continue;
      }
      out.items.push(r.value);
    }
  }
  if (body.mode !== undefined) {
    if (!['mock', 'real'].includes(body.mode)) errors.push('mode inválido');
    else out.mode = body.mode;
  }
  if (body.rapidApiKey !== undefined) {
    if (typeof body.rapidApiKey !== 'string' || body.rapidApiKey.length > 200) {
      errors.push('rapidApiKey inválida');
    } else out.rapidApiKey = body.rapidApiKey;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
