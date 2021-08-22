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
  if (typeof ticker !== "string") {
    throw new Error("ticker should be text")
  }

  var lowercaseTicker = ticker.toLowerCase();
  var lowercaseBase = base.toLowerCase();
  var cacheKey = `price-${lowercaseTicker}-${lowercaseBase}`

  var cache = CacheService.getScriptCache();
  var cached = cache.get(`price-${lowercaseTicker}-${lowercaseBase}`);
  if (cached != null) {
    console.log(ticker, base, "cache hit");
    return Number(cached);
  }
  console.log(ticker, base, "cache miss");

  var options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify({
       base: lowercaseBase,
    })
  };
  var response = UrlFetchApp.fetch(`https://farmhand-hosnpsxrga-ew.a.run.app/coin/${lowercaseTicker}/price`, options);
  if (response.getResponseCode() === 404) {
    return "N/A"
  }
  var { price } = JSON.parse(response.getContentText());

  cache.put(`price-${lowercaseTicker}-${lowercaseBase}`, price, 3600);

  return Number(price);
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
  if (typeof ticker !== "string") {
    throw new Error("ticker should be text")
  }

  var lowercaseTicker = ticker.toLowerCase();
  var lowercaseBase = base.toLowerCase();
  var cacheKey = `price-change-${lowercaseTicker}-${daysAgo}-${lowercaseBase}`

  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached != null) {
    return Number(cached);
  }

  var options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify({
       base: lowercaseBase,
       daysAgo,
    })
  };
  var response = UrlFetchApp.fetch(`https://farmhand-hosnpsxrga-ew.a.run.app/coin/${lowercaseTicker}/price-change/`, options);
  if (response.getResponseCode() === 404) {
    return "N/A"
  }
  var { priceChange } = JSON.parse(response.getContentText());

  cache.put(cacheKey, priceChange, 3600);

  return Number(priceChange);
}

/**
 * Returns prices and price changes for a whole list of tokens.
 * Example:
 * =FHCOINS("BTC,ETH,DPI")
 * 
 * @param {string} tickers - a comma separated list of coin tickers
 * @customfunction
 * @return a table of coin prices and price changes
 */
function FHCOINS(tickers) {
  if (tickers === undefined) {
    throw new Error("need a comma-separated string of tickers")
  }

  const tickerList = tickers.split(",");
  if (!tickerList.length > 0) {
      throw new Error("need a comma-separated string of tickers")
  }

  var lowercaseTickers = tickerList.map(ticker => ticker.toLowerCase());
  var cacheKey = `coins-${tickers.join()}`
  
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached != null) {
    return JSON.parse(cached);
  }

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ coins: lowercaseTickers})
  }
  var response = UrlFetchApp.fetch(`https://farmhand-hosnpsxrga-ew.a.run.app/coin-data/`, options);
  if (response.getResponseCode() === 404) {
    return "N/A"
  }

  cache.put(cacheKey, response.getContentText())

  return JSON.parse(response.getContentText());
}
