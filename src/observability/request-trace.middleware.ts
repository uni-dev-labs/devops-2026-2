import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { runWithTrace } from "./trace-context.js";
import { startSpan } from "./timing.js";

export const TRACE_ID_HEADER = "X-Trace-Id";

/**
 * Abre la traza de cada petición HTTP:
 *  1. Genera un traceId y lo devuelve en el header X-Trace-Id (para poder buscarlo en los logs).
 *  2. Abre el span raíz "http" y lo cierra cuando la respuesta termina de enviarse.
 *  3. Ejecuta el resto de la cadena dentro del contexto, así todos los spans de servicio
 *     y de base de datos quedan ligados a esta petición.
 *
 * Debe registrarse después de express.json() y antes de los routers.
 */
export function requestTrace(): RequestHandler {
  return (req, res, next) => {
    const traceId = randomUUID();
    res.setHeader(TRACE_ID_HEADER, traceId);

    runWithTrace({ traceId }, () => {
      const span = startSpan("http", `${req.method} ${req.path}`);

      res.on("finish", () => {
        // req.route solo existe si una ruta hizo match; se usa el patrón ("/users") y no la
        // URL real para que las mediciones de una misma ruta se puedan agrupar.
        const routePattern = req.route?.path
          ? `${req.baseUrl}${req.route.path}`
          : req.originalUrl.split("?")[0];

        span.end({
          name: `${req.method} ${routePattern}`,
          status: res.statusCode >= 500 ? "error" : "ok",
          meta: { statusCode: res.statusCode },
        });
      });

      runWithTrace({ traceId, parentSpanId: span.spanId }, next);
    });
  };
}
