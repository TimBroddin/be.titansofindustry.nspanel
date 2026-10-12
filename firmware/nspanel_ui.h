#pragma once
// Helpers for the NSPanel Homey firmware: page table, property cache, CSV parsing.
#include "esphome.h"
#include <map>
#include <string>
#include <vector>

namespace nspanel_ui {

static const char *const TAG = "nspanel_ui";

// Page ids of the Soft dark TFT (index == Nextion page id). See tft/COMPONENTS.md.
static const char *const PAGE_NAMES[] = {"boot", "home", "moods", "climate", "calendar", "notification", "screensaver"};
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
// immediately; values for other pages are replayed when that page opens (Blackymas
// components are local-scope and reset on page change).
class PropCache {
 public:
  void set(esphome::nextion::Nextion *disp, const std::string &key, const std::string &value) {
    size_t a = key.find('.');
    size_t b = key.rfind('.');
    if (a == std::string::npos || a == b) {
      ESP_LOGW(TAG, "Bad key '%s'", key.c_str());
      return;
    }
    std::string page = key.substr(0, a);
    std::string comp_attr = key.substr(a + 1);
    auto &props = by_page_[page];
    auto it = props.find(comp_attr);
    if (it != props.end() && it->second == value) return;
    props[comp_attr] = value;
    if (page_name(current_page_) == page) send_(disp, comp_attr, value);
  }

  void on_page(esphome::nextion::Nextion *disp, int page_id) {
    current_page_ = page_id;
    auto it = by_page_.find(page_name(page_id));
    if (it == by_page_.end()) return;
    for (auto &kv : it->second) send_(disp, kv.first, kv.second);
  }

 private:
  void send_(esphome::nextion::Nextion *disp, const std::string &comp_attr, const std::string &value) {
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

}  // namespace nspanel_ui
