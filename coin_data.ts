import { A, E, pipe, RouteParams, RouterContext, T, TE } from "./deps.ts";
import * as Id from "./id.ts";
import { State } from "./server.ts";
import * as Price from "./price.ts";
import * as PriceChange from "./price_change.ts";
import { Base } from "./base_unit.ts";

export const handleGetCoinData = async (
  ctx: RouterContext<RouteParams, State>,
): Promise<void> => {
  if (!ctx.request.hasBody) {
    ctx.response.status = 400;
    ctx.response.body = { msg: "missing request parameters" };
    return;
  }

  const result = ctx.request.body({ type: "json" });
  type Body = { coins: string[] };
  const { coins }: Body = await result.value;

  const coinData: [
    string[],
    ...[string, number, number, number, number, number, number][],
  ] = [
    [
      "name",
      "price",
      "1d change",
      "7d change",
      "30d change",
      "180d change",
      "7d btc change",
    ],
  ];

  const getOrThrow = <A>(e: E.Either<{ error: { message: string } }, A>) => {
    if (E.isLeft(e)) {
      throw e.left;
    }

    return (e as { right: A }).right;
  };

  const traverseSeq = A.traverse(TE.ApplicativeSeq);
  const prices = await pipe(
    coins,
    traverseSeq((coin) => Id.getIdBySymbol(ctx.app.state.idMapCache, coin)),
    TE.chain(
      (ids) =>
        Price.getPrices(
          ctx.app.state.priceCache,
          ctx.app.state.historicPriceCache,
          ids,
          "usd",
        ),
    ),
    T.map(getOrThrow),
  )();

  const getNDayChanges = (id: string, days: number, base: Base) =>
    pipe(
      PriceChange.getPriceChange(
        ctx.app.state.historicPriceCache,
        id,
        base,
        days,
      ),
      T.map(getOrThrow),
    )();

  for (const coin of coins) {
    const id = await pipe(
      Id.getIdBySymbol(ctx.app.state.idMapCache, coin),
      T.map(getOrThrow),
    )();
    const change180Days = await getNDayChanges(id, 180, "usd");
    const change30Days = await getNDayChanges(id, 30, "usd");
    const change7Days = await getNDayChanges(id, 7, "usd");
    const change7DaysBtc = await getNDayChanges(id, 7, "btc");
    const change1Day = await getNDayChanges(id, 1, "usd");

    coinData.push([
      coin.toUpperCase(),
      prices[id],
      change1Day,
      change7Days,
      change30Days,
      change180Days,
      change7DaysBtc,
    ]);
  }

  ctx.response.body = coinData;
};
