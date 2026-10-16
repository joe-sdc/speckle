# Speckle

A Wordle-style word game with British English spellings and words. Guess the five-letter word in five goes.

## Shared words and the admin area

Everyone gets the same word. By default it is a daily word that changes at midnight UK time. At `/admin/` the admin can pick any word from the list and a time period (15 minutes up to 30 days). Until the time runs out, every player gets that word. After that, the daily word returns.

This needs the Netlify version of the site, because the chosen word is stored on the server (Netlify Functions and Blobs).

Setup on Netlify:

1. Import this repository as a new project. The settings come from `netlify.toml`.
2. Under Site configuration > Environment variables, add `ADMIN_PASSWORD` with a password of your choice (scope: Functions).
3. Redeploy so the password takes effect.

## Files

- `index.html`: the game
- `words.js`: word lists and the daily-word rule, used by the game and the admin page
- `admin/index.html`: the admin page
- `netlify/functions/settings.mts`: stores and serves the shared word at `/api/settings`
