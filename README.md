# Speckle

A Wordle-style word game with British English spellings and words. Guess the five-letter word in five goes.

## Shared words and the admin area

Everyone gets the same word. By default it is a daily word that changes at midnight UK time. At `/admin/` the admin can pick any word from the list and a time period (15 minutes up to 30 days). Until the time runs out, every player gets that word. After that, the daily word returns.

This needs the Netlify version of the site, because the chosen word is stored on the server (Netlify Functions and Blobs).

Setup on Netlify:

1. Import this repository as a new project. The settings come from `netlify.toml`.
2. Under Site configuration > Environment variables, add `ADMIN_PASSWORD` with a password of your choice (scope: Functions).
3. Redeploy so the password takes effect.

## Word lists and Speckle Specials

The admin area shows every word list. The main list can be searched and edited: add or remove words and change the note shown after each game. Speckle Specials are extra themed lists. You can add a ready-made one (the Dickens Special ships in `specials/`), upload or paste your own, or generate one from a book's text. Loading a list makes it the source of the daily word and practice words. Its words also become valid guesses, even names that aren't in the dictionary.

To add another ready-made special, put a JSON file in `specials/` in the same shape as `dickens.json` and list it in `specials/index.json`.

## Files

- `index.html`: the game
- `words.js`: word lists and the daily-word rule, used by the game and the admin page
- `admin/index.html`: the admin page
- `specials/`: ready-made Speckle Specials
- `netlify/functions/settings.mts`: stores the shared word and word lists (`/api/settings`, `/api/list`, `/api/seo`, `/api/admin/lists`)
- `netlify/edge-functions/noindex.ts`: adds the no-index header and meta tag to every page when the admin switch is on

## Hiding Speckle from search engines

In the admin area, the **Search engines** switch controls the no-index tag. It is **on by default**.

- When on, every page and file on the site is sent with an `X-Robots-Tag: noindex, nofollow` header, and every HTML page also gets `<meta name="robots" content="noindex, nofollow">`.
- A change reaches the whole site within about 30 seconds. If the setting cannot be read, the site stays hidden.
- Do not add a `Disallow` rule to `robots.txt`: search engines have to fetch the pages to see the no-index tag.
- The GitHub Pages copy is not covered by the switch. Turn Pages off in the repository settings if it should not be listed.
