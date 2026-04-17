# AI Provider API Contract

This file documents the EXACT parameters each AI provider's API accepts.
**Do not add any parameter to `getOpenAIRequestBody()` or `getGeminiRequestBody()` that isn't documented here.**

If you need to add a new parameter:
1. Verify it's accepted by the API (check provider docs or test with curl)
2. Add it to `allowedBodyKeys` in PROVIDER_CONFIG
3. Update this document

---

## OpenAI `gpt-image-1` — POST https://api.openai.com/v1/images/generations

### Accepted body parameters (ONLY these):
| Key      | Type    | Valid Values                                           |
|----------|---------|--------------------------------------------------------|
| model    | string  | `'gpt-image-1'`                                        |
| prompt   | string  | Any text (max 32000 chars)                             |
| n        | integer | 1-10                                                   |
| size     | string  | `'1024x1024'`, `'1536x1024'`, `'1024x1536'`, `'auto'`  |
| quality  | string  | `'low'`, `'medium'`, `'high'`, `'auto'`                |

### ❌ Parameters that will CAUSE errors:
- `output_format: 'b64_json'` — NOT accepted. Model returns b64_json by default.
- `response_format` — NOT accepted on gpt-image-1 (only on older dall-e-2/3)
- `style` — NOT accepted (only on dall-e-3)
- `quality: 'standard'` — NOT accepted (use `'medium'` instead)

### Response shape:
```json
{
  "data": [
    { "b64_json": "iVBORw0KG..." }  // base64 PNG, no data URI prefix
  ]
}
```

---

## Gemini `gemini-2.5-flash-image` — POST generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent

### Accepted body parameters:
| Key              | Type   | Description                                           |
|------------------|--------|-------------------------------------------------------|
| contents         | array  | `[{ parts: [{ text: string }] }]`                     |
| generationConfig | object | `{ responseModalities, imageConfig: { aspectRatio } }` |

### Valid aspectRatio values:
- `'1:1'`, `'3:2'`, `'2:3'`, `'4:3'`, `'16:9'`

### Response shape:
```json
{
  "candidates": [{
    "content": {
      "parts": [
        { "inlineData": { "mimeType": "image/png", "data": "..." } }
      ]
    }
  }]
}
```

---

## Safety Layers

1. **`validateParams()`** — sanitizes inputs, clamps to valid values
2. **`allowedBodyKeys`** whitelist — strips any unexpected keys before the fetch call
3. **Runtime warning** — logs dropped keys to console for debugging
4. **This document** — single source of truth for valid API params

If you ever see "Invalid value" errors from OpenAI/Gemini, it means a key slipped past the whitelist. Add it to `allowedBodyKeys` or remove it from the request body builder.
