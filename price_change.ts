import { Base } from "./base_unit.ts";
import { E, getUnixTime, LRU, pipe, subDays } from "./deps.ts";

const historicPriceCache = new LRU<number>({ capacity: 100000 });

/**
 * unix timestamp
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

/**
 * In order to decide whether we can calculate history we look in the cache. On
 * a cache miss, we fetch the historic prices back to the sought after date. As
 * CoinGecko returns us all days since then, we immediately cache those too.
 */
const getHistoricPrice = async (
  daysAgo: number,
  id: string,
  base: Base,
): Promise<number> => {
  const targetTimestamp = pipe(
    new Date(Date.now()),
    // To compare the date to CoinGecko timestamps we need start-of-day
    // timestamps. We drop the time from the datetime.
    startOfDay,
    (now) => subDays(now, daysAgo),
    getUnixTime,
  );

  const key = `${targetTimestamp}-${id}-${base}`;

  const cHistoricPrice = historicPriceCache.get(key);
  if (cHistoricPrice !== undefined) {
    return cHistoricPrice;
  }

  // CoinGecko uses 'days' as today up to but excluding n 'days' ago, we want
  // including so we add 1 here.
  const coinGeckoDaysAgo = daysAgo + 1;
  const uri =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${base}&days=${coinGeckoDaysAgo}&interval=daily`;
  const res = await fetch(uri);

  if (res.status !== 200) {
    throw new Error(`coingecko bad response ${res.status} ${res.statusText}`);
  }

  const history: History = await res.json();

  const historicPrices = history.prices;

  historicPrices.forEach((pricePoint: PriceInTime) => {
    const [msTimestamp, price] = pricePoint;
    const timestamp = toUnixTimestamp(msTimestamp);
    const historicPointKey = `${timestamp}-${id}-${base}`;
    historicPriceCache.set(historicPointKey, price);
  });

  const [_, price] = historicPrices[0];
  return price;
};

export const getPriceChange = async (
  id: string,
  daysAgo: number,
  base: Base,
): Promise<E.Either<"NoHistoricPrice", number>> => {
  const historicPrice = await getHistoricPrice(daysAgo, id, base);

  if (historicPrice === undefined) {
    return E.left("NoHistoricPrice");
  }

  const todayTimestamp = pipe(
    new Date(Date.now()),
    startOfDay,
    getUnixTime,
  );
  const todayPrice = historicPriceCache.get(`${todayTimestamp}-${id}-${base}`);

  if (todayPrice === undefined) {
    throw new Error("expected today's price to be cached but it wasn't");
  }

  return E.right(todayPrice / historicPrice - 1);
};
