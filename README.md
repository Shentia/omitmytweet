Omit My Tweet (Chrome Extension)

Purpose
- Delete your own posts and/or undo reposts on X (Twitter) within a specific date range.
- Safety limit: processes at most 50 items per run (configurable up to 50).

UI / Styling
- The popup UI is built with Bootstrap 5 and themed with a Junie-inspired palette:
  - Primary (buttons/accents): #6e56cf (purple)
  - Info accent (headers/links): #2ec4ff (teal/sky)
  - Success accent: #00ba7c (matches X "Undo Repost" green)
- A dark background improves contrast within the small popup window.

Install (Developer mode)
1. Open chrome://extensions in Chrome.
2. Enable Developer mode (top-right).
3. Click "Load unpacked" and select this folder (omitmytweet).
4. Pin the extension for quick access.

Usage
1. Open your own profile timeline on X/Twitter (example: https://x.com/your_handle).
2. Open the extension popup.
3. Set From and To dates (inclusive). The date picker uses your local timezone.
4. Choose actions:
   - Delete my posts
   - Undo reposts
5. Set the safety limit (max 50 per run) and click Start.
6. The extension will scroll your timeline, acting only on items within the date range.
7. Click Stop at any time to cancel the run.

Notes
- The extension identifies undo repost buttons using data-testid="unretweet" and the green color rgb(0, 186, 124) as fallback.
- Delete uses the three-dots More menu then clicks Delete and the confirmation.
- Selectors on X/Twitter change occasionally. If some items are skipped, update selectors in content.js accordingly.

Privacy
- No network requests, only DOM automation on X/Twitter pages. Settings are stored locally using chrome.storage.

Limitations
- Works best on the main profile tab. If you switch to Likes/Media tab, behavior is undefined.
- Replies/retweets are treated as posts for deletion if the Delete menu is available.

Color Code Reference
- Undo repost green: rgb(0, 186, 124) (as in provided screenshot).
