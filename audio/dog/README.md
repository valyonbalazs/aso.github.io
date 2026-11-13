# Optional real dog sounds

By default the game synthesizes the dog's bark, sniff and yelp. To use real recordings instead:

1. Put short audio files in this folder (WAV, MP3 or OGG; mono, a few seconds at most).
2. Add a file named `samples.json` next to them:

```json
{
  "bark":  ["bark1.mp3", "bark2.mp3"],
  "sniff": ["sniff1.mp3"],
  "yelp":  ["yelp1.mp3"]
}
```

3. Reload the game. Each sound picks one of its files at random, with a slight pitch change. A slot with no files keeps using the synthesized sound.

Only use recordings you made yourself or that are licensed for this use (for example CC0), and note them in `CREDITS.md`.

This works when the game is served over http(s), such as GitHub Pages. Opened straight from disk (`file://`), browsers block the file loading and the synthesized dog is used.
