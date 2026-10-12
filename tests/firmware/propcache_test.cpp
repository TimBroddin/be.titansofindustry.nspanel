// Host test for firmware/nspanel_ui.h. Prints one line per sent Nextion command.
#define NSPANEL_UI_HOST_TEST
#include "../../firmware/nspanel_ui.h"
#include <iostream>

struct FakeDisplay {
  void send_command(const char *cmd) { std::cout << cmd << "\n"; }
};

int main() {
  FakeDisplay d;
  auto &c = nspanel_ui::cache();
  c.on_page(&d, 2);                                   // moods visible
  std::cout << "--set\n";
  c.set(&d, "moods.i01.picc", "3");
  std::cout << "--same value again (panel flipped it locally)\n";
  c.set(&d, "moods.i01.picc", "3");
  std::cout << "--other page\n";
  c.set(&d, "home.date.txt", "ma 12 \"okt\"\nx");
  std::cout << "--open home\n";
  c.on_page(&d, 1);
  return 0;
}
