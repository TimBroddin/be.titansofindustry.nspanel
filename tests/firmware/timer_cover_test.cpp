// Host test for the timer state machine and cover cache in firmware/nspanel_ui.h.
#define NSPANEL_UI_HOST_TEST
#include "../../firmware/nspanel_ui.h"
#include <iostream>

struct FakeDisplay {
  void send_command(const char *cmd) { std::cout << cmd << "\n"; }
};

static void props(const nspanel_ui::TimerState &t, uint32_t now, const char *end) {
  for (auto &kv : nspanel_ui::timer_props(t, now, end, nspanel_ui::TimerLabels())) std::cout << kv.first << "=" << kv.second << "\n";
}

int main() {
  using nspanel_ui::TimerState;
  TimerState t;
  std::cout << "--idle\n";
  props(t, 0, "");
  std::cout << "--add 5 min at t=0 starts it\n";
  t.add(300, 0);
  props(t, 1000, "13:47");
  std::cout << "--pause at 61s, add 60 while paused\n";
  t.act(61000);
  t.add(60, 62000);
  props(t, 70000, "");
  std::cout << "--resume at 100s, finishes at 399s\n";
  t.act(100000);
  std::cout << "tick 398999: " << t.tick(398999) << "\n";
  std::cout << "tick 399000: " << t.tick(399000) << "\n";
  std::cout << "tick 400000: " << t.tick(400000) << "\n";
  props(t, 400000, "");
  std::cout << "--stop\n";
  t.act(401000);
  props(t, 401000, "");
  std::cout << "--set 90s without start, then reset\n";
  t.set(90, false, 0);
  props(t, 0, "");
  t.reset();
  std::cout << "mode " << t.mode << "\n";

  std::cout << "--cover\n";
  FakeDisplay d;
  auto pump = [&](size_t n) { size_t k = nspanel_ui::cover().pump(&d, n); std::cout << "pump " << k << "\n"; };
  auto &cover = nspanel_ui::cover();  // ~20 KB: the firmware's function-static instance  // ~20 KB: keep it off the stack, as in the firmware
  cover.begin("a");
  std::cout << cover.add("a", "20,62,96,1,65535") << cover.add("b", "1,1,1,1,0") << cover.add("a", "bad") << cover.add("a", "21,63,4,2,31") << "\n";
  pump(1);
  pump(5);
  pump(5);
  std::cout << "--page shown again: redraw from the start\n";
  cover.restart();
  pump(5);
  std::cout << "--cap\n";
  cover.begin("big");
  size_t ok = 0;
  for (size_t i = 0; i < nspanel_ui::COVER_MAX_RECTS + 5; i++) ok += cover.add("big", "1,1,1,1,0");
  std::cout << "accepted " << ok << " of " << nspanel_ui::COVER_MAX_RECTS + 5 << "\n";
  cover.clear();
  std::cout << "size after clear " << cover.size() << "\n";
  pump(5);
  return 0;
}
