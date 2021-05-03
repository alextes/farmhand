import { Application, Context, E, pipe, Router } from "./deps.ts";
import { getPricesById } from "./price.ts";
import { fetchCoinGeckoIdMap } from "./id.ts";
import { getPriceChange } from "./price_change.ts";
import { Base } from "./base_unit.ts";

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

router.get("/coin/:symbol/price", async (context) => {
  const symbol = context.params.symbol!;

  const idMap = await fetchCoinGeckoIdMap();
  const id = idMap[symbol];

  if (id === undefined) {
    context.response.status = 404;
    context.response.body = `no coingecko symbol ticker found for ${symbol}`;
    return;
  }

  const price = await getPricesById(id[0]);
  context.response.body = price;
});

router.post("/coin/:symbol/price-change/", async (context) => {
  const symbol = context.params.symbol!;
  if (!context.request.hasBody) {
    context.response.status = 400;
    context.response.body = { msg: "missing request parameters" };
    return;
  }

  const result = context.request.body({ type: "json" });
  type Body = { base: Base; daysAgo: number };
  const { base, daysAgo }: Body = await result.value;

  const idMap = await fetchCoinGeckoIdMap();
  const id = idMap[symbol];

  if (id === undefined) {
    context.response.status = 404;
    context.response.body = {
      msg: `no coingecko symbol ticker found for ${symbol}`,
    };
    return;
  }

  // TODO: pick id by market cap
  const ePriceChange = await getPriceChange(id[0], daysAgo, base);

  pipe(
    ePriceChange,
    E.fold(
      (error) => {
        switch (error) {
          case "NoHistoricPrice":
            context.response.status = 404;
            context.response.body = { msg: "no market data for symbol" };
            break;

          default:
            throw new Error(error);
        }
      },
      (priceChange) => {
        context.response.body = { [base]: priceChange };
      },
    ),
  );
});

app.use(router.routes());

app.addEventListener("listen", ({ hostname, port }) => {
  console.log(
    `Listening on ${hostname ?? "localhost"}:${port}`,
  );
});

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
await app.listen({ hostname, port: 8080 });
