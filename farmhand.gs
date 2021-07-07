/**
 * Fetches the current price for a given token.
 * example:
 * =FHPRICE("BTC", "USD")
 *
 * @param {string} ticker - the ticker symbol you want the price for.
 * @param {string} [base] - the currency to denominate the price in.
 * @customfunction
 * @return a price
 **/
function FHPRICE(ticker, base = "usd") {
  if (ticker === undefined) {
    throw new Error("need a ticker to quote")
  }

  var lowercaseTicker = ticker.toLowerCase();
  var lowercaseBase = base.toLowerCase();

  var cache = CacheService.getScriptCache();
  var cached = cache.get(`price-${lowercaseTicker}-${lowercaseBase}`);
  if (cached != null) {
    console.log(ticker, base, "cache hit");
    return Number(cached);
  }
  console.log(ticker, base, "cache miss");

  var response = UrlFetchApp.fetch(`https://farmhand-xebhza4nba-ew.a.run.app/coin/${lowercaseTicker}/price`);
  var price = JSON.parse(response.getContentText());

  cache.put(`price-${lowercaseTicker}-usd`, price.usd, 3600);
  cache.put(`price-${lowercaseTicker}-btc`, price.btc, 3600);
  cache.put(`price-${lowercaseTicker}-eth`, price.eth, 3600);

  return Number(price[lowercaseBase]);
}

/**
 * Calculates the percent change in a given token's price.
 * example:
 * =FHCHANGE("BTC", 7, "USD")
 *
 * @param {string} ticker - the ticker symbol of the token you want the price for.
 * @param {string} [daysAgo] - number of days back in time to compare the price to.
 * @param {string} [base] - the currency to denominate the price in.
 * @customfunction
 * @return a percent change in price
 **/
function FHCHANGE(ticker, daysAgo = 1, base = "usd") {
  if (ticker === undefined) {
    throw new Error("need a ticker to quote")
  }

  var lowercaseTicker = ticker.toLowerCase();
  var lowercaseBase = base.toLowerCase();

  var cache = CacheService.getScriptCache();
  var cached = cache.get(`priceChange-${lowercaseTicker}-${daysAgo}-${lowercaseBase}`);
  if (cached != null) {
    return Number(cached);
  }

  var response = UrlFetchApp.fetch(`https://farmhand-xebhza4nba-ew.a.run.app/coin/${lowercaseTicker}/price-change/${daysAgo}`);
  var priceChange = JSON.parse(response.getContentText());

  cache.put(`priceChange-${lowercaseTicker}-${daysAgo}-usd`, priceChange.usd, 3600);
  cache.put(`priceChange-${lowercaseTicker}-${daysAgo}-btc`, priceChange.btc, 3600);
  cache.put(`priceChange-${lowercaseTicker}-${daysAgo}-eth`, priceChange.eth, 3600);

  return Number(priceChange[lowercaseBase]);
}
