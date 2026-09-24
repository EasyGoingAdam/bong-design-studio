# Monochrome Enforcement — How Black-and-White Etch Output Is Guaranteed

This document explains how Bong Design Studio guarantees that every generated
and exported **etch design** is strictly black-and-white (no color / no chroma),
why the guarantee is needed, exactly where it happens, and how to configure,
test, and extend it.

> TL;DR — The image models are *asked* for B&W in the prompt, but that is only a
> request. The hard guarantee is a **pixel-level pass** (`enforceMonochrome`)
> that strips all color with `sharp` **before any design image is stored**, plus
> a grayscale-forced **export/download** path. Photographic product mockups and
> marketing graphics are intentionally left in color.

---

## 1. The problem and the root cause

The studio produces laser-etch artwork with OpenAI (`gpt-image-1` / `gpt-image-2`)
and Google (`gemini-2.5-flash-image`). Laser etching is physically monochrome —
the laser either burns a spot or it doesn't — so the artwork must be pure black
on white with no color and, ideally, crisp binary edges.

Historically, "monochrome" was enforced **only in the prompt text**
(`ENGRAVING_RULES.forGeneration` says *"No color. No tints. No chromatic
detail."*). That is a *request*, not a *guarantee*. Image models routinely:

- leave **anti-aliased gray** halos on edges,
- introduce **subtle color tints** (warm/cool casts, faint hues),
- and, on some model/prompt combinations, return **overtly colored** output.

Before this feature there was **no pixel processing anywhere** between
generation and storage — the raw bytes the model returned were uploaded and
later exported verbatim. So any color the model produced became a permanent,
customer-visible colored design. **That absence of a pixel-level floor is the
root cause.**

The fix adds that floor: a single, well-tested transform applied at every point
a design image is created, plus prompt reinforcement and a grayscale export
path as defense-in-depth.

---

## 2. The core transform — `src/lib/monochrome.ts`

Everything hinges on one small module. It exposes two functions:

- `enforceMonochrome(input, opts?) → Promise<string>` — returns a **PNG data
  URI**. Never throws into the generation path; on any failure it returns the
  original bytes as a data URI (a stored-but-untouched image beats a lost
  generation).
- `enforceMonochromeBuffer(input, opts?) → Promise<Buffer>` — the same
  transform returning a raw PNG buffer, so tests can inspect pixels directly.

Input may be a `data:` URI, a bare base64 string, or a `Buffer`.

### 2.1 What the transform does

```
grayscale (always)      → collapses R,G,B into a single luminance value
                          ⇒ R === G === B on every pixel ⇒ zero chroma
threshold (optional)    → forces each pixel to pure 0 (black) or 255 (white)
                          ⇒ true 1-bit output, crispest possible etch
alpha channel           → preserved in both modes, so an intentionally
                          transparent background survives untouched
```

- **Grayscale is the non-negotiable floor.** `sharp(buf).grayscale()` produces a
  single luminance channel — by definition there is no color left. This runs on
  every design image, always. It removes *color* while keeping *tone* (fine gray
  line-work is preserved, which matters for detailed designs).

- **Threshold is opt-in.** When a threshold `T` (0–255) is supplied, the image is
  additionally reduced to pure black/white: luminance `< T` → black, `≥ T` →
  white. This is the "1-bit" mode — maximally crisp, but it discards tonal detail,
  so it is **off by default** to avoid degrading intricate art without the
  operator asking for it.

### 2.2 Preserving transparency (the tricky part)

`sharp`'s `grayscale()` keeps the alpha channel automatically, so grayscale-only
output preserves a transparent background with no special handling.

Thresholding naively would also threshold the alpha channel and destroy
transparency (every pixel would snap to fully opaque or fully transparent). So
the threshold path handles alpha explicitly:

```ts
if (meta.hasAlpha) {
  const alpha = await sharp(buf).ensureAlpha().extractChannel(3).toColourspace('b-w').toBuffer();
  const bw    = await sharp(buf).removeAlpha().grayscale().threshold(t).toBuffer();
  return sharp(bw).joinChannel(alpha).png().toBuffer();
}
```

It **splits the alpha off**, thresholds only the color channels, then **re-attaches
the original alpha**. The result is pure black/white where the design is, with the
original transparency intact.

### 2.3 Configuration

The default threshold comes from an environment variable, read once at module
load:

```
ETCH_MONO_THRESHOLD = <0–255>   → global 1-bit threshold (opt-in)
(unset)                          → grayscale-only (default)
```

A per-call `threshold` option overrides the env. Set the env in Railway →
Variables to switch the whole studio to true 1-bit output without a code change.

---

## 3. Where it runs — every design-generation sink

The transform is applied **immediately before the image is uploaded to storage**,
at every place a design is generated or edited. Putting it at each upload
boundary (rather than inside `uploadImage`) is deliberate: `uploadImage` is a
generic uploader also used for color assets (product photos), which must **not**
be grayscaled.

| Path | File | Notes |
|------|------|-------|
| Main studio generation (covers OpenAI v1, v2, **and** Gemini — all three funnel through one `base64Data` variable) | `src/app/api/generate-image/route.ts` | The primary path used by AI Generate, quick-generate, bulk variants, benchmark, auto-pilot |
| AI edit of an existing design | `src/app/api/edit-image/route.ts` | Uses `/v1/images/edits` |
| Themed engraving "stamps" | `src/app/api/generate-stamps/route.ts` | Enforced inside `generateStampDirect` |
| Bot / autopilot coil + base art | `src/lib/bot-api.ts` → `generateCoilImageServer` | Used by `/api/bot/designs/generate`, `/api/bot/autopilot`, `/api/bot/designs/variations` |
| Calendar auto-mockups (holiday coil art) | `src/lib/calendar-mockups-server.ts` → `generateCoilImage` | Used by the on-demand route and the cron sweep |
| Color-invert an existing design | `src/app/api/invert-image/route.ts` | `.grayscale()` added directly into its existing `sharp` pipeline (grayscale → negate) |

Because OpenAI v1/v2 and Gemini in the main route all converge on a single
`base64Data` value before upload, one `enforceMonochrome(base64Data)` call there
covers all three providers.

### 3.1 What is intentionally left in COLOR

These produce photographic / marketing assets, not etch designs, so they are
**excluded** from enforcement:

- `src/app/api/mockup-product/route.ts` — photorealistic render of the design
  etched onto a real glass product (frosted-glass look). Must stay full color.
- `src/app/api/marketing-graphic/route.ts` — composited marketing image (product
  photo + name + coil overlay + colored text/badges).
- `src/app/api/upload-image/route.ts` — generic uploads (product photos, blanks).
- `src/app/api/concepts/repair-images/route.ts` — re-hosts *existing* stored
  bytes (including the color mockup/marketing columns); it must not alter pixels.

---

## 4. Prompt reinforcement (defense-in-depth)

Pixel enforcement is the guarantee; the prompt work just stops the model from
spending effort on color that will be flattened anyway, and reduces gray halos.

- Base rules live in `src/lib/prompt-builder.ts` → `ENGRAVING_RULES`
  (`forGeneration`, `forEdit`, `forReview`), prepended to every generation prompt.
- `gpt-image-2` and Gemini already had provider-specific tuners
  (`tuneOpenAIv2Prompt`, `tuneGeminiPrompt`) that hammer on "pure black on white,
  zero gray."
- The **v1 OpenAI path previously had none.** It now appends `MONO_PROMPT_TAIL`
  (in `src/lib/ai-providers.ts`) inside `getOpenAIRequestBody`, giving v1 parity:
  *"STRICT: pure black-and-white only. No color, no tints, no chroma…"*

Note: user/AI free-text (style tags, descriptions, references) is still appended
to prompts and could *ask* for color — but it no longer matters, because the
pixel pass removes any color the model produces regardless of the prompt.

---

## 5. The export / download path

`src/components/image-download.tsx` renders a design to a `<canvas>` and exports
PNG / JPG / SVG (the SVG wraps the raster). Even though stored bytes are now
enforced monochrome, the canvas sets:

```ts
ctx.filter = 'grayscale(1)';
ctx.drawImage(img, 0, 0);
ctx.filter = 'none';
```

so **downloaded files are grayscale-forced**. This is belt-and-braces: it
guarantees an exported etch design can't carry color even if a *legacy* colored
image (generated before this feature) is still stored. The SVG export embeds the
same grayscaled raster, so it inherits the guarantee — there are no colored SVG
fills/strokes in the design export path to normalize (the only programmatic SVG
with colored fills is the marketing-graphic asset, which is intentionally color).

---

## 6. End-to-end flow

```
                 ┌─────────────────────────────────────────────┐
  user / bot ──► │  generation route / helper                  │
                 │  1. build prompt  (ENGRAVING_RULES + tail)   │
                 │  2. call model  (OpenAI v1/v2 or Gemini)     │
                 │  3. receive PNG bytes (may contain grays/color) │
                 │  4. enforceMonochrome(bytes)  ◄── THE FLOOR  │
                 │  5. uploadImage(...)  → storage URL          │
                 └─────────────────────────────────────────────┘
                                     │
                              stored image = monochrome
                                     │
                 ┌───────────────────▼─────────────────────────┐
  download  ──►  │  image-download canvas: grayscale(1) filter  │
                 │  → PNG / JPG / SVG, guaranteed colorless      │
                 └─────────────────────────────────────────────┘
```

Product mockups and marketing graphics branch off before step 4 and keep their
color.

---

## 7. Testing

There is no test framework in the repo, so the test is a standalone `tsx` script:

```
npm run test:monochrome        # → tsx scripts/test-monochrome.ts
```

`scripts/test-monochrome.ts` builds a 4-pixel RGBA image (red, green, blue, and a
fully transparent pixel), runs it through the transform, decodes the output PNG
back to raw pixels, and asserts:

1. **Grayscale mode:** `R === G === B` on every pixel (zero chroma); the
   transparent pixel stays transparent; tone is preserved (colors become mid
   grays, not forced 0/255).
2. **Threshold mode (`T=128`):** every pixel is pure `0` or `255`; the
   transparent pixel stays transparent through the alpha-split path.
3. **Prompt:** the v1 OpenAI request body ends with `MONO_PROMPT_TAIL` and the
   tail forbids color.

All 7 assertions pass. The full checks run for this feature were:
`npm run test:monochrome`, `npx tsc --noEmit`, `npx eslint`, and `npx next build`.

---

## 8. Operational notes & how to extend

- **Switch to true 1-bit output:** set `ETCH_MONO_THRESHOLD` (e.g. `128`) in
  Railway → Variables. Tune the number: lower = more white, higher = more black.
- **Scope:** this guarantees **new** output. Images generated *before* this
  feature that are already colored remain stored as-is (their *downloads* are
  grayscaled by the export path, but the stored copy is unchanged).
- **Backfill existing images:** to normalize the whole library, run each concept's
  `coil_image_url` / `base_image_url` / `combined_image_url` through
  `enforceMonochrome` and re-upload — mirror the loop in
  `src/app/api/concepts/repair-images/route.ts`, but call `enforceMonochrome`
  before `uploadImage` and **skip** `product_mockup_url` / `marketing_graphic_url`.
- **Adding a new design-generation path:** call `enforceMonochrome(bytes)` right
  before `uploadImage`. If the new path produces a *photographic* asset instead,
  do **not** call it (follow the mockup/marketing precedent).

---

## 9. File map

| Purpose | File |
|---------|------|
| Core transform | `src/lib/monochrome.ts` |
| v1 prompt tail | `src/lib/ai-providers.ts` (`MONO_PROMPT_TAIL`, `getOpenAIRequestBody`) |
| Main studio sink | `src/app/api/generate-image/route.ts` |
| Edit sink | `src/app/api/edit-image/route.ts` |
| Stamps sink | `src/app/api/generate-stamps/route.ts` |
| Bot/autopilot sink | `src/lib/bot-api.ts` (`generateCoilImageServer`) |
| Calendar sink | `src/lib/calendar-mockups-server.ts` (`generateCoilImage`) |
| Invert sink | `src/app/api/invert-image/route.ts` |
| Export/download | `src/components/image-download.tsx` |
| Test | `scripts/test-monochrome.ts` (`npm run test:monochrome`) |
