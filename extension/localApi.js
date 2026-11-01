// Minimal client for the Stash app's local server (see src-tauri/src/server.rs).
// Replaces the old Supabase REST client now that Stash runs entirely on-device.
class LocalApiClient {
  constructor(serverUrl, token) {
    this.serverUrl = serverUrl;
    this.token = token;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async createSave(data) {
    const res = await fetch(`${this.serverUrl}/saves`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Save failed (${res.status})`);
    }

    return await res.json();
  }

  async getRecentSaves(limit = 10) {
    const res = await fetch(`${this.serverUrl}/saves?limit=${limit}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Fetch failed (${res.status})`);
    }

    return await res.json();
  }
}

// Export for use in extension
if (typeof window !== 'undefined') {
  window.LocalApiClient = LocalApiClient;
}
