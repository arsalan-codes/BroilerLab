# شبیه‌سازی دستگاه پایش مصرف خوراک طیور — Ross 308، روز ۱۵ تا ۶۰

**خروجی:** داده‌های خام سطح دستگاه (RFID + دو لودسل) برای ۶ پن با ۳/۵/۷/۸/۱۰/۱۲ پرنده،
به‌همراه اعتبارسنجی در برابر جداول رسمی Aviagen.

## ۱) معماری دستگاه شبیه‌سازی‌شده

- **لودسل شماره ۱:** وزن پرنده روی سکو هنگام حضور در ایستگاه؛ خروجی `raw_weight_g` (نویز σ=4g) و `weight_g` (فیلتر EMA، مطابق نمونه شما که raw≈1243 و filtered≈1238 بود).
- **لودسل شماره ۲:** مخزن خوراک ۲۵kg زیر سوراخ تغذیه؛ کاهش لحظه‌ای جرم مخزن = مصرف؛ پرش شارژ خودکار وقتی مخزن به آستانه 3kg رسید (`feed_bin_kg`).
- **RFID بال:** شناسایی `bird_id` در ورود؛ ۰٫۴٪ ردیف‌ها بدون ID (خطای خوانش)، ۲٪ RSSI ضعیف (−85 تا −90dBm)، میانگین RSSI ≈ −65dBm — سازگار با دقت گزارش‌شده سیستم‌های UHF-RFID واقعی روی آخور (92.5–99٪)[7].
- **ردیف داده دقیقاً با schema شما:**
  `timestamp,flock_id,bird_id,sensor_id,age_day,raw_weight_g,weight_g,feed_bin_kg,feed_delta_g,temp_c,humidity,rssi`

## ۲) مبانی علمی مدل

| مؤلفه | منبع و نحوه استفاده |
|---|---|
| وزن روزانه هدف | جدول‌های رسمی Performance Objectives Ross 308 (as-hatched + نر/ماده، د۰–۷۰)[3] |
| شکل پیوسته رشد | گومپرتز Wt=Wm·e^(−e^(−b(t−t*))) با پارامترهای Marcato 2008 (نر: 6628g/0.042/39.19d، ماده: 4658g/0.0468/34.41d)[2] — برای توزیع بین‌روزهای PO استفاده شد؛ تطابق نهایی مستقیماً به PO قفل شد |
| مصرف خوراک روزانه | ستون Daily intake همان booklet رسمی[3] |
| وعده‌ها | تعداد بازدید با سن کاهش (شیب −2.21 بازدید/روز در بازه d20–30)[5]؛ مدت هر وعده افزایش (≈+2.19s/روز)[5]؛ اکثر رویدادها <60s و پیک صبح/عصر[8]؛ هر بازدید 1.3–2min[7] |
| محیط | دما بر اساس جدول وزن-دمای هندبوک 2025 (از 30°C تا 20°C بعد از 27 روزگی)[1]؛ نور 18L:6D بعد از هفته اول[1]؛ RH 45–70% |
| اثر اندازه گروه | جهت‌گیری از Erensoy 2022 (وزن/بهره‌وری گروه‌های کوچک‌تر بهتر یا مساوی)[6]؛ دامنه کوچک چون پن‌های ۳–۱۲تایی آزمایشگاهی‌اند |

## ۳) نتایج اعتبارسنجی

- **انحراف میانگین وزن از PO رسمی در تمام ۴۶ روز: MAE = 0.79٪** (بازه −0.0٪ تا +1.8٪)
- **مصرف روزانه/پرنده:** انحراف معمولاً <4٪ از PO [unverified]
- **FCR پنجره‌ای d15–60 (PO):** 2.254 — شبیه‌سازی پن‌ها: 2.16 تا 2.39 (پراکندگی طبیعی ترکیب جنسیتی و اندازه گروه) [unverified]
- **وعده‌ها:** میانگین ≈58 بازدید/پرنده/روز (p5–p95: 29–96)، منطبق بر روند نزولی با سن[5]
- **اشباع ایستگاه:** پن ۳تایی ۲۷٪ → پن ۱۰تایی ۸۳٪ → پن ۱۲تایی ۱۰۸٪ (ساعت‌های پیک) ⇒ یافته طراحی: **یک سوراخ تغذیه برای پن ۱۲تایی در ساعات پیک گلوگاه است** و باعث صف/ازدحام می‌شود؛ برای پن‌های ≥10 پیشنهاد دو ایستگاه.
- تلفات: ~۰٫۰۸٪/روز از d21 (تجمعی ≈۳٪ تا d60) [unverified]

## ۴) فایل‌های تحویلی

| فایل | محتوا |
|---|---|
| `output/sensor_data.csv` | ۳۶۴٬۲۹۳ ردیف خام دستگاه (schema شما) |
| `output/daily_summary.csv` | جمع روزانه هر پن: BW میانگین، FI، تعداد وعده، اشباع ایستگاه، شارژ مخزن |
| `output/ross308_po_reference.csv` | جدول مرجع رسمی PO (as-hatched/نر/ماده) استخراج‌شده از PDF Aviagen |
| `output/chart_growth.png` | منحنی رشد شبیه‌سازی vs PO + باند نر-ماده |
| `output/chart_intake.png` | مصرف روزانه vs PO |
| `output/chart_fcr_by_pen.png` | FCR پنجره‌ای به تفکیک اندازه پن |
| `output/chart_diurnal.png` | الگوی شبانه‌روزی خوراک‌خوری (پیک صبح/عصر) |
| `simulator.py` | کد کامل قابل‌تکرار (seed ثابت 308) |

## ۵) محدودیت‌ها (شفاف)

1. اثر اندازه گروه در محدوده ۳–۱۲ پرنده در ادبیات غالباً غیرمعنی‌دار است[6]؛ ضرایب اعمال‌شده کوچک و جهت‌دار هستند، نه قطعی.
2. PO کتاب 2007 است؛ نسخه‌های جدیدتر اهداف کمی متفاوت دارند (روند یکسان).
3. رفتار صف‌کشی در اشباع، مدل ساده‌شده «انتظار ≤90s یا صرف‌نظر» است.

## Sources

[1] https://aviagen.com/assets/Tech_Center/Ross_Broiler/Aviagen-ROSS-Broiler-Handbook-EN.pdf — Aviagen Ross Broiler Management Handbook (2025)
    > "After 27 days of age, the temperature should remain at 20°C (68.0°F) or be"
    > "chicks should have 23 hours light and 1 hour dark from the first day, and gradually reduced to 4–6 hours of darkness by 7 days"
    > "After 7 days: dark period of 4–6 hours."
[2] https://scielo.br/j/rbca/a/9PMj7Cz8v88dWmy58mbXdhR?format=html&lang=en — Marcato et al. 2008 - Growth and body nutrient deposition of two broiler commercial genetic lines (Ross/Cobb Gompertz)
    > "indicate that the Gompertz function is the one that best describes them"
    > "Ross 6627,84 A 4657,74 B 0,042 B 0,0468 Ab 39,19 A 34,41 Ba"
[3] https://www.elsitioavicola.com/downloads/download/90 — Ross 308 Broiler Performance Objectives (Aviagen, June 2007) - mirror PDF
    > "15 506 51 73 596 1.178"
    > "42 2652 90 90.14 210 4644 1.751"
    > "performance achievable under good management and environmental conditions"
[5] https://edepot.wur.nl/691892 — van der Sluis et al. 2025 - Feeding behaviour patterns in relation to body weight and gait in broilers (Poultry Science 104:105103)
    > "The NFV decreased as the birds grew older"
    > "Age (d) 83.102 <0.001 −2.212 0.243 <0.001"
    > "Age (d) 33.411 <0.001 2.192 0.379 <0.001"
    > "14 596 (±52)"
[6] https://pmc.ncbi.nlm.nih.gov/articles/PMC9097258 — Erensoy et al. 2022 - Effects of varying group sizes on performance, body defects, and productivity in broiler chickens (Arch Anim Breed 65:171)
    > "Feed efficiency worsened with larger group size, while smaller flock size increases livability"
    > "reached BWs of 2561.4, 2654.3, 2736.4, and 2661.4 g at 39.6 d of mean slaughter age"
[7] https://www.cambridge.org/core/journals/animal/article/an-ultrahigh-frequency-radio-frequency-identification-system-for-studying-individual-feeding-and-drinking-behaviors-of-grouphoused-broilers/4C4681033E3D74C4AA86B71C8E5D5A02 — Li et al. 2018 - UHF-RFID system for individual feeding/drinking behaviors of group-housed broilers (animal)
    > "The accuracies of the UHF-RFID system for determining IBN and TS were 92.5±4.2% and 99.0±1.2% for the feeder"
    > "1.3 to 2.0 min for single feeder visit registered by the UHF-RFID system"
[8] https://pubmed.ncbi.nlm.nih.gov/33662663 — Li et al. 2021 - Effects of feeder space on broiler feeding behaviors (Poult Sci)
    > "Broilers stayed at the feeder for less than 60 s in most of the feeding events and increased their feeding behaviors after the lights ON and before the lights OFF"
    > "For most of the time, less than 6 broilers chose to eat simultaneously at a feeder."
