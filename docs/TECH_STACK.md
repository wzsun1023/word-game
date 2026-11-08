# Guesswork: tech stack and design decisions

This document explains what Guesswork is built with and why it was built that way. The [README](../README.md) covers how to play, install and update the game. This page is for anyone who wants to understand or change the code.

## At a glance

| Area | Choice |
| --- | --- |
| App type | Progressive web app (PWA), installed from the browser to the home screen |
| Languages | Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies |
| Offline support | A service worker (`sw.js`) that caches every file on first visit |
| Saved data | `localStorage` on the player's own phone. No accounts, no server |
| Word data | Static files in `data/`, generated once by `tools/build_words.py` (Python) |
| Hosting | GitHub Pages, serving the `main` branch of this public repo |
| Icons | Drawn by `tools/make_icons.py` (Python + Pillow) |

## Why a web app instead of an app-store app

The goal was a game that friends and family can play offline on both iPhone and Android.

- **One codebase for both phones.** A PWA runs in Safari on iPhone and Chrome on Android, so there is no separate Swift and Kotlin app to keep in step.
- **No app store.** Publishing to the App Store costs a yearly fee and needs a review for every update. Google Play has its own fee and review. A PWA is shared with a link, and anyone can install it with "Add to Home Screen".
- **Updates without reinstalling.** A new version reaches players the next time they open the game with a connection.
- **It still feels like an app.** `manifest.webmanifest` sets `display: standalone` and portrait orientation, so the game opens full screen from its own icon with no browser bars. The `apple-mobile-web-app-*` meta tags in `index.html` do the same on iPhone, which reads those instead of the manifest.

The trade-off is that a PWA can't use some native features, such as push notifications on older iPhones. The game doesn't need any of them.

## Why no framework and no build step

The whole game is three files: `index.html`, `styles.css` and `app.js`. There is no React, no bundler and no `package.json`.

- **Small and fast.** The code is about 40 KB before the word lists. It loads instantly, even on a slow connection the first time.
- **Nothing to install or break.** Anyone can edit a file and push it. There's no toolchain to set up, no dependency updates, and no security alerts from third-party packages.
- **The game is small enough.** It has three screens (game, result and dialogs) and one piece of state. A framework would add more code than it saves.

`app.js` is a single function wrapped in `(() => { ... })()` so nothing leaks into the global scope. It is split into commented sections: coins, storage, data, scoring, DOM helpers, game, power-ups, result, stats, help and offline.

## How offline play works

`sw.js` is the service worker. It's what lets the game run with no signal.

1. **Install.** On the first visit, it downloads every file the game needs into a cache named by `CACHE` (for example `guesswork-v1`): the HTML, CSS, JavaScript, icons, and all six word files.
2. **Serve from the cache first.** Every later request is answered from the cache straight away, so the game opens instantly with or without internet.
3. **Refresh in the background.** At the same time, it fetches a fresh copy from the network and saves it for next time. This is the "stale-while-revalidate" pattern.
4. **Clean up.** When a new version activates, it deletes caches with any other name.

So when you publish an update, you change `CACHE` in `sw.js`. Phones see a new service worker, download the new files, and drop the old cache.

The word lists are bundled for the same reason. Meanings come from local files, not a dictionary website, so the meaning screen works on a plane.

## Saving progress on the phone

Everything a player has (coins, stats, streaks, the chosen word length, the game in progress) is stored as one JSON object in `localStorage` under the key `guesswork.v1`.

- **No server and no accounts.** Nothing is sent anywhere, so there is nothing to host, secure or pay for, and no personal data to look after.
- **Survives closing the app.** The current game is saved after every guess, so you can leave mid-word and pick up where you left off.
- **Tolerant loading.** `load()` fills in anything missing with defaults. That means older saves keep working when new fields are added (coins were added after the first release, and the stats array grew when extra tries arrived).

The trade-off is that progress lives on one device. Clearing Safari's website data or switching phones starts you fresh.

## Gameplay decisions

### Word length menu

The 5, 6 and 7 letter menu sits at the top of the game screen and is saved as `state.len`. A new round always uses the last length you picked, so you don't have to choose every time. Each length keeps its own game in progress and its own stats.

### Unlimited games without repeats

There's no daily puzzle. Each length has a shuffled queue of every answer (`nextAnswer()` uses a Fisher–Yates shuffle). Words come off the queue one at a time, so you won't see a repeat until you've played every word of that length. The queue is saved, so this holds across sessions.

### Scoring repeated letters correctly

`score()` makes two passes. The first marks exact matches green and counts the letters left over in the answer. The second marks a letter amber only while there are leftover copies of it. This means guessing a word with two E's against an answer with one E shows only one E as coloured, which is what players expect.

### Six guesses, and boards that fit any screen

Six guesses is the default (`BASE_GUESSES`). `sizeBoard()` works out the tile size from the space available, so 7-letter words and the 12-row board after buying extra tries still fit on a small phone without scrolling.

### Coins

Coins reward solving in fewer guesses and give players a way out of a stuck word.

| Solved in | 1 | 2 | 3 | 4 | 5 | 6 | 7 to 12 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coins | 60 | 50 | 40 | 30 | 20 | 10 | 5 |

- New players start with **50 coins**, so they can try a power-up straight away.
- **Hint (20 coins)** greys out 2 keyboard letters that aren't in the word. It only picks letters you haven't already tried, so a hint is never wasted.
- **6 more tries (50 coins)** can be bought once per word, either from the button above the keyboard or from the dialog that appears when you run out. Solving in the extra tries still earns 5 coins.
- **Two taps to buy.** The first tap changes the button to "Tap to buy" for 3 seconds. This stops an accidental tap from spending coins.

All prices and rewards are constants at the top of `app.js` (`START_COINS`, `PRICE`, `REWARD`, `REWARD_EXTRA`), so they're easy to tune.

### The meaning screen

When a round ends, the game switches to a separate result screen instead of a pop-up. It shows the word, coins earned, up to two meanings for each part of speech with an example sentence, and your streak. A full screen gives longer definitions room to breathe, and it makes the end of a round a natural pause before "Next word".

### Stats and streaks

Stats are kept per word length: games played, win percentage, current and best streak, and a chart of how many guesses each win took. Wins in the extra tries go in a "7+" bar. Losing a round resets the current streak for that length only.

## Word lists

The word data is generated once and committed to `data/`, so the app never needs to look anything up online.

| File | Contents | Source |
| --- | --- | --- |
| `answers-N.json` | Possible answers (about 1,300 to 1,500 per length) and their meanings | Common words from the [first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) 20k list, meanings from [WordNet](https://wordnet.princeton.edu/) |
| `guesses-N.txt` | Every word accepted as a guess (16,000 to 42,000 per length) | [dwyl/english-words](https://github.com/dwyl/english-words) `words_alpha.txt`, plus all answers |

There are two lists because they do different jobs.

- **Answers should be words people know.** They come from a list of the most common English words, so you're never asked to find an obscure word. A word is only kept if WordNet has a meaning for it, so the result screen always has something to show.
- **Guesses should accept almost anything real.** A big word list means a reasonable guess is rarely rejected with "Not in word list".

`tools/build_words.py` filters the answers to keep the game fair and family-friendly:

- Plurals and past tenses are dropped when the base word exists (for example "cards" and "played"), so answers aren't just a common word with an "s" or "ed" added.
- Any word whose WordNet definition mentions offensive, vulgar or explicit terms is dropped.
- Anything in `tools/blocklist.txt` is dropped. Add a word there and rebuild to remove it.

Each length's file is loaded only when that length is played, and it stays in memory after that.

WordNet's licence requires its notice to be kept with the data, which is why `data/WORDNET-LICENSE.txt` is there.

## Look and feel

- **An original design.** Guesswork has its own name, teal and amber colours and "GW" tile icon. It is a word-guessing game in a familiar genre, but it doesn't copy any existing game's name or branding.
- **Light and dark mode.** All colours are CSS variables on `:root`, with a second set under `prefers-color-scheme: dark`. The game follows the phone's setting automatically.
- **System fonts.** It uses the phone's own font (San Francisco on iPhone, Roboto on Android). Nothing to download, and it looks native.
- **Built for phones.** The layout uses `100dvh` so the keyboard isn't hidden behind Safari's toolbar, and `env(safe-area-inset-*)` padding so nothing sits under the notch or home bar. The on-screen keyboard is part of the page, so the phone's own keyboard never pops up. A physical keyboard also works.
- **Small touches.** Tiles flip to reveal colours, a wrong word shakes the row, and the winning row bounces. The rules open on the first visit, and the help screen shows install steps for your type of phone if you haven't installed it yet.

## Hosting

The game is hosted on **GitHub Pages**, which serves the `main` branch at https://wzsun1023.github.io/word-game/.

- **Free and simple.** Pages hosts static files at no cost, and the game is only static files.
- **HTTPS included.** Service workers only run on HTTPS, and Pages provides it automatically.
- **Why the repo is public.** Free GitHub Pages needs a public repository. The repo was made public so it could use Pages, rather than adding a separate host such as Cloudflare Pages or Netlify. Nothing secret is stored in it.
- `.nojekyll` tells Pages to serve the files as they are, without running its Jekyll site builder.

## Where to change things

| To change... | Edit |
| --- | --- |
| Coin rewards, prices, number of guesses | Constants at the top of `app.js` |
| Colours | CSS variables at the top of `styles.css` |
| Words used as answers | `tools/blocklist.txt`, then rerun `tools/build_words.py` |
| App name, icon, theme colour on the home screen | `manifest.webmanifest`, `tools/make_icons.py` |
| Anything at all | Also bump `CACHE` in `sw.js` so phones pick up the change |
