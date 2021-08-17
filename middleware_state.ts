import type { IdMapCache } from "./id.ts";
import type { HistoricPriceCache } from "./price_change.ts";
import type { PriceCache } from "./price.ts";

export type State = {
  idMapCache: IdMapCache;
  priceCache: PriceCache;
  historicPriceCache: HistoricPriceCache;
};
