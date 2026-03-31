import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { db } from "./db";
import { lenses } from "./db/schema";
import { eq } from "drizzle-orm";
import { monitoring } from "./metrics";
import { recordException, setHttpStatus, startServerSpan, withContext } from "./tracing";

const lensResponse = t.Object({
  id: t.String({ format: "uuid" }),
  modelName: t.String(),
  manufacturerName: t.String(),
  minFocalLength: t.Numeric(),
  maxFocalLength: t.Numeric(),
  maxAperture: t.String(),
  mountType: t.String(),
  dayPrice: t.String(),
  weekendPrice: t.String(),
  description: t.Nullable(t.String()),
});

const errorResponse = t.Object({
  error: t.String(),
});

function serializeLens(lens: typeof lenses.$inferSelect) {
  return {
    ...lens,
    maxAperture: String(lens.maxAperture),
    dayPrice: String(lens.dayPrice),
    weekendPrice: String(lens.weekendPrice),
  };
}

const app = new Elysia()
  .onRequest(({ request }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/metrics") {
      monitoring.markRequestStart(request);
    }
  })
  .onAfterHandle(({ request, path, set }) => {
    const route = path || new URL(request.url).pathname;
    if (route === "/metrics") return;

    monitoring.recordHttpRequest({
      request,
      method: request.method,
      route,
      statusCode: typeof set.status === "number" ? set.status : 200,
    });
  })
  .onError(({ request, path, set }) => {
    const route = path || new URL(request.url).pathname;
    if (route === "/metrics") return;

    monitoring.recordHttpRequest({
      request,
      method: request.method,
      route,
      statusCode: typeof set.status === "number" ? set.status : 500,
    });
  })
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "SuiLens Catalog Service API",
          version: "1.0.0",
          description: "Catalog endpoints for browsing SuiLens lenses.",
        },
        tags: [{ name: "Catalog", description: "Lens catalog operations" }],
      },
      path: "/docs",
    }),
  )
  .get(
    "/api/lenses",
    async () => {
      const results = await db.select().from(lenses);
      return results.map(serializeLens);
    },
    {
      detail: {
        tags: ["Catalog"],
        summary: "List lenses",
        description: "Returns all rentable lenses in the catalog.",
      },
      response: {
        200: t.Array(lensResponse),
      },
    },
  )
  .get(
    "/api/lenses/:id",
    async ({ params, status, request }) => {
      const { span, ctx } = startServerSpan(request, "GET /api/lenses/:id", {
        "http.method": "GET",
        "http.route": "/api/lenses/:id",
        "lens.id": params.id,
      });

      return await withContext(ctx, async () => {
        try {
          const results = await db
            .select()
            .from(lenses)
            .where(eq(lenses.id, params.id));

          if (!results[0]) {
            setHttpStatus(span, 404);
            return status(404, { error: "Lens not found" });
          }

          setHttpStatus(span, 200);
          return serializeLens(results[0]);
        } catch (error) {
          setHttpStatus(span, 500);
          recordException(span, error);
          throw error;
        } finally {
          span.end();
        }
      });
    },
    {
      detail: {
        tags: ["Catalog"],
        summary: "Get lens by ID",
        description: "Returns a single lens from the catalog.",
      },
      params: t.Object({
        id: t.String({ format: "uuid" }),
      }),
      response: {
        200: lensResponse,
        404: errorResponse,
      },
    },
  )
  .get(
    "/health",
    () => ({ status: "ok", service: "catalog-service" }),
    {
      detail: {
        tags: ["Catalog"],
        summary: "Health check",
      },
      response: {
        200: t.Object({
          status: t.String(),
          service: t.String(),
        }),
      },
    },
  )
  .get("/metrics", async ({ set }) => {
    set.headers = {
      "content-type": monitoring.metricsContentType,
    };
    return await monitoring.register.metrics();
  })
  .listen(3001);

console.log(`Catalog Service running on port ${app.server?.port}`);
