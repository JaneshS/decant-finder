# Decant Saver

Add the perfume decants you want, one at a time or by pasting a whole WhatsApp/Reddit list, and see the cheapest way to buy them from Indian decant sellers, with shipping included.

**Live site:** https://janeshs.github.io/decant-finder/

## What's on the site

- **Plan an order:** your list on the left, your plan on the right. A three-step guide at the top (add decants, check the plan, message each seller) highlights the step you're on.
  - **Message each seller:** every seller in the plan gets a card with only their decants. "Message on WhatsApp" opens a chat with that seller with the order typed in (when their number is in the Sources tab); "Copy order" copies the same message.
  - **Compare sellers:** what the same list costs bought other ways (everything one seller has from them, the rest the cheapest way elsewhere). "Use this" switches your plan to that option.
- **Browse prices:** every perfume against the sellers you choose (one, several or all). Tap a price to add it; that also opens every size of the perfume with the price per ml. On phones the table becomes one card per perfume, with the seller's own sizes and a "compare one size" list. "₹ per ml" switches the table to price per ml.
- **New this week:** perfumes that showed up for the first time in the last 7 days.
- **Report a problem:** a short form (from the header, footer or the flag on any perfume) that adds a row to the tracker's **Reports** tab. No WhatsApp messages or emails.
- **Disclaimers:** two short lines under the header with an expandable full disclaimer, and a "Before you use" notice people accept on their first visit.

Every seller name links to that seller's own sheet or website. There's a light/dark switch at the top right.

## How it works

- `index.html` is the whole site: one page with no build step. GitHub Pages serves it straight from the `main` branch. The name is set once, in `CONFIG.name` near the top of the script.
- Prices come from a private Google Sheet (the Decant Tracker), which reads sellers' public price lists once a day. A small Apps Script file in that sheet (`PublicFeed.gs`, kept here for reference) publishes only seller names, links, WhatsApp numbers you choose to add, perfumes, sizes, prices and shipping rules as JSON, and receives reports from the site. The page does all the matching and calculating in the visitor's browser.
- Seller settings live in the tracker's **Sources** tab, columns G–M: show in app, display name, free shipping from ₹ and/or number of decants (either counts), shipping fee, an optional link (otherwise the sheet link in column C is used) and an optional WhatsApp number (with country code; a 10-digit number gets 91 added). Numbers are public, so only add ones sellers are happy to share.
- A perfume counts as **new** when every seller listing it added it in the last 7 days, it doesn't appear earlier in the Changes log, and it wasn't a same-day rename.

## How the plan is worked out

The page searches every combination of sellers (branch and bound) and, for each one, works out the cheapest way to reach each seller's free-shipping rule. It shows:

- **Best value:** the lowest total, where each extra parcel has to save at least ₹50 (`minSavingPerParcel` in `index.html`).
- **Fewest parcels:** the cheapest way to buy everything from as few sellers as possible.

Checked against an exact optimisation solver on 300 random orders, the plans match exactly whenever 3 or fewer of the sellers involved have free-shipping rules. Beyond that, the result can be a few rupees above the true minimum. There's a time limit of 1.5 s per search, but typical orders take a few milliseconds.

## Updating

- **Prices:** nothing to do. The feed rebuilds every hour from the tracker.
- **Reports:** check the Reports tab before the daily run; the last column is yours for notes.
- **The page:** edit `index.html` and commit. GitHub Pages republishes within a minute or two.
- **The feed script:** paste the new `PublicFeed.gs` into Apps Script, save, then go to Deploy → Manage deployments → pencil icon → Version: *New version* → Deploy. The URL stays the same.
