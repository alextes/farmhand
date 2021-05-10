import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { Base } from "./base_unit.ts";
import { E, getUnixTime, LRU, O, pipe, subDays, TE } from "./deps.ts";
import { fetchCoinGeckoIdMap } from "./id.ts";
import * as A from "https://deno.land/x/fun@v1.0.0/array.ts";

const historicPriceCache = new LRU<number>({ capacity: 100000 });

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

type ResponseError = {
  kind: "UnknownError" | "NoHistoricPrice" | "TooManyRequests";
  status: number;
};

/**
 * In order to decide whether we can calculate history we look in the cache. On
 * a cache miss, we fetch the historic prices back to the sought after date. As
 * CoinGecko returns us all days since then, we immediately cache those too.
 */
const getHistoricPrice = async (
  id: string,
  base: Base,
  daysAgo: number,
): Promise<E.Either<ResponseError, number>> => {
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
    return E.right(cachedPrice);
  }

  // CoinGecko uses 'days' as today up to but excluding n 'days' ago, we want
  // including so we add 1 here.
  const coinGeckoDaysAgo = daysAgo + 1;
  const uri =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${base}&days=${coinGeckoDaysAgo}&interval=daily`;
  const res = await fetch(uri);

  if (res.status === 429) {
    return E.left({ kind: "TooManyRequests", status: 429 });
  }

  if (res.status !== 200) {
    console.error(`coingecko bad response ${res.status} ${res.statusText}`);
    return E.left({ kind: "UnknownError", status: 500 });
  }

  const history: History = await res.json();

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
      () => E.left({ kind: "NoHistoricPrice", status: 404 }),
      (priceInTime) => E.right(priceInTime[1]),
    ),
  );
};

const getPriceChange = (
  id: string,
  base: Base,
  daysAgo: number,
): TE.TaskEither<ResponseError, number> => (
  pipe(
    () => getHistoricPrice(id, base, daysAgo),
    TE.chain((historicPrice) => {
      const todayTimestamp = pipe(
        new Date(Date.now()),
        startOfDay,
        getUnixTime,
      );
      const key = `${todayTimestamp}-${id}-${base}`;
      const todayPrice = historicPriceCache.get(key);

      if (todayPrice === undefined) {
        return () => getHistoricPrice(id, base, daysAgo);
      }

      return TE.right(todayPrice / historicPrice - 1);
    }),
  )
);

export const handleGetPriceChange = async (
  // deno-lint-ignore no-explicit-any
  context: RouterContext<RouteParams, Record<string, any>>,
): Promise<void> => {
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
  const mId = idMap.get(symbol);

  if (mId === undefined) {
    context.response.status = 404;
    context.response.body = {
      msg: `no coingecko symbol ticker found for ${symbol}`,
    };
    return;
  }
  // TODO: pick the token with the highest market cap
  const id = mId[0];

  return pipe(
    getPriceChange(id, base, daysAgo),
    TE.mapLeft(
      (error) => {
        switch (error.kind) {
          case "NoHistoricPrice":
            context.response.status = error.status;
            context.response.body = { msg: "no market data for symbol" };
            break;
          case "TooManyRequests":
            context.response.status = error.status;
            context.response.body = {
              msg: "hit coingecko API request limit",
            };
            break;
          case "UnknownError":
            context.response.status = error.status;
            context.response.body = {
              msg: "Unknown server error",
            };
            break;
        }
      },
    ),
    TE.map(
      (priceChange) => {
        context.response.body = { priceChange };
      },
    ),
    ((a) => a().then(undefined)),
  );
};
