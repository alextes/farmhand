import { LRU, pipe, TE } from "./deps.ts";
import { ApiError, decodeCoingeckoRequest } from "./coingecko.ts";

type HttpError = { kind: "httpError"; error: Error };

/**
 * Structure CoinGecko uses in simple price responses
 */
type RawPrice = Record<string, Price>;

export type Price = {
  usd: number;
  btc: number;
  eth: number;
};

const oneHourInMs = 3600000;
const priceCache = new LRU<Price>({ capacity: 200, stdTTL: oneHourInMs });

export const getPricesById = (
  id: string,
): TE.TaskEither<HttpError | ApiError, Price> => {
  const cacheKey = `price-${id}`;
  const cValue = priceCache.get(cacheKey);
  if (cValue !== undefined) {
    return TE.right(cValue);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;

  return pipe(
    () => fetch(uri),
    TE.fromFailableTask<HttpError, Response>(
      (e) => ({ kind: "httpError", error: (new Error(`${e}`)) }),
    ),
    TE.widen<ApiError>(),
    TE.chain<ApiError | HttpError, Response, RawPrice>((res) =>
      decodeCoingeckoRequest<RawPrice>(res)
    ),
    TE.map(
      (rawPrice: RawPrice): Price => {
        priceCache.set(cacheKey, rawPrice[id]);
        return rawPrice[id];
      },
    ),
  );
};
