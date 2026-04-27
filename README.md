# Timbre Segue

A Safari browser extension that replaces Apple Music's default autoplay with metadata-driven recommendations — matching tempo, genre, and era instead of popularity.

## What it does

When you listen on music.apple.com, Timbre Segue watches what you play and builds a vibe profile from your recent tracks: average BPM, dominant genre, and dominant decade. As your queue runs low, it finds new tracks that match that profile and inserts them silently — so playback never stops and never drifts too far from where you started.

You can also override any dimension manually: lock to a specific genre, steer toward an era, shift the tempo up or down, or seed the recommendations from a specific artist.

## What's new in 1.1

A substantial rework of the recommendation pipeline driven by real-world testing across Disco, Metal, Country, K-Pop, Latin, R&B, Folk, Jazz, Pop, and Techno sessions.

### Recommendation quality

- **Apple Music drives the candidate pool now.** The chart endpoint (`/v1/catalog/{sf}/charts`) and the catalog search endpoint (`/v1/catalog/{sf}/search`) are the primary sources, returning real Apple-tagged tracks instead of Deezer BPM-bucket fallback.
- **Per-session randomized offsets** on chart and search calls — successive sessions return different 50-track windows instead of the same top-25 on repeat.
- **Sources fire in auto mode**, not just when a genre is forced. Detecting Metal as the primary genre now triggers a Metal-targeted chart pull.
- **Pool size doubled** — chart and search each fetch at two non-overlapping offsets; similar-artist source returns up to 50 tracks from 5 related artists. Total ~340 candidates per attempt.
- **Era-aware search** — when a decade is locked, the AM search term gains the decade as a keyword (e.g. `"deep house 1990s"`), biasing results toward era-authentic tracks.
- **BPM tolerance tightened** from ±15 to ±10. A 92-BPM seed accepts 82–102 instead of 77–107.
- **Locked-filter discipline** — when era or genre is locked, the threshold-relaxation safety net is disabled. The system waits for the next track rather than queueing a marginal pick.
- **Era weight bumped to 3** when a decade is locked, tied with genre weight, so era-authentic candidates outrank wrong-era genre matches.
- **Exact-tag bonus** — a candidate whose Apple genre tags include the primary genre verbatim gets +2. Tracks tagged "Disco" outrank tracks merely tagged "Pop" in a Disco session.
- **Per-genre exclusion lists** — synth-pop hard-rejected from Techno, rap hard-rejected from Country, electronic hard-rejected from Folk, etc. Stops broad alias matches from pulling in obvious wrong-genre crossovers.

### New candidate sources

- **Deezer similar-artist top tracks** — `/artist/{id}/related` surfaces 5 similar artists, then we pull each one's top 10. Primary discovery lever for "new artists in the same lane".
- **Apple Music keyword search** — supplements the chart with broader, less-popularity-biased results.

### Library track support

- **ISRC recovery for library-owned tracks.** Apple Music Library tracks (id starts with `i.`) don't expose ISRCs through MusicKit. We now fall back to title+artist catalog search to resolve a catalog ISRC, so Deezer and MusicBrainz lookups actually work for your own library plays.

### Queue management

- **Real Apple Music queue display** — the popup's Up Next reflects what MusicKit will actually play next, not just our internal tracking list.
- **Auto-evict already-played tracks** that linger in the forward queue (fixes the back-button bug where the song you skipped would replay after you went back).
- **Apple AutoPlay detection** — a warning logs when Apple's `∞` AutoPlay is inserting tracks ahead of TS picks, with a 60-second throttle so it doesn't spam.

### Genre handling

- **Three-tier alias system**: scoring aliases (broad), core aliases (tight, used for forced-genre admission), and exclusion list (hard-reject). Solves the "Metal forced but Hip-Hop tracks scoring 3 because they share a Rock tag" class of bug.
- **Disco aliases broadened** to include Pop and R&B/Soul (Apple tags 70s disco classics inconsistently). Era gate keeps it era-authentic.
- **Hard-exclude crossover genres** for every forced genre.

### Diagnostics & debug

- **`await tsDump()`** from the Safari console dumps the now-playing track's full Apple Music catalog response, Deezer track + artist + similar artists + album, and MusicBrainz recording with genres+tags.
- **Real candidate BPM** in the queue label (previously showed the profile target only).
- **BPM target range** shown in the candidate pool log line.
- **Score distributions** logged in debug mode.
- **Diagnostic logging** for artist-seeded sources surfaces seed name and Deezer artist ID; metadata bridge logs Deezer API errors.

### Engine internals

- **Removed broken audio-tap BPM analysis.** Apple Music uses FairPlay DRM, which blocks `createMediaElementSource` from getting decrypted audio. The AnalyserNode was always seeing silence.
- **Genre-estimated BPM** as fallback when Deezer doesn't recognize an ISRC, displayed with a `~` prefix in the popup.
- **MusicBrainz HTTP 400 fix** — `inc=` parameters reduced to the universally-supported `artists+genres+tags` set.
- **`gain` field plumbed through** from Deezer (ReplayGain in dB; more negative = louder original master). Captured but not yet used for scoring — see [plans/1.2-roadmap.md](plans/1.2-roadmap.md) for the planned Energy control.

### Other

- **Transparent toolbar icons** (the new icon glyph, chroma-keyed off the white background, renders cleanly in light/dark mode).
- **Renamed Timbre → Timbre Segue** throughout (manifest, package, Xcode app target, docs).
- **App Store Connect compliance fix** — corrected `Icon.png` from JPEG-with-`.png`-extension to a real PNG.
- **Bug fixes**: "drops score from 5 to 5" log message, negative `tracks ahead` count, library-ID 404 in `tsDump`.

## Privacy

On every track play, the track's ISRC code is sent to two third-party services:

- **Deezer** — to look up BPM, duration, and artist radio data
- **MusicBrainz** — to look up the track's original release date (Apple Music returns the remaster year for catalog reissues, which breaks era detection)

Both services can infer your listening history from these requests. Your Apple Music credentials never leave your device. All preference data is stored locally. The extension shows a full disclosure on first use.

## Building from source

```
cd extension
npm install
npm run build
```

Then open `xcode/Timbre Segue/Timbre Segue.xcodeproj` in Xcode and run the app. Enable the extension in Safari → Settings → Extensions.

## How it works

See [USERGUIDE.md](USERGUIDE.md) for how to use the controls and how they interact.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a full breakdown of the recommendation pipeline, the two-script isolation model, and the scoring system.

## Contributing

Bug reports and pull requests welcome at [github.com/markpernotto/timbresegue](https://github.com/markpernotto/timbresegue).

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 [Facet Build, LLC](https://facetbuild.llc).
