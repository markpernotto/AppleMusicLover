# Timbre Segue — User Guide

## How it works

When you play music on music.apple.com, the extension listens to what you're playing and builds a profile from your recent tracks: average BPM, dominant genre, and dominant decade. It uses that profile to find and queue new tracks automatically so playback never stops.

The "Recommending to match" section at the top of the popup shows exactly what the extension is using right now — BPM, genre, and era. When no controls are set, those values come from your listening history.

---

## Controls

Each control is independent. Setting one doesn't affect the others.

### Genre
Lock recommendations to a specific genre. The extension pulls from Apple Music's genre chart for that genre, so results are always genuinely tagged — not just keyword-matched.

When set to **Auto**, genre follows your recent listening.

### Era
Lock recommendations to a specific decade. Use **◀ ▶** to step through decades. Double-click the displayed value to unlock it back to Auto.

**<1960s** covers anything pre-1960 as a single bucket (streaming catalog coverage gets thin before that point).

When set to **Auto**, era follows your recent listening.

### Tempo
Shift the BPM target up or down relative to what was detected. Each click moves ±15 BPM. **Auto** resets it.

### Loose / Strict
Controls how closely candidates need to match before they're queued. Matching is scored on three dimensions — genre, BPM, and era — each worth a fixed number of points:

| Dimension | Points |
|---|---|
| Genre match | 3 |
| BPM within range | up to 3 (proportional to how close) |
| Era match | 2 |

A perfect match scores 8. A track that matches genre and era but has no BPM data scores 5.

- **Loose** — threshold of 1, almost anything that isn't an outright mismatch gets queued
- **Default** — threshold of 2, needs at least a genre or partial BPM match
- **Strict** — threshold of 4, needs genre plus at least one other dimension

### Radio seed
Steers the Deezer artist radio neighborhood used to find candidates. If you set "Daft Punk" as the seed, the extension finds artists Deezer considers similar to Daft Punk, then filters those results against your genre/era/BPM settings.

This is separate from genre — it affects *where* candidates come from, not which ones pass the filter. Leave it blank to auto-seed from whoever you're currently listening to.

---

## Mixing controls

Controls combine independently. Some examples:

| Situation | What to set |
|---|---|
| You want Country but at the same tempo and era you were already at | Genre → Country. Leave everything else on Auto. |
| You want 90s Hip-Hop at a slower pace | Genre → Hip-Hop/Rap, Era → 1990s, Tempo → Slower |
| You want to flip between 90s Alt and 90s Hip-Hop | Set Era → 1990s, toggle Genre back and forth |
| You want to explore what Deezer thinks is similar to The National | Radio seed → The National |

---

## Debug logging

Enable **Debug logging** in the popup footer to see the recommendation engine's decisions in your browser's JavaScript console (Safari → Develop → Web Inspector for music.apple.com).

### What you'll see

**Now playing / enrichment**
```
[AML] Now playing: "Track Title" — Artist  ISRC: ...  Genres: House, Music
[AML] Enrichment complete for "Track Title" — BPM: 128 | 2/3 AML tracks ahead
```
Confirms the extension saw the track change and what BPM it got from Deezer. `2/3 AML tracks ahead` means 2 of the 3 buffered slots are already filled.

If Deezer doesn't have BPM data, you'll see `BPM: 0` and then (in the page console, not the extension console):
```
[AML bridge] BPM: analysis done — 24 beats → 126
```
The extension will analyze the live audio for ~15 seconds and fill in the BPM once it has enough data.

**Candidate pool**
```
[AML] Candidate pool — chart: 50, genre radio: 0, BPM wide: 116
```
How many candidates were gathered before scoring: Apple Music genre chart songs, Deezer genre radio tracks, and Deezer BPM-range search results.

**Score distribution**
```
[AML] Score distribution (18 verified, threshold 3): {"-1":5,"0":2,"1":4,"2":4,"3":2,"5":1}
```
After resolving 18 candidates to full Apple Music tracks, this shows how many scored at each level. The threshold (from your Match slider) is what a candidate must reach to get queued.

| Score | What it means |
|---|---|
| **-1** | Hard-excluded — already played this session, already queued, or wrong genre when genre is locked |
| **0** | No match on any dimension — different genre, BPM far off, wrong era |
| **1–2** | Partial match — correct genre but era or BPM penalty dragging it down |
| **3** | Genre match only — no BPM data available, era is neutral |
| **4–5** | Genre + era or genre + partial BPM match |
| **6–8** | Strong match across all three dimensions |

If most candidates are scoring -1, the pool is exhausted — the extension has already played or queued most of the best matches. If most are scoring 2 when your threshold is 3, try moving the Match slider toward Loose.

**What gets queued**
```
[AML] Queuing: "Track Title" by Artist (score: 5) [House | 2020s | 128 BPM]
```
The winning candidate, its score, and the profile dimensions it matched.

---

## What it doesn't do

- It doesn't reorder your existing queue — it only adds tracks ahead of what's coming next
- It doesn't have access to your personal library or playlists
- It won't repeat artists it has already queued in the current session
- Changing controls mid-session clears the queue state so new picks apply immediately
