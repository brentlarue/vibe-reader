# Reset API Key for n8n

If you lost your API key or it's not working, run this in your browser console (at http://localhost:5173):

```javascript
// Step 1: List all keys to find the one to delete
fetch('/api/keys', { credentials: 'include' })
.then(r => r.json())
.then(keys => {
  console.log('All keys:', keys);
  
  // Find the "n8n dev workflow v2" key
  const keyToDelete = keys.find(k => k.name === 'n8n dev workflow v2' && k.env === 'dev');
  
  if (!keyToDelete) {
    console.log('Key not found, creating new one...');
    return Promise.resolve(null);
  }
  
  console.log('Deleting key:', keyToDelete.id, keyToDelete.name);
  
  // Step 2: Delete the old key
  return fetch(`/api/keys/${keyToDelete.id}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  .then(r => r.json())
  .then(() => {
    console.log('✅ Old key deleted');
    return null;
  });
})
.then(() => {
  // Step 3: Create a new key
  console.log('Creating new key...');
  return fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name: 'n8n dev workflow v2' })
  });
})
.then(r => r.json())
.then(data => {
  if (data.error) {
    console.error('❌ Error:', data.error);
    return;
  }
  console.log('✅ NEW API KEY:', data.key);
  console.log('⚠️ COPY THIS ENTIRE KEY NOW - YOU WON\'T SEE IT AGAIN!');
  console.log('Key ID:', data.id);
  console.log('Environment:', data.env || 'dev');
  console.log('');
  console.log('Next step: Copy the key above and paste it into n8n "Set Config" node');
});
```

## After getting the new key:

1. **Copy the entire key** (the long hex string)
2. **Open n8n workflow**
3. **Click "Set Config" node**
4. **Find the `apiKey` field**
5. **Replace the entire value** with your new key
6. **Make sure there are no spaces** before or after
7. **Click Save**
8. **Test the workflow again**
