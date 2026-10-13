#pragma once
// Helpers for the NSPanel Homey firmware: page table, property cache, CSV parsing.
#ifdef NSPANEL_UI_HOST_TEST  // compiled on the Mac by tests/firmware.test.ts
#include <cstdio>
#define ESP_LOGW(tag, fmt, ...) std::fprintf(stderr, fmt "\n", __VA_ARGS__)
#else
#include "esphome.h"
#endif
#include <cstdint>
#include <cstdio>
#include <map>
#include <string>
#include <utility>
#include <vector>

namespace nspanel_ui {

static const char *const TAG = "nspanel_ui";

// Page ids of the Soft dark TFT (index == Nextion page id). See tft/COMPONENTS.md.
static const char *const PAGE_NAMES[] = {"boot", "home", "moods", "climate", "calendar", "notification", "screensaver", "media", "timer"};
static const int PAGE_COUNT = sizeof(PAGE_NAMES) / sizeof(PAGE_NAMES[0]);

inline std::string page_name(int id) { return (id >= 0 && id < PAGE_COUNT) ? PAGE_NAMES[id] : "unknown"; }

inline std::vector<std::string> split_csv(const std::string &s) {
  std::vector<std::string> out;
  size_t start = 0, pos;
  while ((pos = s.find(',', start)) != std::string::npos) {
    out.push_back(s.substr(start, pos - start));
    start = pos + 1;
  }
  out.push_back(s.substr(start));
  return out;
}

inline std::string escape_txt(const std::string &v) {
  std::string o;
  for (char c : v) {
    if (c == '\n') {  // Nextion line break is the two characters \r
      o += "\\r";
      continue;
    }
    if (c == '"' || c == '\\') o += '\\';
    o += c;
  }
  return o;
}

// Key format: "<page>.<component>.<attr>", e.g. "home.time.txt", "home.chip01.vis", "home.weather.pic".
inline std::string build_command(const std::string &component, const std::string &attr, const std::string &value) {
  if (attr == "vis") return "vis " + component + "," + (value == "1" ? "1" : "0");
  if (attr == "txt") return component + ".txt=\"" + escape_txt(value) + "\"";
  return component + "." + attr + "=" + value;
}

// Remembers the last value per page/component/attr. Values for the visible page are sent
// immediately; values for other pages are replayed when that page opens (components are
// local-scope and reset on page change).
class PropCache {
 public:
  template<typename Display> void set(Display *disp, const std::string &key, const std::string &value) {
    size_t a = key.find('.');
    size_t b = key.rfind('.');
    if (a == std::string::npos || a == b) {
      ESP_LOGW(TAG, "Bad key '%s'", key.c_str());
      return;
    }
    std::string page = key.substr(0, a);
    std::string comp_attr = key.substr(a + 1);
    // No "unchanged" check: the app already de-duplicates, and the panel may have changed the value
    // itself (tile flipped on touch, target tapped), so an explicit resend must always reach it.
    by_page_[page][comp_attr] = value;
    if (page_name(current_page_) == page) send_(disp, comp_attr, value);
  }

  template<typename Display> void on_page(Display *disp, int page_id) {
    current_page_ = page_id;
    auto it = by_page_.find(page_name(page_id));
    if (it == by_page_.end()) return;
    for (auto &kv : it->second) send_(disp, kv.first, kv.second);
  }

  std::string current_page_name() const { return page_name(current_page_); }

 private:
  template<typename Display> void send_(Display *disp, const std::string &comp_attr, const std::string &value) {
    size_t d = comp_attr.rfind('.');
    disp->send_command(build_command(comp_attr.substr(0, d), comp_attr.substr(d + 1), value).c_str());
  }
  std::map<std::string, std::map<std::string, std::string>> by_page_;
  int current_page_ = 0;
};

inline PropCache &cache() {
  static PropCache c;
  return c;
}

// ---------------------------------------------------------------- kitchen timer
// Runs entirely on the ESP so it keeps working when Homey is unreachable. Times are millis().
struct TimerLabels {  // localized by the app via the timer_labels action; English until then
  std::string running = "running · ready at", paused = "paused", done = "Done!";
  std::string start = "Start", pause = "Pause", resume = "Resume", stop = "Stop", reset = "Reset";
  std::string home_prefix = "Timer";
};

struct TimerState {
  enum Mode { IDLE = 0, RUNNING = 1, PAUSED = 2, DONE = 3 };
  Mode mode = IDLE;
  uint32_t remaining_ms = 0;  // IDLE / PAUSED
  uint32_t end_ms = 0;        // RUNNING

  static constexpr uint32_t MAX_MS = 99u * 60u * 1000u + 59u * 1000u;

  uint32_t remaining(uint32_t now) const {
    if (mode == RUNNING) return end_ms > now ? end_ms - now : 0;
    if (mode == DONE) return 0;
    return remaining_ms;
  }
  // +N seconds; on a stopped timer this also starts it (one tap in the kitchen).
  void add(uint32_t secs, uint32_t now) {
    if (mode == DONE) reset();
    if (mode == RUNNING) {
      end_ms = now + clamp_(remaining(now) + secs * 1000u);
    } else {
      remaining_ms = clamp_(remaining_ms + secs * 1000u);
      if (mode == IDLE) start_(now);
    }
  }
  // The big button: start / pause / resume / stop the alarm.
  void act(uint32_t now) {
    switch (mode) {
      case RUNNING: remaining_ms = remaining(now); mode = PAUSED; break;
      case PAUSED: start_(now); break;
      case IDLE: if (remaining_ms > 0) start_(now); break;
      case DONE: reset(); break;
    }
  }
  void set(uint32_t secs, bool start, uint32_t now) {
    reset();
    remaining_ms = clamp_(secs * 1000u);
    if (start && remaining_ms > 0) start_(now);
  }
  void reset() { mode = IDLE; remaining_ms = 0; end_ms = 0; }
  // True exactly once, at the moment the timer runs out.
  bool tick(uint32_t now) {
    if (mode != RUNNING || now < end_ms) return false;
    mode = DONE;
    remaining_ms = 0;
    return true;
  }

 private:
  void start_(uint32_t now) { end_ms = now + remaining_ms; mode = RUNNING; }
  static uint32_t clamp_(uint32_t ms) { return ms > MAX_MS ? MAX_MS : ms; }
};

inline std::string mmss(uint32_t ms) {
  uint32_t s = (ms + 999) / 1000;  // round up, so a fresh 5-minute timer shows 05:00 and 00:00 only at the end
  char buf[8];
  std::snprintf(buf, sizeof(buf), "%02u:%02u", (unsigned) (s / 60), (unsigned) (s % 60));
  return buf;
}

// Panel properties for the timer page and the home timer line. end_hhmm: wall-clock end time ("13:47").
inline std::vector<std::pair<std::string, std::string>> timer_props(const TimerState &t, uint32_t now, const std::string &end_hhmm,
                                                                     const TimerLabels &l) {
  std::string remain = mmss(t.remaining(now));
  std::string status, act = l.start, home;
  switch (t.mode) {
    case TimerState::RUNNING: status = l.running + " " + end_hhmm; act = l.pause; home = l.home_prefix + " " + remain; break;
    case TimerState::PAUSED: status = l.paused; act = l.resume; home = l.home_prefix + " " + remain; break;
    case TimerState::DONE: status = l.done; act = l.stop; home = l.done; break;
    case TimerState::IDLE: if (t.remaining_ms > 0) home = l.home_prefix + " " + remain; break;
  }
  return {{"timer.remain.txt", remain}, {"timer.status.txt", status}, {"timer.act_lbl.txt", act}, {"timer.rst_lbl.txt", l.reset}, {"home.tmr.txt", home}};
}

inline TimerState &timer() {
  static TimerState t;
  return t;
}
inline TimerLabels &timer_labels() {
  static TimerLabels l;
  return l;
}

// ---------------------------------------------------------------- cover art
// Rectangles from the app ("x,y,w,h,color"), kept so the cover can be redrawn when the media page reopens.
class CoverCache {
 public:
  void begin(const std::string &id) { id_ = id; rects_.clear(); }
  void clear() { begin(""); }
  // false for strips of an older cover (the app switched track mid-transfer) or malformed input.
  bool add(const std::string &id, const std::string &strip) {
    if (id.empty() || id != id_) return false;
    unsigned x, y, w, h, c;
    if (std::sscanf(strip.c_str(), "%u,%u,%u,%u,%u", &x, &y, &w, &h, &c) != 5) return false;
    rects_.push_back({(uint16_t) x, (uint16_t) y, (uint16_t) w, (uint16_t) h, (uint16_t) c});
    return true;
  }
  template<typename Display> void draw(Display *disp) const {
    char buf[40];
    for (auto &r : rects_) {
      std::snprintf(buf, sizeof(buf), "fill %u,%u,%u,%u,%u", r.x, r.y, r.w, r.h, r.c);
      disp->send_command(buf);
    }
  }
  template<typename Display> void draw_last(Display *disp, size_t n) const {
    char buf[40];
    for (size_t i = rects_.size() > n ? rects_.size() - n : 0; i < rects_.size(); i++) {
      auto &r = rects_[i];
      std::snprintf(buf, sizeof(buf), "fill %u,%u,%u,%u,%u", r.x, r.y, r.w, r.h, r.c);
      disp->send_command(buf);
    }
  }
  size_t size() const { return rects_.size(); }
  const std::string &id() const { return id_; }

 private:
  struct Rect { uint16_t x, y, w, h, c; };
  std::string id_;
  std::vector<Rect> rects_;
};

inline CoverCache &cover() {
  static CoverCache c;
  return c;
}

}  // namespace nspanel_ui
