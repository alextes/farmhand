import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { LRU, pipe, TE } from "./deps.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";
import * as Id from "./id.ts";
import { GetIdError } from "./id.ts";
import { State } from "./server.ts";

export type PriceCache = LRU<MultiPrice>;

/**
 * Structure CoinGecko uses in simple price responses
 */
type RawPrice = Record<string, MultiPrice>;

export type MultiPrice = {
  usd: number;
  btc: number;
  eth: number;
};

type FetchMultiPriceError = FetchError | DecodeError | BadResponse;

const fetchMultiPrice = (
  priceCache: PriceCache,
  id: string,
): TE.TaskEither<FetchMultiPriceError, MultiPrice> => {
  const cacheKey = `price-${id}`;
  const cValue = priceCache.get(cacheKey);
  if (cValue !== undefined) {
    return TE.right(cValue);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;

  return pipe(
    () => fetch(uri),
    TE.fromFailableTask((error) => {
      return ({ type: "FetchError" as const, error: error as Error });
    }),
    TE.chain((res): TE.TaskEither<FetchMultiPriceError, RawPrice> => {
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
        () => res.json() as Promise<RawPrice>,
        TE.fromFailableTask((error) => (
          ({ type: "DecodeError", error: error as Error })
        )),
      );
    }),
    TE.map((rawPrice) => {
      const multiPrice = rawPrice[id];
      priceCache.set(cacheKey, multiPrice);
      return multiPrice;
    }),
  );
};

type GetPriceError = GetIdError | FetchMultiPriceError;

export const handleGetPrice = (
  ctx: RouterContext<RouteParams, State>,
): Promise<void> => (
  pipe(
    Id.getIdBySymbol(ctx.app.state.idMapCache, ctx.params.symbol!),
    TE.chain((id): TE.TaskEither<GetPriceError, MultiPrice> => (
      fetchMultiPrice(ctx.app.state.priceCache, id)
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
    }, (multiPrice) => {
      ctx.response.body = multiPrice;
      return undefined;
    }),
    (te) => te().then(() => undefined),
  )
);
