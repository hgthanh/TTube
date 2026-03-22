export const en = {
  // Nav
  home: "Home", shorts: "Shorts", trending: "Trending", favorites: "Favorites",
  history: "History", settings: "Settings", explore: "Explore",
  login: "Login", register: "Register", logout: "Logout", profile: "Profile",
  // Search
  searchPlaceholder: "Search videos, channels...",
  // Video
  save: "Save", saved: "Saved", share: "Share", lanShare: "LAN Share",
  audioMode: "Audio Mode", audioModeOn: "Audio Mode On", subscribe: "Subscribe",
  upNext: "Up Next", noDescription: "No description available.",
  viewsHidden: "Subscribers hidden",
  // Favorites
  yourFavorites: "Your Favorites", savedVideos: "videos saved to your library",
  noFavorites: "No favorites yet. Go watch some videos!",
  browseVideos: "Browse Videos", remove: "Remove",
  loginToSaveFavorites: "Login to sync favorites across devices",
  // History
  watchHistory: "Watch History", recentlyWatched: "Videos you have recently watched",
  clearAll: "Clear all history", noHistory: "No watch history yet.", exploreVideos: "Explore Videos",
  // Settings
  settingsTitle: "Settings", settingsDesc: "Manage player preferences and proxy configuration.",
  proxyConfig: "Proxy Configuration", enableProxy: "Enable Proxy",
  proxyDesc: "Route requests through a proxy to bypass restrictions.",
  customProxyUrl: "Custom Proxy URL", activeProxy: "Active:",
  builtInProxy: "Built-in Server Proxy", recommended: "Recommended", global: "Global",
  proxyScrapePool: "ProxyScrape Pool", refresh: "Refresh", loading: "Loading…",
  updated: "Updated", working: "working", total: "total",
  validated: "Validated", all: "All",
  contentFilter: "Content Filtering", blockedKeywords: "Blocked Keywords",
  keywordsDesc: "Videos with these keywords in the title will be hidden.",
  addKeyword: "Add keyword…", backup: "Backup & Restore",
  exportConfig: "Export Config", importConfig: "Import Config",
  language: "Language", languageDesc: "Choose your preferred display language.",
  accountSync: "Account & Sync", syncDesc: "Login to sync favorites, history and settings across devices.",
  loginToSync: "Login to sync your data",
  // Auth
  loginTitle: "Welcome back", loginDesc: "Login to sync your library across devices",
  registerTitle: "Create account", registerDesc: "Join to sync your favorites and history",
  username: "Username", email: "Email", password: "Password",
  confirmPassword: "Confirm Password", loginBtn: "Login", registerBtn: "Register",
  noAccount: "Don't have an account?", hasAccount: "Already have an account?",
  signUp: "Sign up", signIn: "Sign in", loggingIn: "Logging in…", registering: "Registering…",
  passwordMismatch: "Passwords do not match",
  continueAsGuest: "Continue as guest",
  welcome: "Welcome",
  // Terms / Privacy
  termsTitle: "Terms of Service", privacyTitle: "Privacy Policy",
  termsLink: "Terms of Service", privacyLink: "Privacy Policy",
  // Player
  subtitles: "Subtitles", off: "Off", playbackSpeed: "Playback Speed", normal: "Normal",
  pipMode: "Picture-in-Picture", backgroundPlay: "Background Play",
  // General
  views: "views", loadMore: "Load more", notFound: "Page not found",
  goHome: "Go Home", videosCount: "videos",
};
export type I18nKey = keyof typeof en;
