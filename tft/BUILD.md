# Building the Soft dark TFT in Nextion Editor

Positions, sizes, fonts and colours for every component are in **`tft/COMPONENTS.md`**. This guide covers the order of work and the scripts to paste. Plan on 1.5–2 hours, mostly copy and paste.

Conventions:
- Every text field is a **Text** component with `sta` = **crop image** and `picc` = the page picture, so it shows the background behind it.
- Picture and font ids are numbers in the Editor. Wherever a script says `p_moods` and so on, these are **global variables** that you define once in `Program.s` (step 3), so the scripts never contain raw ids.
- After building, tell Claude the font ids (Fonts panel) and picture ids (Pictures panel). They go into `lib/tftIds.json`.

## 0. Prepare (once)

1. Install the 4 Inter fonts into the CrossOver bottle. Copy `tft/fonts/Inter-*.ttf` into the bottle's `C:\windows\Fonts` (CrossOver → bottle → *Open C: Drive* → `windows/Fonts`), then restart Nextion Editor.
2. Open `~/nspanel-tft/nspanel_eu.HMI` and **Save As** `~/nspanel-tft/nspanel_soft_dark.HMI`. Work only in the copy.

## 1. Remove Blackymas pages

In the **Page** panel, delete every page **except `boot`**. Keep `Program.s`. The Editor renumbers pages automatically.

## 2. Fonts

**Tools → Font Generator**, for each row below:
- *Font*: the family (Inter ExtraLight / Light / Regular / Medium)
- *Height*: the size
- *Encoding*: **utf-8**
- *Anti-aliasing*: on
- *Characters*: **Specify**, and paste the characters (for the full charset, paste the contents of `tft/fonts/charset-international.txt`)

Generate, then **add** each font to the project.

| Name to save | Family | Height | Characters |
|---|---|---|---|
| inter_clock80 | Inter ExtraLight | 80 | `0123456789: APM` |
| inter_huge84 | Inter ExtraLight | 84 | `0123456789,.°-` |
| inter_big32 | Inter Light | 32 | charset-international.txt |
| inter_body17 | Inter Regular | 17 | charset-international.txt |
| inter_small13 | Inter Regular | 13 | charset-international.txt |
| inter_title22 | Inter Medium | 22 | charset-international.txt |

**Icon fonts:** keep Blackymas' MDI icon fonts (they're already in the project). In the Fonts panel, find the MDI font closest to **24 px** (`F_ICON_S`, chips) and closest to **32 px** (`F_ICON_L`, weather and tiles). Note their ids. You may delete Blackymas' Ubuntu text fonts if nothing on `boot` uses them; check the boot components' `font` attribute first.

## 3. Pictures and `Program.s`

1. **Pictures** panel → **Add** the 8 PNGs from `tft/assets/` **in the order listed in COMPONENTS.md** (boot, home, moods, moods-on, climate, calendar, notification, screensaver).
2. Note the id of each. Then in **Program.s**, directly after the existing `int` lines, add (with the real ids):

```
int p_boot=0,p_home=0,p_moods=0,p_moods_on=0,p_climate=0,p_calendar=0,p_notification=0,p_screensaver=0
int ss_min=0,ss_dim=10,idle=0
```

3. Also in `Program.s`, change the line `page 0` at the end only if it isn't already `page 0` (boot must stay first).
4. On the **boot** page, set the page `sta` = image and `pic` = the `p_boot` id.

## 4. Add pages

Add 6 pages, **in this order**, named exactly: `home`, `moods`, `climate`, `calendar`, `notification`, `screensaver`. They must end up as ids 1–6. For each page:

- Page attributes: `sta` = image, `pic` = that page's picture id.
- Add every component from its table in COMPONENTS.md. Tips:
  - Create one Text component with `sta` crop image, `picc`, font and `pco` set, then **copy and paste** it and change only `objname`, x, y, w, h (and font or pco where they differ).
  - Set `txt_maxl`: 20 for clock and temperature fields, 60 for titles and labels, 200 for `notification.body`.
  - Set `txt` to empty. The samples in the table are only for orientation.
- Add the **Hotspots** listed for that page.
- Add a string **Variable** `csv` (`txt_maxl` 40) on `home`, `moods`, `climate` and `notification`.

## 5. Page events and touch scripts

Paste each script into the named event. `sendcsv` below is the same 6-line block every time:

```
printh 92
prints "localevent",0
printh 00
prints csv.txt,0
printh 00
printh FF FF FF
```

### All pages except boot and screensaver: Preinitialize Event
```
dim=brightness
sendme
```
`sendme` tells the firmware which page is open. Without it nothing is drawn on the page. Keep it as the **last** line of every Preinitialize Event.

### home
- **Timer** `tm_idle`: period 60000, enabled. Timer Event:
```
idle++
if(ss_min>0)
{
  if(idle>=ss_min)
  {
    page screensaver
  }
}
```
- **TouchCap** `tc`, Touch Press Event: `idle=0`
- Page Preinitialize Event: put `idle=0` **before** `dim=brightness` / `sendme`
- Hotspot touch release events:
  - `NAV_MOODS`: `page moods`
  - `NAV_CLIMATE`: `page climate`
  - `NAV_CALENDAR`: `page calendar`

### moods, climate, calendar
- **Timer** `tm_back`: period 60000, enabled. Timer Event: `page home`
- **TouchCap** `tc`, Touch Press Event:
```
tm_back.en=0
tm_back.en=1
```
- Hotspot `go_home`, `GOTO_HOME`: `page home`

### moods: `TILE_NN` (Touch Release Event of both `iNN` and `lNN`)
For tile 01 (repeat for 02–08, changing the two names and the number in `csv.txt`):
```
if(i01.picc==p_moods)
{
  i01.picc=p_moods_on
  l01.picc=p_moods_on
}else
{
  i01.picc=p_moods
  l01.picc=p_moods
}
csv.txt="moods,tile,1"
sendcsv
```
(Replace `sendcsv` with the 6-line block.)

### climate
Add **Variables** (int, local): `tgt` (val 200), `tmin` (50), `tmax` (300), `tstep` (5); string `dsep` (txt `,`, maxl 2), string `tmp` (maxl 10). **Timer** `tm_send`: period 700, **disabled**.

- `TARGET_PLUS` (hotspot `plus`, Touch Release Event):
```
tgt.val+=tstep.val
if(tgt.val>tmax.val)
{
  tgt.val=tmax.val
}
click_fmt
```
- `TARGET_MINUS` (hotspot `minus`):
```
tgt.val-=tstep.val
if(tgt.val<tmin.val)
{
  tgt.val=tmin.val
}
click_fmt
```
- Replace `click_fmt` in both with:
```
sys0=tgt.val/10
sys1=tgt.val%10
covx sys0,tmp.txt,0,0
tgt_txt.txt=tmp.txt+dsep.txt
covx sys1,tmp.txt,0,0
tgt_txt.txt+=tmp.txt+"°"
tm_send.en=0
tm_send.en=1
```
- `tm_send` Timer Event:
```
tm_send.en=0
covx tgt.val,tmp.txt,0,0
csv.txt="climate,target,"+tmp.txt
sendcsv
```

### notification
- `CLOSE` (hotspot `close` and component `close_lbl`):
```
csv.txt="notification,close,"
sendcsv
page home
```

### screensaver
- Page Preinitialize Event:
```
dim=ss_dim
sendme
```
- `WAKE` (hotspot `wake`, Touch Press Event):
```
dim=brightness
page home
```

## 6. Compile and export

1. **Compile.** Expect 0 errors.
2. **File → TFT file output** → `~/nspanel-tft/nspanel_soft_dark.tft`.
3. Tell Claude. Uploading uses the Range server, 115200 baud, with the Homey app disabled during the upload.
4. Report the font ids for `inter_body17`, `inter_small13` and the two MDI fonts, plus the picture ids for `moods` and `moods-on`.

## Troubleshooting

- **Text shows boxes or garbage:** that font wasn't generated as utf-8, or the character is missing from its list.
- **Text leaves "ghost" traces:** `sta` isn't crop image, or `picc` isn't that page's picture.
- **Touch does nothing:** the script was pasted into the press event instead of the *release* event (or the other way round for TouchCap and `WAKE`).
