/** Canonical serializable variable contracts for every built-in template. */
import type { TemplateJsonSchema } from "../catalog/types";

export const BUILTIN_TEMPLATE_SCHEMAS = {
  "media": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown on the scene",
        "default": "Make an impact."
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      },
      "confetti": {
        "type": "boolean",
        "title": "Confetti",
        "description": "Layer falling confetti particles over the backdrop. Set true when the copy is celebratory (launch, milestone, win, anniversary, achievement). Works on top of any mediaType — photo, video, or gradient.",
        "default": false
      }
    },
    "required": [
      "texts"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "reaction": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Punchline",
        "description": "Short meme-like punchline shown over the reaction clip. Keep it to 2-6 words.",
        "default": "Still editing manually?"
      },
      "reactionTag": {
        "type": "string",
        "title": "Reaction tag",
        "description": "Pexels meme search intent. Pick from the punchline/problem copy first, then the overall video topic.",
        "enum": [
          "launch",
          "productLaunch",
          "goLive",
          "shipIt",
          "wow",
          "excited",
          "happy",
          "success",
          "done",
          "panic",
          "waiting",
          "celebration",
          "cheers",
          "applause",
          "highFive",
          "teamwork",
          "fail",
          "confused",
          "thinking",
          "thanks",
          "letsGo",
          "manual",
          "office",
          "meeting",
          "deadline",
          "coding",
          "debugging",
          "computer",
          "startup",
          "presentation",
          "sales",
          "growth",
          "money"
        ],
        "default": "manual"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Reaction clip",
        "description": "Resolved Pexels MP4 URL.",
        "format": "uri",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Media type",
        "description": "Always 'video' for reaction clips.",
        "default": "video"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Reaction poster image",
        "description": "Still image shown while the reaction clip decodes its first frame.",
        "format": "uri",
        "default": ""
      }
    },
    "required": [
      "texts",
      "reactionTag"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiredAnyOf": [
        ["mediaUrl"]
      ]
    }
  },
  "confetti": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown on the scene",
        "default": "Celebrate."
      }
    },
    "required": [
      "texts"
    ],
    "additionalProperties": false
  },
  "emojiBurst": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown on the scene",
        "default": "Let's go!"
      }
    },
    "required": [
      "texts"
    ],
    "additionalProperties": false
  },
  "bigNumber": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Concise title shown above the metric (48 characters maximum).",
        "minLength": 1,
        "maxLength": 48,
        "default": "Our biggest milestone yet."
      },
      "value": {
        "type": "number",
        "title": "Target number",
        "description": "The number to count up to",
        "default": 1000
      },
      "decimalPlaces": {
        "type": "number",
        "title": "Decimal places",
        "description": "Optional display precision; when omitted, precision is inferred from the value"
      },
      "confetti": {
        "type": "boolean",
        "title": "Celebrate with confetti",
        "description": "Add a confetti burst when the metric is explicitly celebratory",
        "default": false
      },
      "label": {
        "type": "string",
        "title": "Label",
        "description": "Short label displayed below the number (32 characters maximum).",
        "minLength": 1,
        "maxLength": 32,
        "default": "Total users"
      },
      "prefix": {
        "type": "string",
        "title": "Prefix",
        "description": "Compact prefix before the number (e.g. $, €; 2 characters maximum).",
        "maxLength": 2,
        "default": ""
      },
      "unit": {
        "type": "string",
        "title": "Unit suffix",
        "description": "Compact suffix after the number (e.g. %, +, k, M; 4 characters maximum).",
        "maxLength": 4,
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "value",
      "label"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiresStat": true,
      "allowsStockMedia": true
    }
  },
  "barChart": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown above the chart",
        "default": "Revenue up 300%."
      },
      "bars": {
        "type": "array",
        "title": "Comparison values",
        "description": "Array of 2-6 grounded values with short category labels. Values are shown exactly and bar heights are scaled relative to the largest value. Use only facts supported by the input.",
        "examples": [
          [
            { "label": "Free", "value": 24 },
            { "label": "Pro", "value": 61 },
            { "label": "Business", "value": 88 }
          ]
        ],
        "items": {
          "type": "object",
          "properties": {
            "label": {
              "type": "string",
              "description": "Short category label shown below the bar (18 characters or fewer).",
              "maxLength": 18
            },
            "value": {
              "type": "number",
              "description": "Exact grounded value shown above the bar.",
              "format": "grounded-stat",
              "minimum": 0
            }
          },
          "required": ["label", "value"],
          "additionalProperties": false
        },
        "minItems": 2,
        "maxItems": 6,
        "default": [
          { "label": "Q1", "value": 42 },
          { "label": "Q2", "value": 58 },
          { "label": "Q3", "value": 76 },
          { "label": "Q4", "value": 91 }
        ]
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "bars"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiresStat": true,
      "allowsStockMedia": true
    }
  },
  "progressRing": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Concise title shown above the ring (48 characters maximum).",
        "minLength": 1,
        "maxLength": 48,
        "default": "Almost there."
      },
      "value": {
        "type": "number",
        "title": "Value",
        "description": "Percentage value 0-100",
        "default": 75
      },
      "decimalPlaces": {
        "type": "number",
        "title": "Decimal places",
        "description": "Optional display precision; when omitted, precision is inferred from the value"
      },
      "label": {
        "type": "string",
        "title": "Label",
        "description": "Short label shown below the ring (32 characters maximum).",
        "minLength": 1,
        "maxLength": 32,
        "default": "Complete"
      },
      "unit": {
        "type": "string",
        "title": "Unit",
        "description": "Compact suffix after the number (e.g. %, x, k; 3 characters maximum).",
        "maxLength": 3,
        "default": "%"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "value",
      "label"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiresStat": true,
      "allowsStockMedia": true
    }
  },
  "phoneMockup": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown on the scene",
        "default": "See it in action."
      },
      "screenMediaUrl": {
        "type": "string",
        "title": "Screen screenshot",
        "description": "Screenshot to show on the phone screen",
        "format": "supplied-image",
        "default": ""
      },
      "screen1Url": {
        "type": "string",
        "title": "Screen 1",
        "description": "Set to enable slides mode — screens slide inside the phone",
        "format": "supplied-image",
        "default": ""
      },
      "screen2Url": {
        "type": "string",
        "title": "Screen 2",
        "description": "Second screen (slides mode)",
        "format": "supplied-image",
        "default": ""
      },
      "screenFit": {
        "type": "string",
        "title": "Screenshot fit",
        "description": "Use cover for immersive product detail; contain when the full interface must remain visible.",
        "enum": [
          "cover",
          "contain"
        ],
        "default": "cover"
      },
      "screenFocusX": {
        "type": "number",
        "title": "Horizontal focus (0-100)",
        "description": "Horizontal percentage of the screenshot to keep in focus. Values are clamped to 0-100.",
        "default": 50
      },
      "screenFocusY": {
        "type": "number",
        "title": "Vertical focus (0-100)",
        "description": "Vertical percentage of the screenshot to keep in focus. Values are clamped to 0-100.",
        "default": 50
      },
      "screenMotion": {
        "type": "string",
        "title": "Screenshot motion",
        "description": "Single-screen treatment: pushIn is the professional default; use pan for wide interfaces and still when motion would distract. Multi-screen slides stay still so motions do not compete.",
        "enum": [
          "still",
          "pushIn",
          "pan"
        ],
        "default": "pushIn"
      },
      "screenCalloutText": {
        "type": "string",
        "title": "Feature callout",
        "description": "Optional 2-4 word annotation anchored to a product detail. Leave empty rather than narrating the headline twice.",
        "default": ""
      },
      "screenCalloutX": {
        "type": "number",
        "title": "Callout horizontal position (0-100)",
        "description": "Horizontal percentage of the product surface for the callout anchor.",
        "default": 70
      },
      "screenCalloutY": {
        "type": "number",
        "title": "Callout vertical position (0-100)",
        "description": "Vertical percentage of the product surface for the callout anchor.",
        "default": 35
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts"
    ],
    "additionalProperties": false
  },
  "webMockup": {
    "type": "object",
    "properties": {
      "frame": {
        "type": "string",
        "title": "Device frame",
        "description": "browser shows chrome and an address bar; tablet uses a clean product frame.",
        "enum": [
          "browser",
          "tablet"
        ],
        "default": "browser"
      },
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text shown above the product.",
        "default": "See it in action."
      },
      "screenMediaUrl": {
        "type": "string",
        "title": "Screenshot",
        "description": "Product screenshot shown inside the browser or tablet frame.",
        "format": "supplied-image",
        "default": ""
      },
      "screen1Url": {
        "type": "string",
        "title": "Screen 1",
        "description": "Optional second product screen. Setting it enables slides mode.",
        "format": "supplied-image",
        "default": ""
      },
      "screen2Url": {
        "type": "string",
        "title": "Screen 2",
        "description": "Optional third product screen for slides mode.",
        "format": "supplied-image",
        "default": ""
      },
      "screenFit": {
        "type": "string",
        "title": "Screenshot fit",
        "description": "Use cover for immersive product detail; contain when the full interface must remain visible.",
        "enum": [
          "cover",
          "contain"
        ],
        "default": "cover"
      },
      "screenFocusX": {
        "type": "number",
        "title": "Horizontal focus (0-100)",
        "description": "Horizontal percentage of the screenshot to keep in focus. Values are clamped to 0-100.",
        "default": 50
      },
      "screenFocusY": {
        "type": "number",
        "title": "Vertical focus (0-100)",
        "description": "Vertical percentage of the screenshot to keep in focus. Values are clamped to 0-100.",
        "default": 50
      },
      "screenMotion": {
        "type": "string",
        "title": "Screenshot motion",
        "description": "Single-screen treatment: pushIn is the professional default; use pan for wide interfaces and still when motion would distract. Multi-screen slides stay still so motions do not compete.",
        "enum": [
          "still",
          "pushIn",
          "pan"
        ],
        "default": "pushIn"
      },
      "screenCalloutText": {
        "type": "string",
        "title": "Feature callout",
        "description": "Optional 2-4 word annotation anchored to a product detail. Leave empty rather than narrating the headline twice.",
        "default": ""
      },
      "screenCalloutX": {
        "type": "number",
        "title": "Callout horizontal position (0-100)",
        "description": "Horizontal percentage of the product surface for the callout anchor.",
        "default": 70
      },
      "screenCalloutY": {
        "type": "number",
        "title": "Callout vertical position (0-100)",
        "description": "Vertical percentage of the product surface for the callout anchor.",
        "default": 35
      },
      "addressBarUrl": {
        "type": "string",
        "title": "Address bar URL",
        "description": "URL shown in browser chrome; ignored by the tablet frame.",
        "examples": [
          "yourapp.com"
        ],
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts"
    ],
    "additionalProperties": false
  },
  "codeEditor": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Concise title shown above the editor (48 characters maximum).",
        "minLength": 1,
        "maxLength": 48,
        "default": "Simple as this."
      },
      "code": {
        "type": "string",
        "title": "Code",
        "description": "Code snippet — use \\n for line breaks",
        "default": "import { getVideoDuration } from \"@vanillaskyai/video\";\nimport type { Video } from \"@vanillaskyai/video\";\n\nexport function duration(video: Video) {\n  return getVideoDuration(video);\n}"
      },
      "filename": {
        "type": "string",
        "title": "Filename",
        "description": "Filename shown in the editor title bar (32 characters maximum).",
        "maxLength": 32,
        "default": "app.ts"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "code"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "terminal": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Concise title shown above the terminal (48 characters maximum).",
        "minLength": 1,
        "maxLength": 48,
        "default": "Ship it."
      },
      "command": {
        "type": "string",
        "title": "Command",
        "description": "Command typed character by character. Keep the meaningful invocation within 80 characters; the terminal deliberately ellipsizes longer display lines.",
        "minLength": 1,
        "maxLength": 80,
        "default": "npx vanillasky check"
      },
      "output": {
        "type": "array",
        "title": "Output lines",
        "description": "JSON array of output lines that appear after the command. Send as an array — terminal output frequently contains commas. Example: [\"✓ Built /api/auth/login.ts, /api/users/me.ts\", \"✓ 12 tests passed\", \"✓ Ready to deploy\"]",
        "examples": [
          [
            "✓ Scenes composed",
            "✓ Beat-synced to music",
            "✓ Ready to export"
          ]
        ],
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80
        },
        "maxItems": 5,
        "default": []
      },
      "promptPrefix": {
        "type": "string",
        "title": "Prompt",
        "description": "Compact prompt prefix (e.g. $, >, →; 3 characters maximum).",
        "maxLength": 3,
        "default": "$"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "command"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "tweet": {
    "type": "object",
    "properties": {
      "authorName": {
        "type": "string",
        "title": "Author name",
        "description": "Display name shown bold next to the verified checkmark.",
        "default": "Your brand"
      },
      "authorHandle": {
        "type": "string",
        "title": "Handle",
        "description": "Username in @format. Leave empty to auto-derive from author name (e.g. 'Linear' → '@linear').",
        "default": ""
      },
      "authorVerified": {
        "type": "boolean",
        "title": "Verified checkmark",
        "description": "Show the blue verified checkmark next to the author name.",
        "examples": [
          true
        ],
        "default": false
      },
      "message": {
        "type": "string",
        "title": "Tweet text",
        "description": "The tweet/post content. Reads best at 1-3 lines (~80-180 chars). Emoji land naturally at the end of a phrase.",
        "default": "Just shipped the new feature 🚀"
      },
      "likes": {
        "type": "number",
        "title": "Likes",
        "description": "Target like count (rolls up from 0).",
        "examples": [
          602
        ],
        "default": 0
      },
      "replies": {
        "type": "number",
        "title": "Replies",
        "description": "Target reply count (rolls up from 0).",
        "examples": [
          19
        ],
        "default": 0
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "authorName",
      "message"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "notification": {
    "type": "object",
    "properties": {
      "appName": {
        "type": "string",
        "title": "App name",
        "description": "App name shown in the notification header (e.g. Reminder, Lume, Linear, GitHub; 24 characters maximum).",
        "minLength": 1,
        "maxLength": 24,
        "default": "Reminder"
      },
      "appIcon": {
        "type": "string",
        "title": "App icon",
        "description": "Single emoji used as the app icon. Override the default 🔔 to retheme: 📅 reminder, ✅ task done, 💌 message, 🎉 celebration, ⚡ system event.",
        "format": "emoji",
        "maxLength": 16,
        "default": "🔔"
      },
      "message": {
        "type": "string",
        "title": "Message",
        "description": "The notification body. Keep it to a short alert of at most 100 characters; 1-2 lines reads best.",
        "minLength": 1,
        "maxLength": 100,
        "default": "Believe in your dreams, they will lead you."
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "appName",
      "message"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "chatMessenger": {
    "type": "object",
    "properties": {
      "msg1": {
        "type": "string",
        "title": "Message 1 (received)",
        "description": "First message — left/received by default. Append |in or |out to override side. Aim for 3-4 messages total; use 5 with date chips only for a real time gap in a 10s+ scene.",
        "default": "Have you tried it yet?"
      },
      "msg2": {
        "type": "string",
        "title": "Message 2 (sent)",
        "description": "Second message — right/sent by default via |out. Replace the suffix with |in only when the grounded exchange requires it.",
        "default": "Yes — it saves me hours|out"
      },
      "msg3": {
        "type": "string",
        "title": "Message 3 (received)",
        "description": "Third message — left/received by default. Leave blank for a two-message exchange.",
        "default": "Okay, send me the link"
      },
      "msg4": {
        "type": "string",
        "title": "Message 4 (sent)",
        "description": "Fourth message — right/sent by default. Optional; most chats end here.",
        "examples": [
          "Sounds great — sharing access now"
        ],
        "default": ""
      },
      "dateChip1": {
        "type": "string",
        "title": "Date chip 1",
        "description": "Optional date label before message 4. Use only for a real time gap.",
        "default": ""
      },
      "dateChip2": {
        "type": "string",
        "title": "Date chip 2",
        "description": "Optional date label before message 5. Use only for a real time gap.",
        "default": ""
      },
      "msg5": {
        "type": "string",
        "title": "Message 5 (sent)",
        "description": "Optional fifth message — right/sent by default.",
        "default": ""
      },
      "theme": {
        "type": "string",
        "title": "Conversation theme",
        "enum": [
          "messenger",
          "whatsapp"
        ],
        "default": "messenger"
      }
    },
    "required": [
      "msg1",
      "msg2",
      "msg3"
    ],
    "additionalProperties": false
  },
  "chatWhatsapp": {
    "type": "object",
    "properties": {
      "msg1": {
        "type": "string",
        "title": "Message 1 (received)",
        "description": "First message — left/received by default. Append |in or |out to override side. Aim for 3-4 messages total; use 5 with date chips only for a real time gap in a 10s+ scene.",
        "default": "Have you tried it yet?"
      },
      "msg2": {
        "type": "string",
        "title": "Message 2 (sent)",
        "description": "Second message — right/sent by default via |out. Replace the suffix with |in only when the grounded exchange requires it.",
        "default": "Yes — it saves me hours|out"
      },
      "msg3": {
        "type": "string",
        "title": "Message 3 (received)",
        "description": "Third message — left/received by default. Leave blank for a two-message exchange.",
        "default": "Okay, send me the link"
      },
      "msg4": {
        "type": "string",
        "title": "Message 4 (sent)",
        "description": "Fourth message — right/sent by default. Optional; most chats end here.",
        "examples": [
          "Sounds great — sharing access now"
        ],
        "default": ""
      },
      "dateChip1": {
        "type": "string",
        "title": "Date chip 1",
        "description": "Optional date label before message 4. Use only for a real time gap.",
        "default": ""
      },
      "dateChip2": {
        "type": "string",
        "title": "Date chip 2",
        "description": "Optional date label before message 5. Use only for a real time gap.",
        "default": ""
      },
      "msg5": {
        "type": "string",
        "title": "Message 5 (sent)",
        "description": "Optional fifth message — right/sent by default.",
        "default": ""
      },
      "theme": {
        "type": "string",
        "title": "Conversation theme",
        "enum": [
          "messenger",
          "whatsapp"
        ],
        "default": "whatsapp"
      }
    },
    "required": [
      "msg1",
      "msg2",
      "msg3"
    ],
    "additionalProperties": false
  },
  "milestone": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "title": "Label",
        "description": "Short label above the number (e.g. Followers, Subscribers, Downloads; 32 characters maximum).",
        "minLength": 1,
        "maxLength": 32,
        "default": "Followers"
      },
      "targetNumber": {
        "type": "number",
        "title": "Target number",
        "description": "The milestone number to reach",
        "default": 10000
      },
      "startNumber": {
        "type": "number",
        "title": "Start number",
        "description": "Number the counter starts rolling from. Defaults to 0.",
        "default": 0
      },
      "badgeText": {
        "type": "string",
        "title": "Badge text",
        "description": "Concise celebration badge text that pops in at the milestone (32 characters maximum).",
        "maxLength": 32,
        "examples": [
          "10K Followers!"
        ],
        "default": ""
      },
      "badgeEmoji": {
        "type": "string",
        "title": "Badge emoji",
        "description": "Emoji shown in the celebration badge",
        "format": "emoji",
        "maxLength": 16,
        "default": "🎉"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "label",
      "targetNumber"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiresStat": true,
      "allowsStockMedia": true
    }
  },
  "reviewStack": {
    "type": "object",
    "properties": {
      "review1Title": {
        "type": "string",
        "title": "Review 1 — Title",
        "description": "Headline of the first review",
        "format": "grounded-quote",
        "default": "Life changing app"
      },
      "review1Body": {
        "type": "string",
        "title": "Review 1 — Body",
        "description": "Body text of the first review",
        "examples": [
          "Been using this for a month and can't imagine going back"
        ],
        "format": "grounded-quote",
        "default": ""
      },
      "review1Author": {
        "type": "string",
        "title": "Review 1 — Author",
        "description": "Author name for the first review",
        "examples": [
          "Sarah M."
        ],
        "default": ""
      },
      "review2Title": {
        "type": "string",
        "title": "Review 2 — Title",
        "description": "Headline of the second review",
        "format": "grounded-quote",
        "default": "Best in class"
      },
      "review2Body": {
        "type": "string",
        "title": "Review 2 — Body",
        "description": "Body text of the second review",
        "examples": [
          "Finally an app that just works. No bloat, no nonsense."
        ],
        "format": "grounded-quote",
        "default": ""
      },
      "review2Author": {
        "type": "string",
        "title": "Review 2 — Author",
        "description": "Author name for the second review",
        "examples": [
          "Mike R."
        ],
        "default": ""
      },
      "review3Title": {
        "type": "string",
        "title": "Review 3 — Title",
        "description": "Headline of the third review",
        "format": "grounded-quote",
        "default": "Exceeded expectations"
      },
      "review3Body": {
        "type": "string",
        "title": "Review 3 — Body",
        "description": "Body text of the third review",
        "examples": [
          "Worth every penny. The team clearly cares about quality."
        ],
        "format": "grounded-quote",
        "default": ""
      },
      "review3Author": {
        "type": "string",
        "title": "Review 3 — Author",
        "description": "Author name for the third review",
        "examples": [
          "Alex K."
        ],
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "review1Title",
      "review2Title",
      "review3Title"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "testimonial": {
    "type": "object",
    "properties": {
      "quote": {
        "type": "string",
        "title": "Quote",
        "description": "Quote text",
        "format": "grounded-quote",
        "default": "Best decision I made this year. Our conversion rate doubled in the first week."
      },
      "authorName": {
        "type": "string",
        "title": "Author name",
        "description": "Name of the person being quoted",
        "default": "Jessica Torres"
      },
      "authorRole": {
        "type": "string",
        "title": "Role / title",
        "description": "Job title or description below the name",
        "examples": [
          "VP of Marketing, Acme Inc"
        ],
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "quote",
      "authorName"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "incomingCall": {
    "type": "object",
    "properties": {
      "callerName": {
        "type": "string",
        "title": "Caller name",
        "description": "Brand or product shown as the caller. One to three words reads best; 40 characters maximum.",
        "minLength": 1,
        "maxLength": 40,
        "default": "Your brand"
      },
      "subtitle": {
        "type": "string",
        "title": "Subtitle",
        "description": "Smaller single-line text below the caller name (28 characters maximum).",
        "maxLength": 28,
        "default": "is calling...."
      },
      "declineLabel": {
        "type": "string",
        "title": "Decline label",
        "description": "Short label below the red button (12 characters maximum).",
        "maxLength": 12,
        "default": "Decline"
      },
      "acceptLabel": {
        "type": "string",
        "title": "Accept label",
        "description": "Short label below the green button (12 characters maximum).",
        "maxLength": 12,
        "default": "Accept"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "callerName"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "brandMessage": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "title": "Message",
        "description": "The brand-voiced message rendered as a single iMessage-style outgoing bubble (right side, cream) over the media background. 4-12 words reads best — short messages produce a tight bubble; longer ones wrap inside the 75% width cap. Examples: 'We built this for you.', 'Thanks for being here.', 'See what's new this week.'",
        "default": "We built this for you."
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "message"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "promptInput": {
    "type": "object",
    "properties": {
      "promptText": {
        "type": "string",
        "title": "Prompt text",
        "description": "Example prompt that types into the AI prompt bar. Use 3-7 words and at most 40 characters so the full prompt stays legible in both orientations (e.g. 'Make a launch video for our app').",
        "minLength": 1,
        "maxLength": 40,
        "default": "Make a launch video for our app"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "promptText"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "beforeAfter": {
    "type": "object",
    "properties": {
      "problemLabel": {
        "type": "string",
        "title": "Before label",
        "description": "Short uppercase pill label shown above the before headline (12 characters maximum).",
        "maxLength": 12,
        "default": "BEFORE"
      },
      "problemHeadline": {
        "type": "string",
        "title": "Before headline",
        "description": "Headline shown during the before phase. Use 2-5 words and at most 48 characters. Sits centered beneath the BEFORE pill.",
        "minLength": 1,
        "maxLength": 48,
        "default": "Your calendar today."
      },
      "solutionLabel": {
        "type": "string",
        "title": "After label",
        "description": "Short uppercase pill label shown above the after headline (12 characters maximum).",
        "maxLength": 12,
        "default": "AFTER"
      },
      "solutionHeadline": {
        "type": "string",
        "title": "After headline",
        "description": "Headline shown during the after phase. Use 2-5 words and at most 48 characters. Sits centered beneath the AFTER pill.",
        "minLength": 1,
        "maxLength": 48,
        "default": "Calmly organized."
      },
      "problemEmojis": {
        "type": "array",
        "title": "Before emojis",
        "description": "JSON array of emojis for the chaos / before state (5-8 types, cycled to fill 16 slots distributed around the central text). Example: [\"📅\", \"😰\", \"💼\", \"📊\", \"⏰\", \"💬\", \"📞\", \"🔔\"]",
        "items": {
          "type": "string",
          "format": "emoji",
          "minLength": 1,
          "maxLength": 16
        },
        "minItems": 5,
        "maxItems": 8,
        "default": [
          "📅",
          "😰",
          "💼",
          "📊",
          "⏰",
          "💬",
          "📞",
          "🔔"
        ]
      },
      "solutionEmojis": {
        "type": "array",
        "title": "After emojis",
        "description": "JSON array of emojis for the calm / after state (3-5 types, cycled to fill 16 slots distributed around the central text). Example: [\"✨\", \"📋\", \"✅\", \"🎯\"]",
        "items": {
          "type": "string",
          "format": "emoji",
          "minLength": 1,
          "maxLength": 16
        },
        "minItems": 3,
        "maxItems": 5,
        "default": [
          "✨",
          "📋",
          "✅",
          "🎯"
        ]
      },
      "showEmojis": {
        "type": "boolean",
        "title": "Show decorative emojis",
        "description": "Show the animated emoji scatter. Disable for sober financial or editorial comparisons.",
        "default": true
      }
    },
    "required": [
      "problemHeadline",
      "solutionHeadline",
      "problemEmojis",
      "solutionEmojis"
    ],
    "additionalProperties": false
  },
  "tripleStats": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Concise title above the three metrics (48 characters maximum).",
        "minLength": 1,
        "maxLength": 48,
        "default": "By the numbers."
      },
      "stat1Value": {
        "type": "string",
        "title": "Stat 1 value",
        "description": "First compact stat value (e.g. 10K, 99.9%, $2M; 12 characters maximum).",
        "minLength": 1,
        "maxLength": 12,
        "default": "10K"
      },
      "stat1Label": {
        "type": "string",
        "title": "Stat 1 label",
        "description": "Short label below the first number (24 characters maximum).",
        "minLength": 1,
        "maxLength": 24,
        "default": "Users"
      },
      "stat2Value": {
        "type": "string",
        "title": "Stat 2 value",
        "description": "Second compact stat value (12 characters maximum).",
        "minLength": 1,
        "maxLength": 12,
        "default": "99.9%"
      },
      "stat2Label": {
        "type": "string",
        "title": "Stat 2 label",
        "description": "Short label below the second number (24 characters maximum).",
        "minLength": 1,
        "maxLength": 24,
        "default": "Uptime"
      },
      "stat3Value": {
        "type": "string",
        "title": "Stat 3 value",
        "description": "Third compact stat value (12 characters maximum).",
        "minLength": 1,
        "maxLength": 12,
        "default": "<50ms"
      },
      "stat3Label": {
        "type": "string",
        "title": "Stat 3 label",
        "description": "Short label below the third number (24 characters maximum).",
        "minLength": 1,
        "maxLength": 24,
        "default": "Latency"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "stat1Value",
      "stat1Label",
      "stat2Value",
      "stat2Label",
      "stat3Value",
      "stat3Label"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "requiresStat": true,
      "allowsStockMedia": true
    }
  },
  "problemSolution": {
    "type": "object",
    "properties": {
      "problemLabel": {
        "type": "string",
        "title": "Problem label",
        "description": "Short uppercase label shown above the problem text (16 characters maximum).",
        "maxLength": 16,
        "default": "THE PROBLEM"
      },
      "problemText": {
        "type": "string",
        "title": "Problem",
        "description": "The problem statement — keep it punchy, 1 sentence",
        "default": "Teams waste 40% of time in meetings"
      },
      "solutionLabel": {
        "type": "string",
        "title": "Solution label",
        "description": "Short uppercase label shown above the solution text (16 characters maximum).",
        "maxLength": 16,
        "default": "THE SOLUTION"
      },
      "solutionText": {
        "type": "string",
        "title": "Solution",
        "description": "The solution statement — your value prop in 1 sentence",
        "default": "AI that summarizes in seconds"
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "problemText",
      "solutionText"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "cardList": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text",
        "default": "What you get."
      },
      "items": {
        "type": "array",
        "title": "Features",
        "description": "JSON array of 2 or 3 feature descriptions. Send only the facts the evidence supports — never pad the list to reach three. Items often contain commas, so send an array rather than comma-joined text.",
        "items": {
          "type": "string"
        },
        "minItems": 2,
        "maxItems": 3,
        "default": [
          "Automate your savings on energy bills",
          "Cleaner energy without raising your bill",
          "Same account and service guaranteed"
        ]
      },
      "itemEmojis": {
        "type": "array",
        "title": "Feature emojis",
        "description": "JSON array of emojis, one per feature row (optional). Rows without an emoji fall back to ✦.",
        "examples": [
          [
            "💰",
            "⚡",
            "🔒"
          ]
        ],
        "items": {
          "type": "string"
        },
        "maxItems": 3,
        "default": []
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "items"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "steps": {
    "type": "object",
    "properties": {
      "texts": {
        "type": "string",
        "title": "Text",
        "description": "Title text",
        "default": "How it works."
      },
      "steps": {
        "type": "array",
        "title": "Steps",
        "description": "JSON array of 2 or 3 step labels. Send only the steps the evidence supports — never pad the sequence to reach three. Keep each label to 1-2 words and at most 18 characters. Send as an array so labels with internal punctuation render correctly. Example: [\"Capture\", \"Detect\", \"Notify\"]",
        "items": {
          "type": "string"
        },
        "minItems": 2,
        "maxItems": 3,
        "default": [
          "Describe",
          "Preview",
          "Export"
        ]
      },
      "stepEmojis": {
        "type": "array",
        "title": "Step emojis",
        "description": "JSON array of emojis, one per step (optional). Leave empty for numbered circles. Example: [\"✍️\", \"👀\", \"🚀\"]",
        "examples": [
          [
            "✍️",
            "👀",
            "🚀"
          ]
        ],
        "items": {
          "type": "string"
        },
        "maxItems": 3,
        "default": []
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "texts",
      "steps"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true
    }
  },
  "ctaLogo": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "title": "URL",
        "description": "Optional address shown below the CTA.",
        "examples": [
          "yoursite.com"
        ],
        "default": ""
      },
      "cta": {
        "type": "string",
        "title": "CTA",
        "description": "Optional action line shown above the URL. Keep it to four words.",
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "additionalProperties": false,
    "x-vanillasky": {
      "requiredAnyOf": [
        ["cta", "url"]
      ]
    }
  },
  "ctaMedia": {
    "type": "object",
    "properties": {
      "headline": {
        "type": "string",
        "title": "Headline",
        "description": "The big closing message. Two to seven words reads best.",
        "default": "Make every moment count"
      },
      "url": {
        "type": "string",
        "title": "URL",
        "description": "Optional address shown below the CTA.",
        "examples": [
          "www.yoursite.com"
        ],
        "default": ""
      },
      "cta": {
        "type": "string",
        "title": "CTA",
        "description": "Optional action line shown above the URL. Keep it to four words.",
        "default": ""
      },
      "mediaUrl": {
        "type": "string",
        "title": "Background media",
        "description": "Optional photo or video URL behind this scene. When set, replaces the brand gradient.",
        "format": "uri",
        "default": ""
      },
      "mediaKeyword": {
        "type": "string",
        "title": "Background search keyword",
        "description": "2-4 word English term for Pexels stock-footage search (auto-fills mediaUrl).",
        "format": "stock-media-keyword",
        "default": ""
      },
      "mediaType": {
        "type": "string",
        "title": "Background media type",
        "description": "auto detects photo/video from URL. 'gradient' is a deliberate mode — atmospheric brand-color scene with no stock footage.",
        "enum": [
          "auto",
          "photo",
          "video",
          "gradient"
        ],
        "default": "auto"
      },
      "mediaPoster": {
        "type": "string",
        "title": "Background poster image",
        "description": "Still image URL shown while a video backdrop is decoding its first frame. Auto-filled from Pexels' thumbnail when fillPexelsUrls sets a video mediaUrl. Hides the gradient flash that would otherwise appear in the ~50–400ms gap between a <video> mounting and decoding its first frame.",
        "format": "uri",
        "default": ""
      },
      "mediaPosition": {
        "type": "string",
        "title": "Background focal position",
        "description": "Controls which part of a photo or video stays visible when cover-cropped. Pick the subject's side or vertical anchor after inspecting the frame.",
        "enum": [
          "center",
          "top",
          "bottom",
          "left",
          "right"
        ],
        "default": "center"
      },
      "mediaTreatment": {
        "type": "string",
        "title": "Background contrast treatment",
        "description": "subtle preserves a visual hero; cinematic adds balanced contrast; text-safe adds a stronger wash for copy-heavy scenes.",
        "enum": [
          "subtle",
          "cinematic",
          "text-safe"
        ],
        "default": "cinematic"
      }
    },
    "required": [
      "headline"
    ],
    "additionalProperties": false,
    "x-vanillasky": {
      "allowsStockMedia": true,
      "requiredAnyOf": [
        ["cta", "url"],
        ["mediaUrl"]
      ]
    }
  }
} as const satisfies Readonly<Record<string, TemplateJsonSchema>>;
