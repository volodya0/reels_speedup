# reels_speedupInstagram Reels Speed Control
A Chrome extension for watching Instagram Reels faster. It adds a playback speed control, arrow-key seeking, and a one-click download button.

Features
Playback speed: 0.5×, 1×, 1.5×, 2×, 2.5×, 3×, 4× or 5×. The speed carries over as you scroll, and Instagram can't reset it.
Seeking: skip 5 seconds forward or back with the arrow keys.
Download: save the current reel as an MP4 in the best available quality.
Floating panel: a small panel in the bottom-right corner with a download button (⬇) and the current speed (click it to open the speed menu).
On-screen hints: a short pop-up confirms each speed change, seek and download.
Keyboard shortcuts
Key	Action
Shift + .	Speed up
Shift + ,	Slow down
→	Forward 5 seconds
←	Back 5 seconds
Shift + D	Download the current reel
Shortcuts are ignored while you type in a comment, search or message field.

Installation
Download or clone this repository.
Open chrome://extensions in Chrome.
Turn on Developer mode (top-right corner).
Click Load unpacked and select the extension folder.
Open instagram.com or reload it if it's already open.
To update, replace the files and click the reload button on the extension's card in chrome://extensions.

How downloading works
Instagram streams videos through blob: links, so a reel can't be saved straight from the player. Instead, the extension:

Finds the reel's shortcode from the page URL (/reel/…, /reels/…, /p/…) or, in the home feed, from the post's link.
Converts the shortcode to a media ID and requests the post details from Instagram, using your logged-in session.
Picks the highest-resolution MP4. For carousel posts, it picks the video whose length matches the one playing.
Hands the link to Chrome's downloads API. Files are saved as instagram_<username>_<shortcode>.mp4.
Permissions
Permission	Why
downloads	Save reels to your computer
Access to www.instagram.com	Control video playback and add the panel
The extension sends no data anywhere except Instagram itself.

Project structure
├── manifest.json   # Extension config (Manifest V3)
├── content.js      # Speed control, seeking, panel UI, download logic
├── background.js   # Service worker that runs chrome.downloads
└── icon*.png       # Extension icons
Configuration
These values are constants at the top of their sections in content.js:

SPEEDS: the speeds offered in the menu
SEEK_STEP: how many seconds the arrow keys skip (default 5)
Known limitations
Downloading uses an undocumented Instagram API that can change without notice. If downloads stop working, look at fetchVideoInfo in content.js first.
You need to be logged in to Instagram. Private posts only work if your account can see them.
In carousel posts, the arrow keys seek the video instead of switching slides.
Disclaimer
Download only content you have the right to save. Respect creators' rights and Instagram's Terms of Use.