import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { Base } from "./base_unit.ts";
import { getUnixTime, LRU, O, pipe, subDays, TE } from "./deps.ts";
import * as Id from "./id.ts";
import * as A from "https://deno.land/x/fun@v1.0.0/array.ts";
import { State } from "./server.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";
import { GetIdError } from "./id.ts";

export type HistoricPriceCache = LRU<number>;

/**
 * milisecond unix timestamp
 */
type Timestamp = number;
type NumberInTime = [Timestamp, number];
type PriceInTime = [Timestamp, number];

type History = {
  prices: PriceInTime[];
  // deno-lint-ignore camelcase
  market_caps: NumberInTime[];
  // deno-lint-ignore camelcase
  total_volumes: NumberInTime[];
};

const toUnixTimestamp = (msTimestamp: number): number => msTimestamp / 1000;

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setUTCHours(0);
  d.setUTCMinutes(0);
  d.setUTCSeconds(0);
  d.setUTCMilliseconds(0);
  return d;
};

type NoHistoricPrice = { type: "NoHistoricPrice"; error: Error };
type GetHistoricPriceError =
  | BadResponse
  | DecodeError
  | FetchError
  | NoHistoricPrice;
/**
 * In order to decide whether we can calculate history we look in the cache. On
 * a cache miss, we fetch the historic prices back to the sought after date. As
 * CoinGecko returns us all days since then, we immediately cache those too.
 */
const getHistoricPrice = (
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
  daysAgo: number,
): TE.TaskEither<GetHistoricPriceError, number> => {
  const targetTimestamp = pipe(
    new Date(Date.now()),
    // To compare the date to CoinGecko timestamps we need start-of-day
    // timestamps. We drop the time from the datetime.
    startOfDay,
    (now) => subDays(now, daysAgo),
    getUnixTime,
  );

  const key = `${targetTimestamp}-${id}-${base}`;

  const cachedPrice = historicPriceCache.get(key);
  if (cachedPrice !== undefined) {
    return TE.right(cachedPrice);
  }

  // CoinGecko uses 'days' as today up to but excluding n 'days' ago, we want
  // including so we add 1 here.
  const coinGeckoDaysAgo = daysAgo + 1;
  const uri =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${base}&days=${coinGeckoDaysAgo}&interval=daily`;
  return pipe(
    () => fetch(uri),
    TE.fromFailableTask((error) => {
      return ({ type: "FetchError" as const, error: error as Error });
    }),
    TE.chain((res): TE.TaskEither<GetHistoricPriceError, History> => {
      if (res.status === 429) {
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
        () => res.json() as Promise<History>,
        TE.fromFailableTask((error) => {
          return ({ type: "DecodeError", error: error as Error });
        }),
      );
    }),
    TE.chain((history): TE.TaskEither<GetHistoricPriceError, number> => {
      // Cache historic prices
      history.prices.forEach((pricePoint: PriceInTime) => {
        const [msTimestamp, price] = pricePoint;
        const timestamp = toUnixTimestamp(msTimestamp);
        const historicPointKey = `${timestamp}-${id}-${base}`;
        historicPriceCache.set(historicPointKey, price);
      });

      // Oldest price returned, in position 0, is the sought after price. We return
      // it.
      return pipe(
        history.prices,
        A.lookup(0),
        O.fold(
          () => {
            return TE.left({
              type: "NoHistoricPrice",
              error: new Error(`No historic price for id ${id}`),
            });
          },
          (priceInTime) => TE.right(priceInTime[1]),
        ),
      );
    }),
  );
};

export const getTodayTimestamp = () =>
  pipe(
    new Date(Date.now()),
    startOfDay,
    getUnixTime,
  );

export const getPriceChange = (
  historicPriceCache: HistoricPriceCache,
  id: string,
  base: Base,
  daysAgo: number,
): TE.TaskEither<GetHistoricPriceError, number> => (
  pipe(
    getHistoricPrice(historicPriceCache, id, base, daysAgo),
    TE.chain((historicPrice) => {
      const todayTimestamp = getTodayTimestamp();
      const key = `${todayTimestamp}-${id}-${base}`;
      const todayPrice = historicPriceCache.get(key);

      if (todayPrice === undefined) {
        return getHistoricPrice(historicPriceCache, id, base, daysAgo);
      }

      return TE.right(todayPrice / historicPrice - 1);
    }),
  )
);

type PriceChangeError = GetIdError | GetHistoricPriceError;

export const handleGetPriceChange = async (
  ctx: RouterContext<RouteParams, State>,
): Promise<void> => {
  const symbol = ctx.params.symbol!;
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = { msg: "missing request parameters" };
    return;
  }

  const result = ctx.request.body({ type: "json" });
  type Body = { base: Base; daysAgo: number };
  const { base, daysAgo }: Body = await result.value;

  return pipe(
    Id.getIdBySymbol(ctx.app.state.idMapCache, symbol),
    TE.widen<PriceChangeError>(),
    TE.chain((id): TE.TaskEither<PriceChangeError, number> =>
      getPriceChange(ctx.app.state.historicPriceCache, id, base, daysAgo)
    ),
    TE.mapLeft((error) => {
      switch (error.type) {
        case "UnknownSymbol":
          ctx.response.status = 404;
          ctx.response.body = {
            msg: `no coingecko symbol ticker found for ${symbol}`,
          };
          return undefined;
        case "FetchError":
        case "DecodeError":
          ctx.response.status = 404;
          ctx.response.body = {
            msg: `no coingecko symbol ticker found for ${symbol}`,
          };
          return undefined;
        case "BadResponse":
          ctx.response.status = error.status;
          ctx.response.body = {
            msg: error.error.message,
          };
          return undefined;
        case "NoHistoricPrice":
          ctx.response.status = 404;
          ctx.response.body = {
            msg: `no historic price found for ${symbol}, ${daysAgo} days ago`,
          };
          return undefined;
      }
    }),
    TE.map(
      (priceChange) => {
        ctx.response.body = { priceChange };
      },
    ),
    ((a) => a().then(undefined)),
  );
};
