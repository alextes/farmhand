import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { LRU, pipe, TE } from "./deps.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";
import * as Id from "./id.ts";
import * as PriceChange from "./price_change.ts";
import { GetIdError } from "./id.ts";
import { State } from "./server.ts";
import { HistoricPriceCache } from "./price_change.ts";

export type PriceCache = LRU<number>;

/**
 * Structure CoinGecko uses in simple price responses.
 */
type RawPrice = Record<string, MultiPrice>;

// where keys are the base denominations we asked for.
export type MultiPrice = Record<string, number>;

type FetchMultiPriceError = FetchError | DecodeError | BadResponse;
export type Base = "usd" | "btc" | "eth";

const getPrice = (
  priceCache: PriceCache,
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
): TE.TaskEither<FetchMultiPriceError, number> => {
  const cacheKey = `price-${id}-${base}`;
  const cValue = priceCache.get(cacheKey);
  if (cValue !== undefined) {
    return TE.right(cValue);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${base}`;

  return pipe(
    () => fetch(uri),
    TE.fromFailableTask((error) => {
      return ({ type: "FetchError" as const, error: error as Error });
    }),
    TE.chain((res): TE.TaskEither<FetchMultiPriceError, RawPrice> => {
      if (res.status === 429) {
        // If we have shot too many price requests already, fallback to todays
        // cached price.
        const todayTimestamp = PriceChange.getTodayTimestamp();
        const key = `${todayTimestamp}-${id}-${base}`;
        const price = historicPriceCache.get(key);
        if (price !== undefined) {
          return TE.right({ [id]: { [base]: price } });
        }

        return TE.left({
          type: "BadResponse",
          error: new Error("Hit CoinGecko API rate limit"),
          status: 429,
        });
      }

      if (res.status !== 200) {
        return TE.left({
          type: "BadResponse",
          error: new Error(
            `coingecko bad response ${res.status} ${res.statusText}`,
          ),
          status: 500,
        });
      }

      return pipe(
        () => res.json() as Promise<RawPrice>,
        TE.fromFailableTask((error) => (
          ({ type: "DecodeError", error: error as Error })
        )),
      );
    }),
    TE.map((rawPrice) => {
      const price = rawPrice[id][base];
      priceCache.set(cacheKey, price);
      return price;
    }),
  );
};

type GetPriceError = GetIdError | FetchMultiPriceError;

export const handleGetPrice = async (
  ctx: RouterContext<RouteParams, State>,
): Promise<void> => {
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = { msg: "missing request parameters" };
    return;
  }

  const result = ctx.request.body({ type: "json" });
  type Body = { base: Base };
  const { base }: Body = await result.value;

  return pipe(
    Id.getIdBySymbol(ctx.app.state.idMapCache, ctx.params.symbol!),
    TE.chain((id): TE.TaskEither<GetPriceError, number> => (
      getPrice(
        ctx.app.state.priceCache,
        ctx.app.state.historicPriceCache,
        id,
        base,
      )
    )),
    TE.bimap((cError): undefined => {
      const { error } = cError;
      console.error(error);

      switch (cError.type) {
        case "FetchError":
          ctx.response.status = 500;
          return;
        case "BadResponse":
          ctx.response.status = cError.status;
          ctx.response.body = { msg: error.message };
          return;
        case "DecodeError":
        case "UnknownSymbol":
          ctx.response.status = 500;
          ctx.response.body = { msg: error.message };
          return;
      }
    }, (price) => {
      ctx.response.body = { price };
      return undefined;
    }),
    (te) => te().then(() => undefined),
  );
};
