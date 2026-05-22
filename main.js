import "./style.css";
import { RedditAPI } from "./src/api.js";
import {
  formatNumber,
  extractRedgifsId,
  buildRedgifsResult,
  parseMarkdown,
  sanitizeText,
  timeAgo,
  safeUrl,
  decodeHtmlEntities,
  sanitizeEmbedHtml,
} from "./src/utils.js";
import {
  BREAKPOINTS,
  DEBOUNCE_MS,
  SCROLL_THRESHOLD,
  MAX_COMMENT_DEPTH,
  OBSERVER_THRESHOLD,
  SENTINEL_ROOT_MARGIN,
  STORAGE_KEY,
  HLS_CONFIG,
  SHARE_COPIED_DURATION,
} from "./src/constants.js";

class RedditScroller {
  constructor() {
    this.homeEl = document.getElementById("home");
    this.homeGrid = document.getElementById("homeGrid");
    this.app = document.getElementById("app");
    this.reelView = document.getElementById("reelView");
    this.topBar = document.getElementById("topBar");
    this.searchInput = document.getElementById("subredditSearch");
    this.suggestions = document.getElementById("suggestions");
    this.loader = document.getElementById("loader");
    this.gridLoader = document.getElementById("gridLoader");
    this.timePills = document.getElementById("timePills");
    this.blacklistBtn = document.getElementById("blacklistBtn");
    this.blacklistModal = document.getElementById("blacklistModal");
    this.blacklistInput = document.getElementById("blacklistInput");
    this.blacklistTagsEl = document.getElementById("blacklistTags");
    this.commentSheet = document.getElementById("commentSheet");
    this.commentList = document.getElementById("commentList");
    this.commentLoader = document.getElementById("commentLoader");
    this.commentCountEl = document.getElementById("commentCount");
    this.closeCommentsBtn = document.getElementById("closeComments");
    this.accentToggle = document.getElementById("accentToggle");
    this.accentPopover = document.getElementById("accentPopover");
    this.muteToggle = document.getElementById("muteToggle");

    this.currentSubreddit = "all";
    this.currentSort = "hot";
    this.currentTime = "day";
    this.after = "";
    this.isLoading = false;
    this.posts = [];
    this.reelMode = false;
    this.audioUnlocked = false;
    this._lastScrollTop = 0;
    this.videoObserver = null;
    this.blacklist = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );
    this.globalVolume = 1.0;
    this.globalMuted = true;
    this.masonryCols = [];
    this.colCount = 1;
    this.resizeTimer = null;
    this.api = new RedditAPI();
    this.feedRequestId = 0;
    this.suggestionRequestId = 0;

    this.init();
  }

  init() {
    this.setupMasonry();
    this.setupObservers();
    this.setupEventListeners();
    this.setupAudioUnlock();
    this.renderBlacklistTags();
    this.initAccent();
    this.setupAccentToggle();
    this.fetchPosts();
  }

  setupAudioUnlock() {
    const unlock = () => {
      this.audioUnlocked = true;
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
  }

  setupMasonry() {
    this.colCount = this.getColCount();
    this.buildColumns();

    window.addEventListener("resize", () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const newCount = this.getColCount();
        if (newCount !== this.colCount) {
          this.colCount = newCount;
          this.buildColumns();
          if (!this.reelMode && this.posts.length > 0) {
            this.renderGridPosts(this.posts, 0);
          }
        }
      }, DEBOUNCE_MS.RESIZE);
    });
  }

  getColCount() {
    const w = window.innerWidth;
    if (w >= BREAKPOINTS.XL) return 4;
    if (w >= BREAKPOINTS.LG) return 3;
    if (w >= BREAKPOINTS.MD) return 2;
    return 1;
  }

  buildColumns() {
    this.homeGrid.innerHTML = "";
    this.masonryCols = [];
    for (let i = 0; i < this.colCount; i++) {
      const col = document.createElement("div");
      col.className = "masonry-col";
      this.homeGrid.appendChild(col);
      this.masonryCols.push(col);
    }
  }

  setupObservers() {
    this.videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target;
          if (entry.isIntersecting) {
            video.muted = this.globalMuted;
            video.volume = this.globalVolume;
            video.play().catch(() => {
              if (video.muted) {
                video.play().catch(() => {});
              }
            });
          } else {
            video.pause();
          }
        });
      },
      { threshold: OBSERVER_THRESHOLD },
    );

    this.gridSentinelObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.isLoading && this.after) {
          this.fetchPosts(false);
        }
      },
      { root: this.homeEl, threshold: 0.1, rootMargin: SENTINEL_ROOT_MARGIN },
    );
    this.gridSentinelObserver.observe(this.gridLoader);

    this.reelSentinelObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !this.isLoading && this.after) {
          this.fetchPosts(true);
        }
      },
      { root: this.app, threshold: 0.1, rootMargin: SENTINEL_ROOT_MARGIN },
    );
    this.reelSentinelObserver.observe(this.loader);
  }

  setupEventListeners() {
    document
      .getElementById("closeReel")
      .addEventListener("click", () => this.closeReel());

    if (this.muteToggle) {
      this.muteToggle.addEventListener("click", () => this.toggleMute());
    }

    document.addEventListener("keydown", (e) => {
      if (this.reelMode) {
        if (e.key === "Escape") {
          this.closeReel();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const cards = Array.from(this.app.querySelectorAll(".post-card"));
          if (cards.length) {
            const containerTop = this.app.scrollTop;
            const cardHeight = this.app.clientHeight || window.innerHeight;
            const currentIndex = Math.round(containerTop / cardHeight);
            const targetIndex = e.key === "ArrowDown"
              ? Math.min(cards.length - 1, currentIndex + 1)
              : Math.max(0, currentIndex - 1);
            cards[targetIndex].scrollIntoView({ behavior: "smooth" });
          }
        }
      }
    });

    this.blacklistBtn.addEventListener(
      "click",
      () => (this.blacklistModal.style.display = "flex"),
    );
    document
      .getElementById("closeModal")
      .addEventListener(
        "click",
        () => (this.blacklistModal.style.display = "none"),
      );
    this.blacklistModal.addEventListener("click", (e) => {
      if (e.target === this.blacklistModal)
        this.blacklistModal.style.display = "none";
    });
    document
      .getElementById("addBlacklist")
      .addEventListener("click", () => this.addBlacklistTerm());
    this.blacklistInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.addBlacklistTerm();
    });

    this.blacklistTagsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-term]");
      if (btn) this.removeBlacklistTerm(btn.dataset.term);
    });

    const sortPills = document.getElementById("sortPills");
    const closeSortSubmenus = (exceptWrapper = null) => {
      sortPills.querySelectorAll(".sort-menu-wrapper.open").forEach((wrapper) => {
        if (wrapper !== exceptWrapper) wrapper.classList.remove("open");
        const parentPill = wrapper?.querySelector(".sort-pill[data-sort]");
        if (parentPill) parentPill.setAttribute("aria-expanded", "false");
      });
    };
    const updateSortPillsAria = (activePill) => {
      sortPills.querySelectorAll(".sort-pill").forEach((p) => {
        const isActive = p === activePill;
        p.setAttribute("aria-pressed", String(isActive));
      });
    };
    const activateSortPill = (pill) => {
      sortPills
        .querySelectorAll(".sort-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      updateSortPillsAria(pill);
    };
    const activateTimeOption = (time) => {
      sortPills
        .querySelectorAll(".sort-time")
        .forEach((btn) => btn.classList.toggle("active", btn.dataset.time === time));
    };

    sortPills.addEventListener("click", (e) => {
      const timeOption = e.target.closest(".sort-time");
      if (timeOption) {
        const wrapper = timeOption.closest(".sort-menu-wrapper");
        const parentPill = wrapper?.querySelector(".sort-pill[data-sort]");
        if (!parentPill) return;

        activateSortPill(parentPill);
        this.currentSort = parentPill.dataset.sort;
        this.currentTime = timeOption.dataset.time;
        activateTimeOption(this.currentTime);
        closeSortSubmenus();
        this.resetFeed();
        this.fetchPosts();
        return;
      }

      const pill = e.target.closest(".sort-pill");
      if (!pill) return;

      const wrapper = pill.closest(".sort-menu-wrapper");
      if (pill.classList.contains("has-submenu") && wrapper) {
        const shouldOpen = !wrapper.classList.contains("open");
        closeSortSubmenus(wrapper);
        wrapper.classList.toggle("open", shouldOpen);
        pill.setAttribute("aria-expanded", String(shouldOpen));

        if (this.currentSort !== pill.dataset.sort) {
          activateSortPill(pill);
          this.currentSort = pill.dataset.sort;
          activateTimeOption(this.currentTime);
          this.resetFeed();
          this.fetchPosts();
        }
        return;
      }

      activateSortPill(pill);
      closeSortSubmenus();
      this.currentSort = pill.dataset.sort;
      this.resetFeed();
      this.fetchPosts();
    });

    sortPills.addEventListener("keydown", (e) => {
      const pills = Array.from(sortPills.querySelectorAll(".sort-pill:not(.has-submenu)"));
      const allFocusable = Array.from(sortPills.querySelectorAll(".sort-pill"));
      const currentIndex = allFocusable.indexOf(document.activeElement);
      if (currentIndex === -1) return;
      let newIndex = currentIndex;
      if (e.key === "ArrowRight") newIndex = (currentIndex + 1) % allFocusable.length;
      else if (e.key === "ArrowLeft") newIndex = (currentIndex - 1 + allFocusable.length) % allFocusable.length;
      else return;
      e.preventDefault();
      allFocusable[newIndex].focus();
    });

    document.addEventListener("click", (e) => {
      if (!sortPills.contains(e.target)) closeSortSubmenus();
    });

    // Mobile search expand — hides brand + icon buttons on focus, restores on blur
    this.searchInput.addEventListener("focus", () => {
      if (window.innerWidth <= 600) {
        this.topBar.classList.add("search-expand");
      }
    });
    this.searchInput.addEventListener("blur", () => {
      // Small delay so click on suggestion items registers before the layout shifts
      setTimeout(() => {
        this.topBar.classList.remove("search-expand");
      }, 200);
    });

    let timeout;
    this.searchInput.addEventListener("input", (e) => {
      clearTimeout(timeout);
      const val = e.target.value.trim();
      if (!val) {
        this.suggestions.style.display = "none";
        return;
      }
      timeout = setTimeout(() => this.fetchSuggestions(val), DEBOUNCE_MS.SEARCH);
    });
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.searchInput.value.trim()) {
        this.currentSubreddit = this.searchInput.value.trim();
        this.resetFeed();
        this.fetchPosts();
        this.suggestions.style.display = "none";
      }
    });
    document.addEventListener("click", (e) => {
      if (
        !this.suggestions.contains(e.target) &&
        e.target !== this.searchInput
      ) {
        this.suggestions.style.display = "none";
      }
    });

    let ticking = false;
    this.homeEl.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          this.handleTopBarScroll(this.homeEl);
          ticking = false;
        });
        ticking = true;
      }
    });

    // Subreddit navigation clicks (delegated)
    this.homeGrid.addEventListener("click", (e) => {
      const subEl = e.target.closest("[data-subreddit]");
      if (subEl) {
        e.stopPropagation();
        this.navigateToSubreddit(subEl.dataset.subreddit);
      }
    });

    this.reelView.addEventListener("click", (e) => {
      const subEl = e.target.closest("[data-subreddit]");
      if (subEl) {
        this.navigateToSubreddit(subEl.dataset.subreddit);
      }
    });

    this.closeCommentsBtn.addEventListener("click", () =>
      this.toggleComments(false),
    );

    // Reel View Pull-down to Close
    let reelStartY = 0;
    let reelCurrentY = 0;
    
    this.app.addEventListener("touchstart", (e) => {
      if (this.app.scrollTop === 0) {
        reelStartY = e.touches[0].clientY;
      } else {
        reelStartY = 0;
      }
    }, { passive: true });

    this.app.addEventListener("touchmove", (e) => {
      if (!reelStartY) return;
      reelCurrentY = e.touches[0].clientY;
      const deltaY = reelCurrentY - reelStartY;
      
      if (deltaY > 0) {
        this.reelView.style.transition = 'none';
        this.reelView.style.transform = `translateY(${deltaY * 0.6}px)`;
      }
    }, { passive: true });

    this.app.addEventListener("touchend", (e) => {
      if (!reelStartY || !reelCurrentY) {
        reelStartY = 0;
        reelCurrentY = 0;
        return;
      }
      const deltaY = reelCurrentY - reelStartY;
      
      this.reelView.style.transition = '';
      this.reelView.style.transform = '';
      
      if (deltaY > 120) {
        this.closeReel();
      }
      
      reelStartY = 0;
      reelCurrentY = 0;
    });

    // Comment Sheet Swipe to Dismiss
    let sheetStartY = 0;
    let sheetCurrentY = 0;
    
    this.commentSheet.addEventListener("touchstart", (e) => {
      if (this.commentList.scrollTop === 0) {
        if (window.innerWidth <= 600) {
          sheetStartY = e.touches[0].clientY;
        } else {
          sheetStartY = e.touches[0].clientX;
        }
      } else {
        sheetStartY = 0;
      }
    }, { passive: true });

    this.commentSheet.addEventListener("touchmove", (e) => {
      if (!sheetStartY) return;
      
      if (window.innerWidth <= 600) {
        sheetCurrentY = e.touches[0].clientY;
        const deltaY = sheetCurrentY - sheetStartY;
        if (deltaY > 0) {
          this.commentSheet.style.transition = 'none';
          this.commentSheet.style.transform = `translateY(${deltaY}px)`;
        }
      } else {
        sheetCurrentY = e.touches[0].clientX;
        const deltaX = sheetCurrentY - sheetStartY;
        if (deltaX > 0) {
          this.commentSheet.style.transition = 'none';
          this.commentSheet.style.transform = `translateX(${deltaX}px)`;
        }
      }
    }, { passive: true });

    this.commentSheet.addEventListener("touchend", (e) => {
      if (!sheetStartY || !sheetCurrentY) {
        sheetStartY = 0;
        sheetCurrentY = 0;
        return;
      }
      const delta = sheetCurrentY - sheetStartY;
      
      this.commentSheet.style.transition = '';
      this.commentSheet.style.transform = '';
      
      if (delta > 100) {
        this.toggleComments(false);
      }
      sheetStartY = 0;
      sheetCurrentY = 0;
    });

    // Image Lightbox Trigger (Delegated)
    this.reelView.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (img) {
        if (
          img.closest(".post-content") ||
          img.closest(".gallery-slide") ||
          img.closest(".comment-media")
        ) {
          e.stopPropagation();
          e.preventDefault();
          this.openLightbox(img.src);
        }
      }
    });
  }

  handleTopBarScroll(el) {
    const curr = el.scrollTop;
    if (curr > this._lastScrollTop && curr > SCROLL_THRESHOLD) {
      this.topBar.classList.add("hidden");
    } else {
      this.topBar.classList.remove("hidden");
    }
    this._lastScrollTop = curr;
  }

  openReel(startIndex) {
    this.reelMode = true;
    this.audioUnlocked = true;
    this.app.innerHTML = "";
    this.renderReelPosts(this.posts.slice(startIndex));
    
    // Make sure loader is always at the bottom
    this.app.appendChild(this.loader);
    this.reelSentinelObserver.unobserve(this.loader);
    this.reelSentinelObserver.observe(this.loader);

    this.reelView.classList.add("active");
    document.body.style.overflow = "hidden";
    this.app.scrollTop = 0;
  }

  closeReel() {
    this.reelMode = false;
    this.reelView.classList.remove("active");
    this.toggleComments(false);
    document.body.style.overflow = "";
    document.querySelectorAll("#app video").forEach((v) => v.pause());
    this.app.innerHTML = "";
  }

  syncVideoVolume(sourceVideo) {
    this.globalVolume = sourceVideo.volume;
    this.globalMuted = sourceVideo.muted;

    document.querySelectorAll("video").forEach((vid) => {
      if (vid !== sourceVideo) {
        if (vid.muted !== this.globalMuted) {
          vid.muted = this.globalMuted;
        }
        if (vid.volume !== this.globalVolume) {
          vid.volume = this.globalVolume;
        }
      }
    });
  }

  toggleMute() {
    this.globalMuted = !this.globalMuted;
    const icon = this.muteToggle?.querySelector("i");
    if (icon) {
      icon.className = this.globalMuted ? "bi bi-volume-mute-fill" : "bi bi-volume-up-fill";
    }
    document.querySelectorAll("video").forEach((vid) => {
      vid.muted = this.globalMuted;
    });
  }

  openLightbox(imgSrc) {
    let lightbox = document.getElementById("imageLightbox");
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.id = "imageLightbox";
      lightbox.className = "lightbox-overlay";
      lightbox.innerHTML = `
        <button class="lightbox-close" aria-label="Close lightbox"><i class="bi bi-x-lg"></i></button>
        <div class="lightbox-content">
          <img class="lightbox-image" src="" alt="Enlarged view">
        </div>
      `;
      document.body.appendChild(lightbox);

      const closeBtn = lightbox.querySelector(".lightbox-close");
      closeBtn.addEventListener("click", () => this.closeLightbox());
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox || e.target.classList.contains("lightbox-content")) {
          this.closeLightbox();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && lightbox.classList.contains("active")) {
          this.closeLightbox();
        }
      });

      const img = lightbox.querySelector(".lightbox-image");
      let isZoomed = false;
      let startX = 0, startY = 0;
      let translateX = 0, translateY = 0;
      let isDragging = false;

      img.addEventListener("click", (e) => {
        e.stopPropagation();
        isZoomed = !isZoomed;
        img.classList.toggle("zoomed", isZoomed);
        if (!isZoomed) {
          translateX = 0;
          translateY = 0;
          img.style.transform = "none";
        } else {
          img.style.transform = `scale(2) translate(0px, 0px)`;
        }
      });

      img.addEventListener("mousedown", (e) => {
        if (!isZoomed) return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        img.style.cursor = "grabbing";
        img.style.transition = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        img.style.transform = `scale(2) translate(${translateX / 2}px, ${translateY / 2}px)`;
      });

      window.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          img.style.cursor = "zoom-out";
          img.style.transition = "";
        }
      });

      let swipeStartY = 0;
      let swipeCurrentY = 0;

      lightbox.addEventListener("touchstart", (e) => {
        if (isZoomed) return;
        swipeStartY = e.touches[0].clientY;
      }, { passive: true });

      lightbox.addEventListener("touchmove", (e) => {
        if (!swipeStartY || isZoomed) return;
        swipeCurrentY = e.touches[0].clientY;
        const deltaY = swipeCurrentY - swipeStartY;
        if (deltaY > 0) {
          img.style.transform = `translateY(${deltaY}px)`;
          lightbox.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0.2, 0.85 - deltaY / 400)})`;
        }
      }, { passive: true });

      lightbox.addEventListener("touchend", () => {
        if (!swipeStartY || isZoomed) return;
        const deltaY = swipeCurrentY - swipeStartY;
        if (deltaY > 150) {
          this.closeLightbox();
        } else {
          img.style.transform = "";
          lightbox.style.backgroundColor = "";
        }
        swipeStartY = 0;
        swipeCurrentY = 0;
      });
    }

    const img = lightbox.querySelector(".lightbox-image");
    img.src = imgSrc;
    img.className = "lightbox-image";
    img.style.transform = "";
    img.style.cursor = "zoom-in";
    lightbox.style.backgroundColor = "";
    lightbox.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  closeLightbox() {
    const lightbox = document.getElementById("imageLightbox");
    if (lightbox) {
      lightbox.classList.remove("active");
      const img = lightbox.querySelector(".lightbox-image");
      if (img) {
        img.className = "lightbox-image";
        img.style.transform = "";
      }
      if (!this.reelMode) {
        document.body.style.overflow = "";
      }
    }
  }

  navigateToSubreddit(sub) {
    this.currentSubreddit = sub;
    this.searchInput.value = sub;
    this.resetFeed();
    this.fetchPosts();
    this.suggestions.style.display = "none";
  }

  addBlacklistTerm() {
    const term = this.blacklistInput.value.trim().toLowerCase();
    if (term && !this.blacklist.includes(term)) {
      this.blacklist.push(term);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.blacklist));
      this.renderBlacklistTags();
      this.blacklistInput.value = "";
    }
  }

  removeBlacklistTerm(term) {
    this.blacklist = this.blacklist.filter((t) => t !== term);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.blacklist));
    this.renderBlacklistTags();
  }

  renderBlacklistTags() {
    this.blacklistTagsEl.innerHTML = this.blacklist
      .map(
        (term) =>
          `<span class="blacklist-tag">${sanitizeText(term)} <button data-term="${sanitizeText(term)}">-</button></span>`,
      )
      .join("");
  }

  _filterComments(comments) {
    if (!Array.isArray(comments)) return [];
    return comments.filter((c) => c && c.body);
  }

  isBlacklisted(data) {
    const h = `${data.title} ${data.subreddit}`.toLowerCase();
    return this.blacklist.some((t) => h.includes(t));
  }

  async fetchSuggestions(query) {
    const requestId = ++this.suggestionRequestId;
    try {
      const lastToken = (query || "").split(/[,+\s]+/).pop() || "";
      const q = lastToken.trim().replace(/^r\//i, "");
      if (!q) {
        this.suggestions.style.display = "none";
        return;
      }
      const data = await this.api.fetchSuggestions(q);
      if (requestId !== this.suggestionRequestId) return;
      const subs = data.data.children.filter((c) => c.kind === "t5");
      if (subs.length) this.renderSuggestions(subs);
      else this.suggestions.style.display = "none";
    } catch (e) {
      if (requestId !== this.suggestionRequestId) return;
      console.error(e);
    }
  }

  renderSuggestions(subs) {
    this.suggestions.replaceChildren();
    subs.forEach((sub) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.dataset.name = sub.data.display_name || "";

      const icon = document.createElement("div");
      icon.className = "suggestion-icon";
      icon.style.backgroundSize = "cover";
      const iconUrl = safeUrl(sub.data.community_icon || sub.data.icon_img || "");
      if (iconUrl) icon.style.backgroundImage = `url("${iconUrl}")`;

      const details = document.createElement("div");
      const name = document.createElement("span");
      name.style.fontWeight = "600";
      name.textContent = `r/${sub.data.display_name || ""}`;
      const members = document.createElement("span");
      members.style.fontSize = "0.75rem";
      members.style.color = "#aaa";
      members.style.display = "block";
      members.textContent = `${(sub.data.subscribers || 0).toLocaleString()} members`;
      details.append(name, members);
      item.append(icon, details);
      this.suggestions.appendChild(item);
    });
    this.suggestions.style.display = "block";
    this.suggestions.querySelectorAll(".suggestion-item").forEach((item) => {
      item.addEventListener("click", () => {
        const picked = item.dataset.name || "";
        const existing = this.searchInput.value || "";

        const parts = existing
          .split(/[,+\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => t.replace(/^r\//i, ""));

        if (parts.length) parts[parts.length - 1] = picked;
        else parts.push(picked);

        const nextRaw = parts.join(", ");
        this.searchInput.value = nextRaw;
        this.currentSubreddit = nextRaw;
        this.resetFeed();
        this.fetchPosts();
        this.suggestions.style.display = "none";
      });
    });
  }

  resetFeed() {
    this.posts = [];
    this.after = "";
    this.buildColumns();
    if (this.reelMode) this.closeReel();
  }

  async fetchPosts(appendToReel = false) {
    if (this.isLoading) return;
    const requestId = ++this.feedRequestId;
    this.isLoading = true;
    if (appendToReel) this.loader.style.opacity = "1";
    else this.gridLoader.style.opacity = "1";
    try {
      const sort = ["top", "controversial"].includes(this.currentSort)
        ? `${this.currentSort}?t=${this.currentTime}`
        : this.currentSort;
      const data = await this.api.fetchSubredditPosts(
        this.currentSubreddit,
        sort,
        this.after,
      );
      if (requestId !== this.feedRequestId) return;
      const newPosts = data.posts.filter((p) => !this.isBlacklisted(p));
      this.after = data.afterToken;
      const startIndex = this.posts.length;
      this.posts.push(...newPosts);
      if (appendToReel) {
        this.renderReelPosts(newPosts);
        this.app.appendChild(this.loader); // Keep loader at the bottom after adding new posts
      }
      else this.renderGridPosts(newPosts, startIndex);
    } catch (err) {
      if (requestId !== this.feedRequestId) return;
      console.error("Fetch failed:", err);
      if (!appendToReel && this.posts.length === 0) {
        this.homeGrid.innerHTML =
          '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:#ff4500;"><i class="bi bi-exclamation-triangle-fill" style="font-size:2rem;display:block;margin-bottom:1rem;"></i><p style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;">Failed to load Reddit data</p><p style="font-size:0.85rem;color:#a1a1aa;">Check the browser console for details.</p></div>';
      }
    } finally {
      if (requestId !== this.feedRequestId) return;
      this.isLoading = false;
      this.loader.style.opacity = "0";
      this.gridLoader.style.opacity = "0";

      if (!appendToReel) {
        this.gridSentinelObserver.unobserve(this.gridLoader);
        this.gridSentinelObserver.observe(this.gridLoader);
      } else {
        this.reelSentinelObserver.unobserve(this.loader);
        this.reelSentinelObserver.observe(this.loader);
      }
    }
  }

  renderGridPosts(newPosts, startIndex) {
    const isFirstLoad = this.posts.length === newPosts.length && startIndex === 0;
    newPosts.forEach((data, i) => {
      const processed = this.processContent(data);
      if (!processed) return;

      const idx = startIndex + i;
      const thumb = sanitizeText(safeUrl(processed.gridThumb || processed.poster || data.thumbnail));
      const safeSubreddit = sanitizeText(data.subreddit || "");
      const safeTitle = sanitizeText(data.title || "");
      const safeScore = sanitizeText(formatNumber(data.score));
      const safeComments = sanitizeText(formatNumber(data.num_comments));
      const isVideo = processed.type === "video" || processed.type === "embed";
      const isGallery = processed.type === "gallery";
      const isText = processed.type === "text";
      const thumbIcon = isVideo ? "play-circle-fill" : null;
      
      const firstImage = isGallery ? processed.images[0] : processed;
      const aspect = isText
        ? "16 / 10"
        : ((firstImage && firstImage.width && firstImage.height) 
          ? `${firstImage.width} / ${firstImage.height}` 
          : "auto");

      const galleryControls = isGallery && processed.images.length > 1 
        ? `<div class="gallery-counter">${1} / ${processed.images.length}</div>
           <button class="gallery-nav gallery-prev" type="button" data-nav="prev"><i class="bi bi-chevron-left"></i></button>
           <button class="gallery-nav gallery-next" type="button" data-nav="next"><i class="bi bi-chevron-right"></i></button>`
        : "";

      let thumbHtml = "";
      if (isText) {
        const previewText = sanitizeText(processed.selftext || "");
        thumbHtml = `
          <div class="flex-text-preview-container">
            <div class="flex-text-preview-body">${previewText}</div>
            <div class="flex-text-preview-overlay"></div>
            <div class="flex-text-icon"><i class="bi bi-file-text"></i></div>
          </div>
        `;
      } else {
        thumbHtml = `
          <img src="${thumb}" loading="lazy" alt="">
          ${isGallery ? `<div class="flex-thumb-badge"><i class="bi bi-images"></i> ${processed.gallery_count}</div>` : ""}
          ${thumbIcon ? `<div class="flex-thumb-overlay"><i class="bi bi-${thumbIcon}"></i></div>` : ""}
          ${galleryControls}
        `;
      }

      const card = document.createElement("div");
      card.className = "flex-card";
      card.dataset.index = idx;
      if (isFirstLoad) card.style.setProperty("--i", i);
      card.innerHTML = `
        <div class="flex-thumb ${isText ? 'is-text-preview' : ''}" style="--thumb-aspect: ${aspect}">
          ${thumbHtml}
        </div>
        <div class="flex-body">
          <span class="flex-sub" role="button" tabindex="0" data-subreddit="${safeSubreddit}">r/${safeSubreddit}</span>
          <span class="flex-title">${safeTitle}</span>
          <div class="flex-meta">
            <span><i class="bi bi-arrow-up"></i> ${safeScore}</span>
            <span><i class="bi bi-chat"></i> ${safeComments}</span>
          </div>
        </div>`;

      if (isGallery) {
        this.setupGridGallery(card, processed.images);
      }

      if (processed.type === "video" && (processed.source || processed.hlsSource)) {
        const thumbContainer = card.querySelector(".flex-thumb");
        let hoverVideo = null;

        thumbContainer.addEventListener("mouseenter", () => {
          if (!hoverVideo) {
            hoverVideo = document.createElement("video");
            
            hoverVideo.muted = this.globalMuted;
            hoverVideo.volume = this.globalVolume;
            hoverVideo.loop = true;
            hoverVideo.playsInline = true;
            hoverVideo.preload = "auto";
            hoverVideo.className = "hover-preview-video";
            thumbContainer.appendChild(hoverVideo);

            hoverVideo.addEventListener("volumechange", () => {
              if (hoverVideo.dataset.blockSync) return;
              if (hoverVideo.muted !== this.globalMuted || hoverVideo.volume !== this.globalVolume) {
                this.syncVideoVolume(hoverVideo);
              }
            });

            const primarySrc = processed.source;
            const hasHlsOnly = !primarySrc && processed.hlsSource;

            if (hasHlsOnly) {
              hoverVideo.dataset.hlsSource = processed.hlsSource || "";
              hoverVideo.dataset.fallback = processed.fallbackSource || "";
              this.initHlsForVideo(hoverVideo, processed.hlsSource);
            } else {
              hoverVideo.src = primarySrc;
              hoverVideo.dataset.hlsSource = processed.hlsSource || "";
              hoverVideo.dataset.fallback = processed.fallbackSource || primarySrc || "";
              this.setupVideoFallback(hoverVideo);
            }
          }
          
          hoverVideo.play().catch(() => {
            if (!hoverVideo.muted) {
              hoverVideo.dataset.blockSync = "true";
              hoverVideo.muted = true;
              hoverVideo.play().catch(() => {});
              setTimeout(() => {
                delete hoverVideo.dataset.blockSync;
              }, 0);
            }
          });
          hoverVideo.style.opacity = "1";
        });

        thumbContainer.addEventListener("mouseleave", () => {
          if (hoverVideo) {
            hoverVideo.style.opacity = "0";
            hoverVideo.pause();
            if (hoverVideo._hls) {
              hoverVideo._hls.destroy();
              hoverVideo._hls = null;
            }
            if (hoverVideo && hoverVideo.parentNode) {
              hoverVideo.parentNode.removeChild(hoverVideo);
            }
            hoverVideo = null;
          }
        });
      }

      card.addEventListener("click", () => this.openReel(idx));

      let targetCol = this.masonryCols[0];
      for (let j = 1; j < this.colCount; j++) {
        if (this.masonryCols[j].children.length < targetCol.children.length) {
          targetCol = this.masonryCols[j];
        }
      }
      targetCol.appendChild(card);
    });
  }

  renderReelPosts(posts) {
    posts.forEach((data) => {
      const processed = this.processContent(data);
      if (!processed) return;

      const card = document.createElement("div");
      card.className = "post-card";

      let contentHtml = "";
      if (processed.type === "video") {
        contentHtml = `<video loop playsinline controls preload="metadata" referrerpolicy="no-referrer" poster="${sanitizeText(safeUrl(processed.poster || ""))}" src="${sanitizeText(safeUrl(processed.source || ""))}" data-hls-source="${sanitizeText(safeUrl(processed.hlsSource || ""))}" data-fallback="${sanitizeText(safeUrl(processed.fallbackSource || processed.source || ""))}">
          ${processed.sources.map((s) => `<source src="${sanitizeText(safeUrl(s.src))}" type="${sanitizeText(s.type)}">`).join("")}
        </video>`;
      } else if (processed.type === "embed") {
        contentHtml = `<div class="embed-container">${processed.html}</div>`;
      } else if (processed.type === "gallery") {
        contentHtml = this.renderGalleryContent(data, processed);
      } else if (processed.type === "text") {
        const renderedText = parseMarkdown(processed.selftext || "");
        contentHtml = `
          <div class="reel-text-container">
            <div class="reel-text-content">
              ${renderedText || '<span class="text-muted italic">No additional text</span>'}
            </div>
          </div>
        `;
      } else {
        contentHtml = `<img src="${sanitizeText(safeUrl(processed.source || ""))}" loading="lazy" referrerpolicy="no-referrer">`;
      }

      card.innerHTML = this.getPostTemplate(data, contentHtml);
      // Append before the loader if it exists
      if (this.loader && this.loader.parentNode === this.app) {
        this.app.insertBefore(card, this.loader);
      } else {
        this.app.appendChild(card);
      }

      const videos = card.querySelectorAll("video");
      videos.forEach((video) => {
        this.videoObserver.observe(video);
        this.setupVideoFallback(video);

        video.muted = this.globalMuted;
        video.volume = this.globalVolume;

        video.addEventListener("volumechange", () => {
          if (video.dataset.blockSync) return;
          if (video.muted !== this.globalMuted || video.volume !== this.globalVolume) {
            this.syncVideoVolume(video);
          }
        });
        
        video.addEventListener("click", (e) => {
          if (video.paused) {
            video.play().catch(() => {
              if (!video.muted) {
                video.dataset.blockSync = "true";
                video.muted = true;
                video.play().catch(() => {});
                setTimeout(() => {
                  delete video.dataset.blockSync;
                }, 0);
              }
            });
          } else {
            video.pause();
          }
        });
      });
      if (!processed.source && processed.hlsSource) this.initHls(data.name, processed.hlsSource);

      this.setupGallery(card.querySelector(".gallery-carousel"));
      
      let lastTap = 0;
      card.addEventListener("touchend", (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        
        if (tapLength < 300 && tapLength > 0) {
          const content = card.querySelector('.post-content');
          if (content && content.contains(e.target)) {
            this.showHeartAnimation(e, content);
            const upvoteBtn = card.querySelector('.bi-arrow-up-circle-fill');
            if (upvoteBtn) {
              upvoteBtn.style.color = 'var(--accent-color)';
              upvoteBtn.style.transform = 'scale(1.3)';
              setTimeout(() => {
                upvoteBtn.style.transform = '';
              }, 300);
            }
          }
          if (e.cancelable) e.preventDefault();
        }
        lastTap = currentTime;
      });

      card.querySelector(".share-btn").onclick = (e) => {
        e.stopPropagation();
        this.sharePost(data);
      };
      card.querySelector(".comment-btn").onclick = (e) => {
        e.stopPropagation();
        this.openComments(data);
      };
    });
  }

  showHeartAnimation(e, container) {
    const heart = document.createElement('i');
    heart.className = 'bi bi-heart-fill like-animation';
    
    const touch = e.changedTouches[0];
    const rect = container.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    container.appendChild(heart);
    
    setTimeout(() => heart.remove(), 1000);
  }

  renderGalleryContent(data, processed) {
    const slides = processed.images
      .map((image, index) => {
        const source = sanitizeText(safeUrl(image.source || ""));
        const poster = sanitizeText(safeUrl(image.poster || image.source || ""));
        const alt = sanitizeText(`${data.title} image ${index + 1}`);
        const media = image.type === "video"
          ? `<video loop playsinline controls preload="metadata" referrerpolicy="no-referrer" poster="${poster}">
              <source src="${source}" type="video/mp4">
            </video>`
          : `<img src="${source}" loading="lazy" referrerpolicy="no-referrer" alt="${alt}">`;

        return `<div class="gallery-slide" data-gallery-slide>${media}</div>`;
      })
      .join("");

    const dots = processed.images
      .map(
        (_, index) =>
          `<button class="gallery-dot${index === 0 ? " active" : ""}" type="button" data-gallery-dot="${index}" aria-label="View gallery item ${index + 1}"></button>`,
      )
      .join("");

    const controls = processed.images.length > 1
      ? `<div class="gallery-counter" data-gallery-counter>1 / ${processed.images.length}</div>
         <button class="gallery-nav gallery-prev" type="button" data-gallery-prev aria-label="Previous image"><i class="bi bi-chevron-left"></i></button>
         <button class="gallery-nav gallery-next" type="button" data-gallery-next aria-label="Next image"><i class="bi bi-chevron-right"></i></button>
         <div class="gallery-dots">${dots}</div>`
      : "";

    return `<div class="gallery-carousel" data-gallery-index="0">
      <div class="gallery-track" data-gallery-track>${slides}</div>
      ${controls}
    </div>`;
  }

  setupGallery(gallery) {
    if (!gallery) return;

    const track = gallery.querySelector("[data-gallery-track]");
    const slides = Array.from(gallery.querySelectorAll("[data-gallery-slide]"));
    const counter = gallery.querySelector("[data-gallery-counter]");
    const dots = Array.from(gallery.querySelectorAll("[data-gallery-dot]"));
    const prevBtn = gallery.querySelector("[data-gallery-prev]");
    const nextBtn = gallery.querySelector("[data-gallery-next]");
    if (!track || slides.length <= 1) return;

    let currentIndex = 0;
    let startX = 0;
    let startY = 0;

    const setIndex = (nextIndex) => {
      currentIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
      gallery.dataset.galleryIndex = String(currentIndex);
      track.style.transform = `translateX(-${currentIndex * 100}%)`;
      if (counter) counter.textContent = `${currentIndex + 1} / ${slides.length}`;
      dots.forEach((dot, index) => dot.classList.toggle("active", index === currentIndex));
      if (prevBtn) prevBtn.disabled = currentIndex === 0;
      if (nextBtn) nextBtn.disabled = currentIndex === slides.length - 1;

      slides.forEach((slide, index) => {
        const video = slide.querySelector("video");
        if (video && index !== currentIndex) video.pause();
      });
    };

    prevBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      setIndex(currentIndex - 1);
    });
    nextBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      setIndex(currentIndex + 1);
    });
    dots.forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        setIndex(Number(dot.dataset.galleryDot));
      });
    });

    gallery.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    gallery.addEventListener("touchend", (e) => {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;
      setIndex(currentIndex + (deltaX < 0 ? 1 : -1));
    }, { passive: true });

    setIndex(0);
  }

  setupGridGallery(card, images) {
    const thumb = card.querySelector(".flex-thumb img");
    const counter = card.querySelector(".gallery-counter");
    const prevBtn = card.querySelector(".gallery-prev");
    const nextBtn = card.querySelector(".gallery-next");
    if (!thumb || !images || images.length <= 1) return;

    let currentIndex = 0;

    const updateGallery = (newIndex) => {
      currentIndex = (newIndex + images.length) % images.length;
      const imgData = images[currentIndex];
      thumb.src = imgData.gridThumb || imgData.poster || imgData.source;
      if (counter) counter.textContent = `${currentIndex + 1} / ${images.length}`;
    };

    prevBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      updateGallery(currentIndex - 1);
    });

    nextBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      updateGallery(currentIndex + 1);
    });

    let touchStartX = 0;
    let touchStartY = 0;

    card.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    card.addEventListener("touchend", (e) => {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;
      e.stopPropagation(); // prevent opening reel on swipe
      updateGallery(currentIndex + (deltaX < 0 ? 1 : -1));
    }, { passive: true });
  }

  getPostTemplate(data, contentHtml) {
    const safeName = sanitizeText(data.name || "");
    const safeSubreddit = sanitizeText(data.subreddit || "");
    const safeAuthor = sanitizeText(data.author || "");
    const safeTitle = sanitizeText(data.title || "");
    const safeId = sanitizeText(data.id || "");
    const safeScore = sanitizeText(formatNumber(data.score));
    const safeComments = sanitizeText(formatNumber(data.num_comments));
    return `
      <div class="post-content" id="content-${safeName}">${contentHtml}</div>
      <div class="post-info-overlay">
        <div class="post-header">
          <span class="subreddit-name" role="button" tabindex="0" data-subreddit="${safeSubreddit}">${safeSubreddit}</span>
          <span class="post-meta">u/${safeAuthor}</span>
        </div>
        <h2 class="post-title">${safeTitle}</h2>
      </div>
      <div class="post-footer">
        <div class="footer-item">
          <i class="bi bi-arrow-up-circle-fill"></i>
          <span>${safeScore}</span>
        </div>
        <div class="footer-item comment-btn" data-postid="${safeId}">
          <i class="bi bi-chat-fill"></i>
          <span>${safeComments}</span>
        </div>
        <div class="footer-item share-btn" data-postid="${safeId}">
          <i class="bi bi-share-fill"></i>
          <span>Share</span>
        </div>
      </div>`;
  }

  sharePost(data) {
    const url = `https://reddit.com${data.permalink}`;
    if (navigator.share) {
      navigator.share({ title: data.title, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        const safeId = CSS.escape(data.id || "");
        const btn = document.querySelector(`.share-btn[data-postid="${safeId}"]`);
        if (btn) {
          btn.innerHTML = '<i class="bi bi-check-lg"></i><span>Copied!</span>';
          setTimeout(
            () =>
              (btn.innerHTML =
                '<i class="bi bi-share-fill"></i><span>Share</span>'),
            SHARE_COPIED_DURATION,
          );
        }
      });
    }
  }

  async openComments(data) {
    this.toggleComments(true);
    this.commentList.innerHTML = "";
    this.commentLoader.style.display = "flex";
    this.commentCountEl.innerText = `${formatNumber(data.num_comments)} comments`;

    try {
      const [, commentData] = await this.api.fetchComments(data.permalink);
      const comments = Array.isArray(commentData?.data?.children)
        ? commentData.data.children.map((c) => c.data)
        : [];
      const commentHtml = this.renderCommentTree(comments, 0, data.author);
      this.commentList.innerHTML = commentHtml || `
        <div class="comment-state">
          <i class="bi bi-chat-square-text"></i>
          <strong>No comments yet</strong>
          <span>There are no visible comments for this post.</span>
        </div>`;
      this.setupCommentMedia();
      this.setupCommentInteractions();
    } catch (e) {
      console.error("Failed to fetch comments:", e);
      this.commentList.innerHTML = `
        <div class="comment-state comment-state-error">
          <i class="bi bi-exclamation-triangle"></i>
          <strong>Failed to load comments</strong>
          <span>Try opening the comments again in a moment.</span>
        </div>`;
    } finally {
      this.commentLoader.style.display = "none";
    }
  }

  renderCommentTree(comments, depth = 0, postAuthor = "") {
    if (depth >= MAX_COMMENT_DEPTH) return "";
    return this._filterComments(comments)
      .map((c, index) => {
        const commentId = sanitizeText(c.id || `comment-${depth}-${index}`);
        const author = sanitizeText(c.author || "deleted");
        const score = formatNumber(c.score ?? 0);
        const created = timeAgo(c.created_utc);
        const replies = c.replies?.data
          ? this.renderCommentTree(c.replies.data.children.map((r) => r.data), depth + 1, postAuthor)
          : "";

        const isOp = postAuthor && c.author === postAuthor;
        const opBadgeHtml = isOp ? `<span class="comment-op-badge" title="Original Poster">OP</span>` : "";

        return `
      <div class="comment-item" data-comment-id="${commentId}" data-depth="${depth}">
        <div class="comment-thread-line" aria-hidden="true"></div>
        <div class="comment-card${isOp ? ' is-op' : ''}">
          <div class="comment-item-header" data-collapse-target="${commentId}" role="button" tabindex="0" aria-expanded="true" aria-controls="comment-content-${commentId}">
            <div class="comment-meta">
              <span class="comment-author">u/${author}</span>
              ${opBadgeHtml}
              <span class="comment-score"><i class="bi bi-arrow-up"></i> ${score}</span>
              ${created ? `<span class="comment-time">${created}</span>` : ""}
            </div>
            <button class="comment-collapse-btn" aria-label="Toggle comment" aria-expanded="true"><i class="bi bi-chevron-up"></i></button>
          </div>
          <div class="comment-content" id="comment-content-${commentId}">
            <div class="comment-body">${parseMarkdown(c.body)}</div>
            ${this.renderCommentMedia(c)}
            ${replies ? `<div class="comment-replies">${replies}</div>` : ""}
          </div>
        </div>
      </div>
    `;
      })
      .join("");
  }

  renderCommentMedia(comment) {
    if (comment.media_metadata) {
      const mediaHtml = Object.values(comment.media_metadata)
        .filter((item) => item.status === "valid")
        .map((item) => {
          if (item.e === "Image") {
            const src = safeUrl(this._decodeHtmlEntities(item.s.u || item.s.gif || ""));
            if (!src) return "";
            return `<div class="comment-media">
              <img src="${sanitizeText(src)}" loading="lazy" referrerpolicy="no-referrer" alt="Comment media">
            </div>`;
          } else if (item.e === "AnimatedImage") {
            const src = safeUrl(this._decodeHtmlEntities(item.s.mp4 || item.s.gif || ""));
            const poster = safeUrl(this._decodeHtmlEntities(item.s.gif || item.s.u || ""));
            if (!src) return "";
            if (/\.mp4($|\?)/i.test(src)) {
              return `<div class="comment-media">
                <video controls loop playsinline preload="metadata" referrerpolicy="no-referrer" src="${sanitizeText(src)}" poster="${sanitizeText(poster)}"></video>
              </div>`;
            } else {
              return `<div class="comment-media">
                <img src="${sanitizeText(src)}" loading="lazy" referrerpolicy="no-referrer" alt="Comment media">
              </div>`;
            }
          }
          return "";
        })
        .join("");

      if (mediaHtml) return mediaHtml;
    }

    const processed = this.processContent(comment);
    if (!processed) return "";

    if (processed.type === "video") {
      const poster = sanitizeText(processed.poster || "");
      const fallback = sanitizeText(safeUrl(processed.source || ""));
      const hlsSource = sanitizeText(safeUrl(processed.hlsSource || ""));
      const sources = processed.sources
        .map(
          (s) =>
            `<source src="${sanitizeText(safeUrl(s.src || ""))}" type="${sanitizeText(s.type)}">`,
        )
        .join("");

      return `<div class="comment-media">
        <video controls loop playsinline preload="metadata" referrerpolicy="no-referrer" poster="${poster}" data-hls-source="${hlsSource}" data-fallback="${fallback}">
          ${sources}
        </video>
      </div>`;
    }

    if (processed.type === "image") {
      return `<div class="comment-media">
        <img src="${sanitizeText(safeUrl(processed.source || ""))}" loading="lazy" referrerpolicy="no-referrer" alt="Comment media">
      </div>`;
    }

    if (processed.type === "gallery") {
      return `<div class="comment-media comment-gallery">
        ${this.renderGalleryContent(comment, processed)}
      </div>`;
    }

    if (processed.type === "embed") {
      return `<div class="comment-media comment-embed">
        ${processed.html}
      </div>`;
    }

    return "";
  }

  setupCommentMedia() {
    this.commentList
      .querySelectorAll(".comment-media .gallery-carousel")
      .forEach((gallery) => this.setupGallery(gallery));

    this.commentList.querySelectorAll("video").forEach((video) => {
      video.muted = this.globalMuted;
      video.volume = this.globalVolume;

      video.addEventListener("volumechange", () => {
        if (video.dataset.blockSync) return;
        if (video.muted !== this.globalMuted || video.volume !== this.globalVolume) {
          this.syncVideoVolume(video);
        }
      });
    });

    this.commentList.querySelectorAll("video[data-hls-source]").forEach((video) => {
      const hlsUrl = video.dataset.hlsSource;
      if (!hlsUrl) {
        if (video.dataset.fallback && !video.querySelector("source")) {
          video.src = video.dataset.fallback;
        }
        return;
      }

      if (!Hls.isSupported()) {
        video.src = hlsUrl;
        return;
      }

      const hls = new Hls(HLS_CONFIG);
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) {
          hls.destroy();
          if (video.dataset.fallback) video.src = video.dataset.fallback;
        }
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      video._hls = hls;
    });
  }

  setupCommentInteractions() {
    this.commentList.querySelectorAll('.comment-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // Prevent toggle if clicking links or interactive elements inside
        if (e.target.closest('a, button:not(.comment-collapse-btn)')) return;
        this.toggleCommentCollapse(header);
      });

      header.addEventListener('keydown', (e) => {
        if (e.target.closest('button')) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this.toggleCommentCollapse(header);
      });
    });
  }

  toggleCommentCollapse(header) {
    const id = header.dataset.collapseTarget;
    const content = document.getElementById(`comment-content-${id}`);
    const icon = header.querySelector('.comment-collapse-btn i');
    const btn = header.querySelector('.comment-collapse-btn');
    if (!content) return;

    content.classList.toggle('collapsed');
    const isExpanded = !content.classList.contains('collapsed');
    header.classList.toggle('collapsed', !isExpanded);
    header.setAttribute('aria-expanded', String(isExpanded));
    if (btn) btn.setAttribute('aria-expanded', String(isExpanded));
    if (icon) icon.className = isExpanded ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
  }

  formatNumber(num) {
    return formatNumber(num);
  }

  extractRedgifsId(url) {
    return extractRedgifsId(url);
  }

  parseMarkdown(text) {
    return parseMarkdown(text);
  }

  toggleComments(show) {
    if (show) this.commentSheet.classList.add("active");
    else this.commentSheet.classList.remove("active");
  }

  initAccent() {
    const saved = localStorage.getItem("rscroller_accent") || "green";
    document.documentElement.setAttribute("data-accent", saved);
  }

  setupAccentToggle() {
    const closePopover = (target) => {
      if (target !== this.accentToggle && !this.accentPopover.contains(target)) {
        this.accentPopover.classList.remove("open");
        this.accentToggle.setAttribute("aria-expanded", "false");
      }
    };

    this.accentToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = this.accentPopover.classList.contains("open");
      this.accentPopover.classList.toggle("open");
      this.accentToggle.setAttribute("aria-expanded", String(!isOpen));
    });

    this.accentPopover.querySelectorAll(".accent-swatch").forEach((swatch) => {
      swatch.addEventListener("click", () => {
        const accent = swatch.dataset.accent;
        document.documentElement.setAttribute("data-accent", accent);
        localStorage.setItem("rscroller_accent", accent);
        this.accentPopover.querySelectorAll(".accent-swatch").forEach((s) => {
          s.classList.toggle("active", s === swatch);
          s.setAttribute("aria-checked", String(s === swatch));
        });
      });
    });

    document.addEventListener("click", (e) => closePopover(e.target));
    document.addEventListener("focusin", (e) => closePopover(e.target));
  }

  _decodeHtmlEntities(text) {
    const amp = String.fromCharCode(38);
    const lt = String.fromCharCode(60);
    const gt = String.fromCharCode(62);
    return text
      .replace(new RegExp(amp + "amp;", "g"), amp)
      .replace(new RegExp(amp + "lt;", "g"), lt)
      .replace(new RegExp(amp + "gt;", "g"), gt);
  }

  processContent(data) {
    const redditVideo =
      data.media?.reddit_video || data.preview?.reddit_video_preview;
    const isRedgifs = /redgifs\.com/.test(data.domain + data.url);
    const decodedUrl = this._decodeHtmlEntities(data.url || "");

    const poster = this._decodeHtmlEntities(
      data.preview?.images?.[0]?.source?.url || "",
    ) || data.thumbnail;

    const resolutions = data.preview?.images?.[0]?.resolutions;
    let gridThumb = poster;
    if (resolutions && resolutions.length > 0) {
      const opt = resolutions.find((r) => r.width >= 400) || resolutions[resolutions.length - 1];
      gridThumb = this._decodeHtmlEntities(opt.url);
    }

    const videoFromMp4 = (source, videoPoster = poster) => {
      const mp4Source = this._decodeHtmlEntities(source || "");
      if (!mp4Source) return null;
      return {
        type: "video",
        poster: safeUrl(videoPoster),
        gridThumb: safeUrl(gridThumb),
        hlsSource: null,
        source: safeUrl(mp4Source),
        sources: [{ src: safeUrl(mp4Source), type: "video/mp4" }],
      };
    };

    const getHighQualityRedditVideo = (fallbackUrl) => {
      const decodedFallback = this._decodeHtmlEntities(fallbackUrl || "");
      const match = decodedFallback.match(/v\.redd\.it\/([^/?#]+)/i);
      return match ? `https://v.redd.it/${match[1]}/DASH_1080.mp4` : "";
    };

    if (isRedgifs) {
      const result =
        buildRedgifsResult(data.media?.oembed?.thumbnail_url) ||
        buildRedgifsResult(data.url);
      if (result) return result;
    }

    if (redditVideo) {
      const fallbackSource = this._decodeHtmlEntities(redditVideo.fallback_url || "");
      const highQualitySource = getHighQualityRedditVideo(fallbackSource);
      return {
        type: "video",
        poster: safeUrl(poster),
        gridThumb: safeUrl(gridThumb),
        width: redditVideo.width || 0,
        height: redditVideo.height || 0,
        hlsSource: safeUrl(this._decodeHtmlEntities(redditVideo.hls_url || "")),
        source: safeUrl(highQualitySource || fallbackSource),
        fallbackSource: safeUrl(fallbackSource),
        sources: highQualitySource
          ? [{ src: safeUrl(highQualitySource), type: "video/mp4" }]
          : [],
      };
    }

    if (/\.gifv($|\?)/i.test(decodedUrl)) {
      return videoFromMp4(decodedUrl.replace(/\.gifv(?=$|\?)/i, ".mp4"));
    }

    if (data.is_gallery && data.gallery_data && data.media_metadata) {
      const images = data.gallery_data.items
        .map((item) => {
          const meta = data.media_metadata[item.media_id];
          if (!meta?.s) return null;

          const isAnimated = meta.e === "AnimatedImage";
          const source = this._decodeHtmlEntities(
            (isAnimated ? meta.s.mp4 || meta.s.gif || meta.s.u : meta.s.u) || "",
          );
          if (!source) return null;

          const posterSource = this._decodeHtmlEntities(
            meta.s.u || meta.p?.at(-1)?.u || source || "",
          );

          let itemGridThumb = posterSource;
          if (meta.p && meta.p.length > 0) {
            const opt = meta.p.find((p) => p.x >= 400) || meta.p[meta.p.length - 1];
            itemGridThumb = this._decodeHtmlEntities(opt.u);
          }

          const safeSource = safeUrl(source);
          if (!safeSource) return null;

          return {
            source: safeSource,
            poster: safeUrl(posterSource),
            gridThumb: safeUrl(itemGridThumb),
            width: meta.s.x || 0,
            height: meta.s.y || 0,
            type: isAnimated && /\.mp4($|\?)/i.test(source) ? "video" : "image",
          };
        })
        .filter(Boolean);

      if (images.length > 0) {
        return {
          type: "gallery",
          images,
          poster: images[0].poster || images[0].source,
          gallery_count: images.length,
          is_animated: images.some((image) => image.type === "video"),
        };
      }
    }

    const animatedGalleryItem = Object.values(data.media_metadata || {}).find(
      (item) => item?.e === "AnimatedImage" && item?.s?.mp4,
    );
    if (animatedGalleryItem) {
      return videoFromMp4(
        animatedGalleryItem.s.mp4,
        this._decodeHtmlEntities(
          animatedGalleryItem.s.u || animatedGalleryItem.p?.at(-1)?.u || poster,
        ),
      );
    }

    const mp4GifVariant = data.preview?.images?.[0]?.variants?.mp4?.source?.url;
    if (
      data.post_hint === "image" &&
      /\.gif($|\?)/i.test(decodedUrl) &&
      mp4GifVariant
    ) {
      return videoFromMp4(mp4GifVariant);
    }

    const imgMeta = data.preview?.images?.[0]?.source;
    const imgUrl = this._decodeHtmlEntities(imgMeta?.url || decodedUrl || "");
    if (imgUrl && /\.(jpg|jpeg|png|gif|webp)/i.test(imgUrl)) {
      const safeImageUrl = safeUrl(imgUrl);
      if (!safeImageUrl) return null;
      return { 
        type: "image", 
        source: safeImageUrl, 
        poster: safeImageUrl,
        gridThumb: safeUrl(gridThumb),
        width: imgMeta?.width || 0,
        height: imgMeta?.height || 0
      };
    }

    if (data.media?.oembed?.html) {
      const html = sanitizeEmbedHtml(data.media.oembed.html);
      if (!html) return null;
      return { type: "embed", html, poster: safeUrl(poster), gridThumb: safeUrl(gridThumb) };
    }

    if (data.is_self || data.selftext) {
      return {
        type: "text",
        selftext: data.selftext || "",
        selftext_html: data.selftext_html || "",
        poster: null,
        gridThumb: null
      };
    }

    return null;
  }

  initHls(name, hlsUrl) {
    const video = document.querySelector(`#content-${name} video`);
    this.initHlsForVideo(video, hlsUrl);
  }

  initHlsForVideo(video, hlsUrl) {
    if (!video || !hlsUrl || !Hls.isSupported()) {
      if (video && hlsUrl) video.src = hlsUrl;
      return;
    }
    if (video._hls) video._hls.destroy();
    const hls = new Hls(HLS_CONFIG);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (hls.levels.length > 0) hls.startLevel = hls.levels.length - 1;
    });
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) {
        hls.destroy();
        if (video.dataset.fallback) video.src = video.dataset.fallback;
      }
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    video._hls = hls;
  }

  setupVideoFallback(video) {
    video.addEventListener("error", () => {
      const hlsUrl = video.dataset.hlsSource;
      const fallback = video.dataset.fallback;
      const state = video.dataset.fallbackState || "primary";

      if (state === "primary" && hlsUrl) {
        video.dataset.fallbackState = "hls";
        this.initHlsForVideo(video, hlsUrl);
        return;
      }

      if (state !== "fallback" && fallback && video.src !== fallback) {
        video.dataset.fallbackState = "fallback";
        if (video._hls) {
          video._hls.destroy();
          video._hls = null;
        }
        video.src = fallback;
      }
    });
  }
}

const scroller = new RedditScroller();
export { RedditAPI, RedditScroller };


