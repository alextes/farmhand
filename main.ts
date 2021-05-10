import { Application, Context, Router } from "./deps.ts";
import { handleGetPrice } from "./price.ts";
import { handleGetPriceChange } from "./price_change.ts";

const app = new Application();

const handleError = async (
  context: Context,
  next: () => Promise<void>,
) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    context.response.status = 500;
    context.response.body = { msg: err.message };
  }
};

app.use(handleError);

if (Deno.env.get("ENV") === "dev") {
  app.use(async (ctx, next) => {
    await next();
    const rt = ctx.response.headers.get("X-Response-Time");
    console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
  });

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.response.headers.set("X-Response-Time", `${ms}ms`);
  });
}

const router = new Router();

router.get("/coin/:symbol/price", handleGetPrice);

router.post("/coin/:symbol/price-change/", handleGetPriceChange);

app.use(router.routes());

app.addEventListener("listen", ({ hostname, port }) => {
  console.log(
    `Listening on ${hostname ?? "localhost"}:${port}`,
  );
});

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
await app.listen({ hostname, port: 8080 });
