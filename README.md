# Decant Finder

Add the perfume decants you want and see the cheapest way to buy them from Indian decant sellers, with shipping included. There's also a Deals tab showing the biggest price gaps between sellers and this week's price drops.

**Live site:** https://janeshs.github.io/decant-finder/

## How it works

- `index.html` is the whole app: one page with no build step. GitHub Pages serves it straight from the `main` branch.
- Prices come from a private Google Sheet (the Decant Tracker), which reads sellers' public price lists once a day. A small Apps Script file in that sheet (`PublicFeed.gs`, kept here for reference) publishes only seller names, perfumes, sizes, prices and shipping rules as JSON. The page loads that JSON and does all the matching and calculating in the visitor's browser.
- Seller shipping rules and whether a seller appears in the app are set in the tracker's **Sources** tab, columns G–K.

## How the plan is worked out

The page searches every combination of sellers (branch and bound) and, for each one, works out the cheapest way to reach each seller's free-shipping rule. It shows three plans:

- **Best value:** the lowest total, where each extra parcel has to save at least ₹50 (`minSavingPerParcel` in `index.html`).
- **Fewest parcels:** the cheapest way to buy everything from as few sellers as possible.
- **Lowest total:** used in the "adding another seller would save only ₹X" note.

Checked against an exact optimisation solver on 300 random orders, the plans match exactly whenever 3 or fewer of the sellers involved have free-shipping rules. Beyond that, the result can be a few rupees above the true minimum. There's a time limit of 1.5 s per search, but typical orders take a few milliseconds.

## Updating

- **Prices:** nothing to do. The feed rebuilds every hour from the tracker.
- **The page:** edit `index.html` and commit. GitHub Pages republishes within a minute or two.
- **The feed script:** paste the new `PublicFeed.gs` into Apps Script, save, then go to Deploy → Manage deployments → pencil icon → Version: *New version* → Deploy. The URL stays the same.
