# Guesswork

A word-guessing game you can play offline on your phone. It's a web app: open it once, add it to your home screen, and it works with no internet after that.

**Play:** https://wzsun1023.github.io/word-game/

## Features

- Pick **5, 6 or 7 letter** words. Play as many rounds as you like.
- Six guesses to find the word. Green means the letter is in the right spot, amber means it's in the word but in a different spot, and grey means it's not in the word.
- **Stats and streaks** for each word length: games played, win %, current and best streak, and how many guesses each win took.
- When a round ends, a separate screen shows **what the word means**.
- Works on iPhone and Android, and in light or dark mode.
- Fully offline after the first visit. Stats are saved on your own phone.

## Install it on your phone

1. Open **https://wzsun1023.github.io/word-game/** with an internet connection.
2. Add it to your home screen:
   - **iPhone (Safari):** tap the Share button (the square with an arrow pointing up), then tap **Add to Home Screen**.
   - **Android (Chrome):** tap the **⋮** menu, then tap **Add to Home screen** or **Install app**.
3. Open it from the new icon. From then on it works without internet.

## How it's built

Plain HTML, CSS and JavaScript, with no build step.

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The game itself |
| `sw.js` | Service worker: saves every file for offline play and refreshes them in the background |
| `manifest.webmanifest`, `icons/` | Home-screen name, icon and full-screen mode |
| `data/answers-N.json` | Possible answers for each length, with their meanings |
| `data/guesses-N.txt` | Every word accepted as a guess |
| `tools/build_words.py` | Regenerates the `data/` files (see below) |
| `tools/blocklist.txt` | Words never used as answers, to keep it family-friendly |
| `tools/make_icons.py` | Redraws the icons |

### Word lists

Answers are common English words, taken from a frequency list of the 20,000 most common words. Every answer has a dictionary meaning from [WordNet](https://wordnet.princeton.edu/) (see `data/WORDNET-LICENSE.txt`). Plurals, past tenses and anything on the blocklist are left out. Accepted guesses come from a much larger English word list, so unusual words still count.

To rebuild the lists, put the source files in one folder (`wn/package/dict/` from the `wordnet-db` npm package, `20k.txt` from first20hours/google-10000-english, and `words_alpha.txt` from dwyl/english-words). Then run:

```
python3 tools/build_words.py <that folder> data
```

### Publishing an update

GitHub Pages serves the `main` branch. After you change any file, also change `CACHE` in `sw.js` (for example `guesswork-v2`) so phones fetch the new version. Players get the update the next time they open the app with a connection.

### Running it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000.
