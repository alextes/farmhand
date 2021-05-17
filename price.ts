import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { E, LRU, pipe, TE } from "./deps.ts";
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

type NotFound = { type: "NotFound"; error: Error };
type FetchPriceError =
  | GetIdError
  | FetchError
  | DecodeError
  | BadResponse
  | NotFound;

export type Base = "usd" | "btc" | "eth";

const fetchPrice = (
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
): TE.TaskEither<FetchPriceError, number> => {
  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${base}`;

  return pipe(
    () => fetch(uri),
    TE.fromFailableTask((error) => {
      return ({ type: "FetchError" as const, error: error as Error });
    }),
    TE.chain((res): TE.TaskEither<FetchPriceError, number> => {
      if (res.status === 429) {
        // If we have shot too many price requests already, fallback to todays
        // cached price.
        const todayTimestamp = PriceChange.getTodayTimestamp();
        const key = `${todayTimestamp}-${id}-${base}`;
        const price = historicPriceCache.get(key);
        if (price !== undefined) {
          return TE.right(price);
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
        TE.fromFailableTask((error): FetchPriceError => (
          ({ type: "DecodeError", error: error as Error })
        )),
        TE.chain((rawPrice): TE.TaskEither<FetchPriceError, number> => {
          if (Object.keys(rawPrice).length === 0) {
            return TE.left({
              type: "NotFound",
              error: new Error(`no price found for valid identifier ${id}`),
            });
          }

          return TE.right(rawPrice[id][base]);
        }),
      );
    }),
  );
};

const getPrice = (
  priceCache: PriceCache,
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
) => {
  const cacheKey = `price-${id}-${base}`;
  return pipe(
    priceCache.get(cacheKey),
    (mPrice) =>
      typeof mPrice === "number"
        ? TE.right(mPrice)
        : fetchPrice(historicPriceCache, id, base),
    TE.map((price) => {
      priceCache.set(cacheKey, price);
      return price;
    }),
  );
};

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

  const ePrice = await pipe(
    Id.getIdBySymbol(ctx.app.state.idMapCache, ctx.params.symbol!),
    TE.chain((id) => (
      getPrice(
        ctx.app.state.priceCache,
        ctx.app.state.historicPriceCache,
        id,
        base,
      )
    )),
  )();

  return pipe(
    ePrice,
    E.fold(
      (priceError) => {
        const { error } = priceError;
        console.error(error);

        switch (priceError.type) {
          case "FetchError":
            ctx.response.status = 500;
            return;
          case "BadResponse":
            ctx.response.status = priceError.status;
            ctx.response.body = { msg: error.message };
            return;
          case "DecodeError":
          case "UnknownSymbol":
            ctx.response.status = 500;
            ctx.response.body = { msg: error.message };
            return;
        }
      },
      (price) => {
        ctx.response.body = { price };
      },
    ),
  );
};
