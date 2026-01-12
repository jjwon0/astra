import { Hono } from "https://esm.sh/hono@4";

const app = new Hono();

// Re-throw errors to see full stack traces
app.onError((err) => {
  throw err;
});

// Health check endpoint
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Log viewer API (placeholder)
app.get("/api/logs", (c) => {
  return c.json({
    logs: [],
    message: "Log viewer coming soon",
  });
});

// Root route
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Astra</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://cdn.twind.style" crossorigin></script>
        <script src="https://esm.town/v/std/catch"></script>
      </head>
      <body class="bg-gray-50 min-h-screen">
        <div class="max-w-4xl mx-auto p-8">
          <h1 class="text-3xl font-bold text-gray-900 mb-4">Astra</h1>
          <p class="text-gray-600">Log viewer coming soon.</p>
        </div>
      </body>
    </html>
  `);
});

// This is the entry point for HTTP vals
export default app.fetch;
