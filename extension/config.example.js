// Stash Configuration
// Stash runs locally on your Mac now - no cloud account needed.
//
// 1. Open the Stash app and go to Settings to find your local token.
// 2. Paste it below.

const CONFIG = {
  // The Stash app's local server (only reachable from this Mac).
  SERVER_URL: 'http://127.0.0.1:47615',

  // Paste the token shown in the Stash app's Settings screen.
  TOKEN: 'PASTE_YOUR_TOKEN_HERE',
};

// Don't edit below this line
if (typeof module !== 'undefined') {
  module.exports = CONFIG;
}
