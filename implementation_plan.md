# Implementation Plan

Port the existing vanilla JS RedditScroller PWA to a cross-platform Flutter mobile app targeting iOS and Android, preserving all 23 features from the web app. The Flutter app will use Provider for state management, direct HTTP calls to the Reddit JSON API (no proxy needed for native apps), and video_player for video playback.

[Types]
Define all Dart model classes and enums needed to represent the Reddit API data structures.

**Enums:**
```dart
enum PostSort { hot, new_, top, rising, controversial }
enum TimeRange { hour, day, week, month, year, all }
enum MediaType { image, video, gallery, text, embed }
enum AccentColor { reddit, blue, green, purple, gold }
```

**Data Classes:**
```dart
class RedditPost {
  final String id, name, title, author, subreddit, permalink;
  final String selftext, selftextHtml, domain, url, thumbnail, postHint;
  final int score, numComments, createdUtc;
  final bool isSelf, isGallery, isVideo;
  final MediaContent? media;
  final PreviewImages? preview;
  final GalleryData? galleryData;
  final Map<String, MediaMetadataItem>? mediaMetadata;
  final OEmbed? oembed;
  final int index;
}

class MediaContent {
  final RedditVideo? redditVideo;
  final OEmbed? oembed;
}

class RedditVideo {
  final String? fallbackUrl, hlsUrl;
  final int width, height;
}

class PreviewImages {
  final List<PreviewImage> images;
}

class PreviewImage {
  final ImageSource source;
  final List<ImageSource> resolutions;
  final Mp4Variant? variants;
}

class ImageSource {
  final String url;
  final int width, height;
}

class Mp4Variant {
  final ImageSource? source;
}

class GalleryData {
  final List<GalleryItem> items;
}

class GalleryItem {
  final String mediaId;
}

class MediaMetadataItem {
  final String? e; // "Image" | "AnimatedImage"
  final String? status;
  final ImgSource? s;
  final List<ImgSource>? p; // preview resolutions
}

class ImgSource {
  final String? u, gif, mp4;
  final int? x, y;
}

class OEmbed {
  final String? html, thumbnailUrl;
}

class ProcessedMedia {
  final MediaType type;
  final String? source, poster, hlsSource, fallbackSource, gridThumb, html, selftext;
  final int? width, height, galleryCount;
  final bool? isAnimated;
  final List<ProcessedMediaItem>? images;
  final List<MediaSource> sources;
}

class ProcessedMediaItem {
  final MediaType type;
  final String source, poster, gridThumb;
  final int width, height;
}

class MediaSource {
  final String src, type;
}

class RedditComment {
  final String id, author, body;
  final int score, createdUtc, depth;
  final String? bodyHtml;
  final Map<String, MediaMetadataItem>? mediaMetadata;
  final List<RedditComment>? replies;
}

class SubredditSuggestion {
  final String displayName, communityIcon, iconImg;
  final int subscribers;
}
```

[Files]
Create an entirely new Flutter project structure with all necessary files.

**New Files to Create:**

1. `flutter_app/pubspec.yaml` — Flutter project manifest with dependencies:
   - provider, http, video_player, cached_network_image, share_plus, url_launcher, path_provider

2. `flutter_app/lib/main.dart` — App entry point, MaterialApp setup with theme

3. `flutter_app/lib/app.dart` — Root widget with MultiProvider wrapper

4. `flutter_app/lib/config/constants.dart` — API base URL, breakpoints, storage keys, format thresholds, HLS config (ported from src/constants.js)

5. `flutter_app/lib/config/theme.dart` — Flutter ThemeData with accent color system (ported from css/components/variables.css)

6. `flutter_app/lib/models/post.dart` — RedditPost model with JSON serialization

7. `flutter_app/lib/models/comment.dart` — RedditComment model with JSON serialization + threading

8. `flutter_app/lib/models/subreddit_suggestion.dart` — SubredditSuggestion model

9. `flutter_app/lib/models/media_content.dart` — All media-related models (ProcessedMedia, ProcessedMediaItem, MediaSource, etc.)

10. `flutter_app/lib/services/reddit_api_service.dart` — HTTP client wrapping Reddit JSON API (ported from src/api.js):
    - fetchSubredditPosts(subreddit, sort, after)
    - fetchSuggestions(query)
    - fetchComments(permalink)

11. `flutter_app/lib/services/media_processor.dart` — Media content type detection & URL processing (ported from processContent() in main.js + utils.js):
    - extractRedgifsId, buildRedgifsResult
    - processContent(RedditPost) → ProcessedMedia

12. `flutter_app/lib/utils/formatters.dart` — formatNumber, timeAgo, sanitizeText, safeUrl, parseMarkdown, decodeHtmlEntities (ported from src/utils.js)

13. `flutter_app/lib/providers/post_provider.dart` — ChangeNotifier managing post list, pagination, sort state, grid/reel toggling

14. `flutter_app/lib/providers/search_provider.dart` — ChangeNotifier managing search input state & autocomplete suggestions

15. `flutter_app/lib/providers/blacklist_provider.dart` — ChangeNotifier managing blacklist keywords with SharedPreferences (ported from localStorage logic)

16. `flutter_app/lib/providers/settings_provider.dart` — ChangeNotifier managing accent color, global volume/mute state

17. `flutter_app/lib/providers/comment_provider.dart` — ChangeNotifier managing comment fetching & state per post

18. `flutter_app/lib/screens/home_screen.dart` — Main grid browse screen with masonry layout (ported from index.html #home + setupMasonry)

19. `flutter_app/lib/screens/reel_screen.dart` — TikTok-style reel view with snap scrolling (ported from main.js reel logic)

20. `flutter_app/lib/widgets/top_bar.dart` — Top navigation bar with brand, search, accent toggle, blacklist button (ported from top-bar.css + HTML)

21. `flutter_app/lib/widgets/sort_pills.dart` — Sort pill row with submenus for Top/Controversial time ranges (ported from filter-row.css + HTML)

22. `flutter_app/lib/widgets/grid_post_card.dart` — Masonry grid card with thumbnail, title, subreddit, score, gallery nav, video hover preview (ported from flex-card HTML/CSS + renderGridPosts)

23. `flutter_app/lib/widgets/reel_post_card.dart` — Full-screen reel card with media content, overlay info, footer actions (ported from getPostTemplate + renderReelPosts)

24. `flutter_app/lib/widgets/comment_sheet.dart` — Slide-out bottom sheet with threaded comments, collapse/expand, OP badge, media rendering (ported from comment-sheet.css + renderCommentTree)

25. `flutter_app/lib/widgets/gallery_carousel.dart` — Image/video gallery carousel with dot indicators, swipe navigation (ported from setupGallery + renderGalleryContent)

26. `flutter_app/lib/widgets/image_lightbox.dart` — Full-screen image viewer with pinch-zoom, pan, swipe-to-dismiss (ported from openLightbox/closeLightbox)

27. `flutter_app/lib/widgets/blacklist_modal.dart` — Modal for managing blacklist keywords with tag chips (ported from blacklist modal HTML/CSS)

28. `flutter_app/lib/widgets/video_player_widget.dart` — Wrapper around video_player with global volume sync, mute toggle, fallback logic

**Files to Modify:**
- None (new project)

**Files to Delete:**
- None (web app preserved alongside)

[Functions]
Core logic functions ported from JS to Dart.

**New Functions:**

| Dart Function | File | Source JS |
|---|---|---|
| `PostProvider.fetchPosts({bool appendToReel})` | providers/post_provider.dart | fetchPosts() |
| `PostProvider.resetFeed()` | providers/post_provider.dart | resetFeed() |
| `PostProvider.openReel(int index)` | providers/post_provider.dart | openReel() |
| `PostProvider.closeReel()` | providers/post_provider.dart | closeReel() |
| `PostProvider.navigateToSubreddit(String sub)` | providers/post_provider.dart | navigateToSubreddit() |
| `PostProvider.loadMore()` | providers/post_provider.dart | infinite scroll trigger |
| `SearchProvider.fetchSuggestions(String query)` | providers/search_provider.dart | fetchSuggestions() |
| `SearchProvider.renderSuggestions(List subs)` | providers/search_provider.dart | renderSuggestions() |
| `SearchProvider.searchSubreddit(String sub)` | providers/search_provider.dart | search Enter handler |
| `BlacklistProvider.addTerm(String term)` | providers/blacklist_provider.dart | addBlacklistTerm() |
| `BlacklistProvider.removeTerm(String term)` | providers/blacklist_provider.dart | removeBlacklistTerm() |
| `BlacklistProvider.isBlacklisted(RedditPost post)` | providers/blacklist_provider.dart | isBlacklisted() |
| `SettingsProvider.setAccentColor(AccentColor c)` | providers/settings_provider.dart | setupAccentToggle() |
| `SettingsProvider.syncVideoVolume(double vol, bool muted)` | providers/settings_provider.dart | syncVideoVolume() |
| `CommentProvider.fetchComments(String permalink)` | providers/comment_provider.dart | openComments() |
| `CommentProvider.toggleCollapse(String id)` | providers/comment_provider.dart | toggleCommentCollapse() |
| `RedditApiService.fetchSubredditPosts(...)` | services/reddit_api_service.dart | fetchSubredditPosts() |
| `RedditApiService.fetchSuggestions(...)` | services/reddit_api_service.dart | fetchSuggestions() |
| `RedditApiService.fetchComments(...)` | services/reddit_api_service.dart | fetchComments() |
| `RedditApiService.normalizeSubredditInput(...)` | services/reddit_api_service.dart | normalizeSubredditInput() |
| `MediaProcessor.processContent(RedditPost)` | services/media_processor.dart | processContent() + buildRedgifsResult |
| `MediaProcessor.videoFromMp4(...)` | services/media_processor.dart | videoFromMp4 closure |
| `MediaProcessor.getHighQualityRedditVideo(...)` | services/media_processor.dart | getHighQualityRedditVideo |
| `MediaProcessor.renderGalleryContent(...)` | services/media_processor.dart | renderGalleryContent() |
| `Formatter.formatNumber(int)` | utils/formatters.dart | formatNumber() |
| `Formatter.timeAgo(int)` | utils/formatters.dart | timeAgo() |
| `Formatter.safeUrl(String)` | utils/formatters.dart | safeUrl() |
| `Formatter.sanitizeText(String)` | utils/formatters.dart | sanitizeText() |
| `Formatter.parseMarkdown(String)` | utils/formatters.dart | parseMarkdown() |
| `Formatter.decodeHtmlEntities(String)` | utils/formatters.dart | decodeHtmlEntities() |
| `Formatter.sanitizeEmbedHtml(String)` | utils/formatters.dart | sanitizeEmbedHtml() |

[Classes]
Flutter widget classes and Provider classes.

**New Classes:**

| Class | File | Type | Key Methods |
|---|---|---|---|
| `RedditScrollerApp` | app.dart | StatelessWidget | build() — MultiProvider setup |
| `HomeScreen` | screens/home_screen.dart | StatefulWidget | _buildMasonry(), _setupScrollListener() |
| `ReelScreen` | screens/reel_screen.dart | StatefulWidget | _buildReelList(), _scrollToIndex(), _closeReel() |
| `TopBar` | widgets/top_bar.dart | StatelessWidget | build() — brand, search, accent, blacklist |
| `SortPills` | widgets/sort_pills.dart | StatefulWidget | _onSortChanged(), _buildSubmenu() |
| `GridPostCard` | widgets/grid_post_card.dart | StatelessWidget | build() — card with thumbnail + meta |
| `ReelPostCard` | widgets/reel_post_card.dart | StatefulWidget | _buildMedia(), _onShare(), _onComments() |
| `VideoPlayerWidget` | widgets/video_player_widget.dart | StatefulWidget | _initVideo(), _playPause(), _syncVolume() |
| `GalleryCarousel` | widgets/gallery_carousel.dart | StatefulWidget | _goToSlide(), _onSwipe() |
| `ImageLightbox` | widgets/image_lightbox.dart | StatefulWidget | _onZoom(), _onPan(), _onSwipeDismiss() |
| `CommentSheet` | widgets/comment_sheet.dart | StatefulWidget | _buildCommentTree(), _toggleCollapse() |
| `BlacklistModal` | widgets/blacklist_modal.dart | StatefulWidget | _addTerm(), _removeTerm() |
| `PostProvider` | providers/post_provider.dart | ChangeNotifier | see Functions table |
| `SearchProvider` | providers/search_provider.dart | ChangeNotifier | see Functions table |
| `BlacklistProvider` | providers/blacklist_provider.dart | ChangeNotifier | see Functions table |
| `SettingsProvider` | providers/settings_provider.dart | ChangeNotifier | see Functions table |
| `CommentProvider` | providers/comment_provider.dart | ChangeNotifier | see Functions table |
| `RedditApiService` | services/reddit_api_service.dart | Service class | see Functions table |
| `MediaProcessor` | services/media_processor.dart | Service class | see Functions table |

[Dependencies]
Flutter pub packages to add.

| Package | Version (approx) | Purpose |
|---|---|---|
| provider | ^6.1.0 | State management |
| http | ^1.2.0 | HTTP client for Reddit API |
| video_player | ^2.9.0 | Video playback |
| cached_network_image | ^3.3.0 | Image caching for grid thumbs |
| share_plus | ^9.0.0 | Native share sheet |
| url_launcher | ^6.2.0 | Open Reddit links externally |
| shared_preferences | ^2.3.0 | Persist blacklist & accent color |
| path_provider | ^2.1.0 | Cache directory for video |

[Testing]
Widget tests and unit tests for critical logic.

- **Unit tests** for `Formatter` (formatNumber, timeAgo, safeUrl, sanitizeText, parseMarkdown)
- **Unit tests** for `MediaProcessor` (processContent with video/gallery/image/text cases)
- **Unit tests** for `RedditApiService.normalizeSubredditInput`
- **Widget tests** for TopBar, SortPills, GridPostCard, ReelPostCard
- **Integration test** for full scroll + reel flow

[Implementation Order]
Implement from the bottom up: models → services → utils → providers → widgets → screens → app entry.

1. **Project scaffold** — Create Flutter project, set up pubspec.yaml with all dependencies, `flutter pub get`
2. **Config layer** — Create constants.dart and theme.dart (port from src/constants.js + variables.css)
3. **Models** — Create post.dart, comment.dart, subreddit_suggestion.dart, media_content.dart with JSON serialization
4. **Utilities** — Create formatters.dart (port from src/utils.js)
5. **Services** — Create reddit_api_service.dart (port from src/api.js) and media_processor.dart (port processContent() logic)
6. **Providers** — Create all 5 providers: PostProvider, SearchProvider, BlacklistProvider, SettingsProvider, CommentProvider
7. **Widgets (Core)** — Create VideoPlayerWidget, GalleryCarousel, ImageLightbox, SortPills
8. **Widgets (Cards)** — Create GridPostCard and ReelPostCard
9. **Widgets (Overlays)** — Create CommentSheet and BlacklistModal
10. **TopBar** — Create TopBar widget with search, accent picker, blacklist button
11. **Screens** — Create HomeScreen (masonry grid) and ReelScreen (snap scroll)
12. **App entry** — Create main.dart and app.dart with MultiProvider + MaterialApp + routing
13. **Polish** — Wire up infinite scroll, pull-to-close gestures, volume sync, double-tap heart animation
14. **Testing** — Write unit and widget tests