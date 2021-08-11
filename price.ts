import {
  E,
  LRU,
  pipe,
  PQueue,
  RouteParams,
  RouterMiddleware,
  TE,
} from "./deps.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";
import * as Id from "./id.ts";
import * as PriceChange from "./price_change.ts";
import { GetIdError } from "./id.ts";
import { HistoricPriceCache } from "./price_change.ts";
import { Base } from "./base_unit.ts";
import { State } from "./server.ts";
import * as Log from "./log.ts";

export type PriceCache = LRU<number>;

/**
 * Structure CoinGecko uses in simple price responses.
 */
type RawPrices = Record<string, MultiPrice>;

// where keys are the base denominations we asked for.
type MultiPrice = Record<string, number>;

type NotFound = { type: "NotFound"; error: Error };
type FetchPriceError =
  | GetIdError
  | FetchError
  | DecodeError
  | BadResponse
  | NotFound;

const fetchPriceQueue = new PQueue({
  // We set concurrency to 1 for max cache use.
  concurrency: 1,
  interval: 60000,
  intervalCap: 25,
});

const fetchPrices = (
  historicPriceCache: HistoricPriceCache,
  ids: string[],
  base: Base,
): TE.TaskEither<FetchPriceError, Record<string, number>> => {
  const uri = `https://api.coingecko.com/api/v3/simple/price?ids=${
    ids.join(",")
  }&vs_currencies=${base}`;

  return pipe(
    () => fetch(uri),
    TE.fromFailableTask((error) => ({
      type: "FetchError" as const,
      error: error as Error,
    })),
    TE.chain((res): TE.TaskEither<FetchPriceError, Record<string, number>> => {
      if (res.status === 429) {
        Log.warn("hit coingecko rate limit");
        // If we have shot too many price requests already, fallback to todays
        // cached price.
        const todayTimestamp = PriceChange.getTodayTimestamp();
        const prices = ids.reduce((map, id) => {
          const key = `${todayTimestamp}-${id}-${base}`;
          const price = historicPriceCache.get(key);
          if (price !== undefined) {
            map[id] = price;
          }
          return map;
        }, {} as Record<string, number>);

        if (Object.keys(prices).length === ids.length) {
          // We had all prices in historic cache.
          Log.debug("successfully fell back tot historic price cache");
          return TE.right(prices);
        }

        return TE.left({
          type: "BadResponse",
          error: new Error("hit CoinGecko API rate limit"),
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
        () => res.json() as Promise<RawPrices>,
        TE.fromFailableTask((error): FetchPriceError => (
          ({ type: "DecodeError", error: error as Error })
        )),
        TE.chain(
          (
            rawPrices,
          ): TE.TaskEither<FetchPriceError, Record<string, number>> => {
            if (Object.keys(rawPrices).length === 0) {
              return TE.left({
                type: "NotFound",
                error: new Error(`no price found for valid identifier ${ids}`),
              });
            }

            const prices = ids.reduce((map, id) => {
              map[id] = rawPrices[id][base];
              return map;
            }, {} as Record<string, number>);

            return TE.right(prices);
          },
        ),
      );
    }),
  );
};

const getPrices = (
  priceCache: PriceCache,
  historicPriceCache: HistoricPriceCache,
  ids: readonly string[],
  base: Base,
): TE.TaskEither<FetchPriceError, Record<string, number>> => {
  const cachedPrices: Record<string, number> = {};
  const pricesToFetch: string[] = [];

  ids.forEach((id) => {
    const cacheKey = `price-${id}-${base}`;
    const cPrice = priceCache.get(cacheKey);
    if (cPrice !== undefined) {
      Log.debug(`price cache hit for ${id}`);
      cachedPrices[id] = cPrice;
    }

    Log.debug(`price cache miss for ${id}`);
    pricesToFetch.push(id);
  });

  return pipe(
    () =>
      fetchPriceQueue.add(fetchPrices(historicPriceCache, pricesToFetch, base)),
    TE.map((prices) => {
      // Store newly fetched prices in cache
      Object.entries(prices).forEach(([id, price]) => {
        Log.debug(`cached price ${id}`);
        priceCache.set(id, price);
      });

      return { ...cachedPrices, ...prices };
    }),
  );
};

const getPrice = (
  priceCache: PriceCache,
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
): TE.TaskEither<FetchPriceError, number> => {
  return pipe(
    getPrices(priceCache, historicPriceCache, [id], base),
    TE.map((prices) => prices[id]),
  );
};

export const handleGetPrice: RouterMiddleware<RouteParams, State> = async (
  ctx,
): Promise<void> => {
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = { msg: "missing request parameters" };
    return;
  }

  const result = ctx.request.body({ type: "json" });
  type Body = { base: Base };
  const { base }: Body = await result.value;

  Log.debug(`asked for price: ${ctx.params.symbol}`);

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
        Log.error(error.message, { error });

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
