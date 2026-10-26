# Decant Finder

Add the perfume decants you want and see the cheapest way to buy them from Indian decant sellers, with shipping included. There's also a Deals tab showing the biggest price gaps between sellers and this week's price drops.

**Live site:** https://janeshs.github.io/decant-finder/

## How it works

- `index.html` is the whole app: one page with no build step. GitHub Pages serves it straight from the `main` branch.
- Prices come from a private Google Sheet (the Decant Tracker), which reads sellers' public price lists once a day. A small Apps Script file in that sheet (`PublicFeed.gs`, kept here for reference) publishes only seller names, perfumes, sizes, prices and shipping rules as JSON. The page loads that JSON and does all the matching and calculating in the visitor's browser.
- Seller shipping rules and whether a seller appears in the app are set in the tracker's **Sources** tab, columns G–K.

## Updating

- **Prices:** nothing to do. The feed rebuilds every hour from the tracker.
- **The page:** edit `index.html` and commit. GitHub Pages republishes within a minute or two.
- **The feed script:** paste the new `PublicFeed.gs` into Apps Script, save, then go to Deploy → Manage deployments → pencil icon → Version: *New version* → Deploy. The URL stays the same.
