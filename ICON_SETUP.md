# iOS Homescreen Icon Setup

To fix the iOS homescreen icon to show the satellite antenna emoji (📡) instead of "S":

## Quick Setup

1. **Generate the PNG icon:**
   - Open `scripts/generate-app-icon.html` in your browser
   - It will automatically download `apple-touch-icon.png`
   - Save the downloaded file to `public/apple-touch-icon.png`

2. **After deploying:**
   - On iOS, go to Settings > Safari > Clear History and Website Data
   - Remove "The Signal" from your homescreen if it's already there
   - Re-add it to homescreen (Share button > Add to Home Screen)

## Why PNG instead of SVG?

iOS has limited support for SVG icons with emojis. PNG format ensures the emoji renders correctly on the homescreen.

## Files Updated

- `index.html` - Updated to reference PNG instead of SVG
- `public/manifest.json` - Added PWA manifest for better icon support
- `scripts/generate-app-icon.html` - Helper tool to generate the PNG

