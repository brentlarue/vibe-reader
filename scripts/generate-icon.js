// Script to generate PNG icon from emoji
// Requires: npm install canvas (or use the HTML version)

const fs = require('fs');
const path = require('path');

// Check if we're in a browser environment (HTML version)
if (typeof document !== 'undefined') {
  // This will be used in the HTML file
  console.log('Use the HTML version: scripts/generate-app-icon.html');
} else {
  // Node.js version - try to use canvas if available
  try {
    const { createCanvas } = require('canvas');
    
    const canvas = createCanvas(180, 180);
    const ctx = canvas.getContext('2d');
    
    // Fill black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 180, 180);
    
    // Draw emoji
    ctx.font = '120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📡', 90, 90);
    
    // Save to public directory
    const outputPath = path.join(__dirname, '..', 'public', 'apple-touch-icon.png');
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    console.log('✅ Generated apple-touch-icon.png at', outputPath);
  } catch (error) {
    console.log('Canvas library not available. Please either:');
    console.log('1. Run: npm install canvas');
    console.log('2. Or open scripts/generate-app-icon.html in a browser to generate the PNG');
    console.log('3. Then save it as public/apple-touch-icon.png');
  }
}

