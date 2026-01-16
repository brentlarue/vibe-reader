# Milestone 4: Audio Generation with ElevenLabs

## Overview
This milestone adds audio generation to the daily brief workflow using ElevenLabs text-to-speech API. The workflow will generate an intro, convert article summaries to audio, and store the audio files.

## Prerequisites
- ✅ Milestone 3 completed (summary generation working)
- ElevenLabs account (free tier: 10k chars/month)
- ElevenLabs API key

## Step 1: Set Up ElevenLabs Account

1. Go to [elevenlabs.io](https://elevenlabs.io) and create an account
2. Navigate to your profile → API Keys
3. Generate a new API key
4. Copy the API key (you'll need it for n8n)

## Step 2: Add ElevenLabs Nodes to n8n Workflow

### 2.1: Generate Compliment (Optional - using OpenAI)

Add a new Code node after "Get Brief Metadata" to generate a unique compliment:

**Node Name:** "Generate Compliment"

**Code:**
```javascript
// Generate a confidence-boosting compliment using OpenAI
const item = $input.item.json;

const complimentPrompt = {
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content: "You are a supportive assistant that generates brief, encouraging compliments. Keep it to 10-15 words maximum."
    },
    {
      role: "user",
      content: "Generate a brief, confidence-boosting compliment for someone starting their day with a news brief. Be genuine and encouraging. One sentence only."
    }
  ],
  temperature: 0.8,
  max_tokens: 30
};

// Return the metadata with a placeholder for the compliment
// (We'll generate it in the next step)
return {
  json: {
    ...item,
    complimentPrompt: complimentPrompt
  }
};
```

**OR** use a predefined list (simpler, no API call):

```javascript
const compliments = [
  "You're staying ahead of the curve as always.",
  "Your commitment to learning is inspiring.",
  "You're making great progress on your goals.",
  "Your dedication to staying informed is impressive.",
  "You're building knowledge that matters."
];

const randomCompliment = compliments[Math.floor(Math.random() * compliments.length)];

return {
  json: {
    ...$input.item.json,
    compliment: randomCompliment
  }
};
```

### 2.2: Prepare Audio Script

Add a Code node to prepare the full audio script:

**Node Name:** "Prepare Audio Script"

**Code:**
```javascript
// Prepare the complete audio script for the daily brief
const metadata = $('Get Brief Metadata').item.json;
const items = $('Get Daily Items').item.json;
const compliment = $json.compliment || "You're doing great!";

// Get current date info
const today = new Date();
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = dayNames[today.getDay()];
const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Build intro
const intro = `Good morning! Today is ${dayName}, ${dateStr}. You have ${metadata.articleCount} articles in your brief today. ${compliment}. Let's dive in.`;

// Build article segments
const articleSegments = items
  .filter(item => item.aiSummary) // Only include items with summaries
  .map((item, index) => {
    return `From ${item.source}, ${item.title}. ${item.aiSummary}`;
  });

// Combine into full script
const fullScript = [intro, ...articleSegments].join(' ');

// Calculate character count for ElevenLabs
const charCount = fullScript.length;

return {
  json: {
    date: metadata.date,
    script: fullScript,
    characterCount: charCount,
    articleCount: metadata.articleCount,
    items: items.filter(item => item.aiSummary) // Items with summaries
  }
};
```

### 2.3: Generate Audio with ElevenLabs

Add an HTTP Request node:

**Node Name:** "Generate Audio"

**Configuration:**
- **Method:** `POST`
- **URL:** `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
- **Authentication:** 
  - Type: `Generic Credential Type`
  - Generic Auth Type: `Header Auth`
  - Name: `xi-api-key`
  - Value: `YOUR_ELEVENLABS_API_KEY` (store as credential)
- **Send Headers:** ON
  - `Content-Type`: `application/json`
- **Send Body:** ON
- **Body Content Type:** `JSON`
- **Specify Body:** `Using JSON`
- **JSON Field (Expression mode):**
```javascript
{
  "text": {{ $json.script }},
  "model_id": "eleven_monolingual_v1",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}
```

**Voice Selection:**
- Browse voices at: https://elevenlabs.io/app/voices
- Recommended female voices: "Rachel", "Bella", "Domi", "Elli"
- Replace `{voice_id}` in URL with your chosen voice ID

### 2.4: Download and Store Audio

Add nodes to download the audio and store it:

**Node Name:** "Download Audio"

- **Type:** HTTP Request
- **Method:** `GET`
- **URL:** `={{ $json.audio_url }}` (from ElevenLabs response)
- **Response Format:** `File`
- **Download:** `true`

**Node Name:** "Upload to Supabase Storage"

- **Type:** HTTP Request (or use Supabase node if available)
- **Method:** `POST`
- **URL:** `https://{project}.supabase.co/storage/v1/object/audio-briefs/{{ $('Prepare Audio Script').item.json.date }}.mp3`
- **Headers:**
  - `Authorization`: `Bearer {{ SUPABASE_SERVICE_KEY }}`
  - `Content-Type`: `audio/mpeg`
- **Body:** Binary data from "Download Audio" node

**OR** use your backend endpoint if you create one:

**Node Name:** "Store Audio URL"

- **Type:** HTTP Request
- **Method:** `POST`
- **URL:** `={{ $('Set Config').item.json.apiUrl }}/api/brief/audio`
- **Headers:**
  - `Authorization`: `Bearer {{ $('Set Config').item.json.apiKey }}`
  - `Content-Type`: `application/json`
- **Body:**
```json
{
  "itemId": "{{ $json.itemId }}",
  "audioUrl": "{{ $json.audio_url }}",
  "order": {{ $json.order }}
}
```

## Step 3: Update Workflow Connections

Connect the new nodes in this order:

```
[Existing workflow through "Save Summary"]
  ↓
Get Brief Metadata
  ↓
Generate Compliment (or use predefined)
  ↓
Prepare Audio Script
  ↓
Generate Audio (ElevenLabs)
  ↓
Download Audio
  ↓
Upload to Storage (or Store Audio URL)
  ↓
Set Run Status: Complete
```

## Step 4: Alternative - Generate Individual Audio Segments

If you prefer to generate audio per article (for flexibility):

1. After "Save Summary", add "Prepare Article Audio Script"
2. Generate audio for each article individually
3. Store each audio URL via `POST /api/brief/audio`
4. Concatenate in frontend player (Milestone 5)

## Step 5: Testing

1. **Test with one article first:**
   - Manually set `articleCount: 1` in "Prepare Audio Script"
   - Verify audio generates correctly
   - Check character count (should be < 10k for free tier)

2. **Test full brief:**
   - Run with multiple articles
   - Verify audio file is stored
   - Check URL is saved in database

3. **Verify storage:**
   - Check Supabase Storage bucket `audio-briefs`
   - Or verify URLs in `feed_items.audio_brief_url`

## Cost Considerations

- **Free tier:** 10,000 characters/month
- **Average brief:** ~2,000-3,000 characters
- **Free tier supports:** ~3-5 briefs/month
- **Paid tier:** $5/month for 30k chars = ~10 briefs/month

## Troubleshooting

### Error: "Character limit exceeded"
- Check character count in "Prepare Audio Script" output
- Reduce summary length or article count
- Consider generating per-article audio instead

### Error: "Invalid voice ID"
- Verify voice ID in ElevenLabs dashboard
- Make sure voice ID is in URL path, not body

### Audio file not downloading
- Check ElevenLabs response format
- Verify binary data handling in n8n
- Consider using backend proxy for download

## Next Steps

Once audio generation is working:
- ✅ Audio files are generated
- ✅ Audio URLs are stored in database
- ✅ Ready for Milestone 5: Frontend Audio Player
