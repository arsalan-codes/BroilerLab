/* =====================================================================
   BroilerLab i18n — full FA / EN dictionaries + runtime switcher
   ===================================================================== */
"use strict";
const I18N={
fa:{
"bio.title":"آزمایشگاه آمار زیستی","bio.sub":"واحد نمونه = پن · Welch t / ANOVA یک‌راهه / η² / Holm",
"bio.metric":"متغیر پاسخ","bio.bw":"وزن پایان دوره (g)","bio.fi":"کل مصرف هر پرنده (g)",
"bio.fcr":"ضریب تبدیل خوراک دوره","bio.mort":"تلفات (%)",
"app.title":"آرین — سامانه هوشمند پرورش و اصلاح نژاد","brand.name":"آرین",
"app.tag":"سامانه یکپارچه هوشمند اصلاح نژاد و مدیریت پرورش جوجه‌های گوشتی",
"app.uni":"گروه علوم دامی، دانشگاه تربیت مدرس",
"hdr.strain":"سویه","hdr.lang":"زبان","hdr.mae":"میانگین قدرمطلق خطا","hdr.theme":"پوسته",
"nav.products":"محصولات و خدمات","nav.about":"درباره ما","hdr.help":"آموزش سریع",
"tour.welcomeT":"🎓 خوش آمدید — آموزش سریع ۹۰ ثانیه‌ای",
"tour.welcomeP":"آرین یک سامانه یکپارچه هوشمند اصلاح نژادی و مدیریت پرورش جوجه‌های گوشتی است که برای هر کاربر، داده‌ها را به‌صورت کاملا اختصاصی و جداگانه ذخیره می‌کند. در کمتر از دو دقیقه با کلیت سامانه آشنا می‌شوید و در هر زمان می‌توانید از بخش تنظیمات، گزینه آموزش سریع را دوباره ببینید.",
"tour.authT":"🔒 ورود و ایزوله‌سازی",
"tour.authP":"صفحه اصلی و صفحه درباره ما برای همه بازدیدکنندگان قابل مشاهده است. هفت بخش تخصصی دیگر پس از ورود به حساب کاربری فعال می‌شود و تمام اطلاعات دوره پرورش و گزارش‌های دستگاه تنها در حساب کاربری شما ذخیره خواهد شد.",
"tour.strainT":"🧬 انتخاب سویه",
"tour.strainP":"چهار سویه معتبر شامل راس ۳۰۸، کاب ۵۰۰، آربور آکرز پلاس و هوبارد در دسترس است. از منوی سویه در بخش تنظیمات می‌توانید سویه مورد نظر را انتخاب کنید. تمامی شاخص‌ها، نمودارها و میانگین قدرمطلق خطا بر اساس راهنمای رسمی همان سویه به‌صورت دقیق محاسبه می‌شود.",
"tour.settingsT":"⚙️ تنظیمات و زبان",
"tour.settingsP":"از طریق دکمه تنظیمات در نوار بالا می‌توانید سویه مورد نظر را تغییر دهید، زبان سامانه را بین فارسی و انگلیسی جابه‌جا کنید، پوسته را بین حالت تیره و روشن انتخاب نمایید، و به ساعت شمسی و میلادی و همچنین بخش آموزش سریع دسترسی داشته باشید. کلید میانبر T نیز برای تغییر پوسته در نظر گرفته شده است.",
"tour.navT":"🧭 تب‌های اصلی",
"tour.navP":"نوار پیمایش سامانه شامل نه بخش اصلی است: صفحه اصلی، داشبورد اعتبارسنجی، طرح آزمایش، نقشه پویای فارم، شبیه‌سازی زنده، سناریوها، دستگاه و داده، مبانی علمی، روش‌شناسی و درباره ما. با انتخاب هر گزینه وارد بخش مربوطه خواهید شد.",
"tour.dashT":"📊 داشبورد اعتبارسنجی",
"tour.dashP":"در داشبورد اعتبارسنجی، شاخص‌های کلیدی مانند میانگین قدرمطلق خطا، ضریب تبدیل خوراک و وزن نهایی دوره را مشاهده می‌کنید. علاوه بر آن، نمودار رشد در مقایسه با راهنمای رسمی سویه، میزان مصرف روزانه، الگوی مصرف در طول شبانه‌روز و وضعیت اشباع ایستگاه تغذیه نمایش داده می‌شود. اگر میانگین خطا کمتر از دو درصد باشد، نشان‌دهنده اعتبار بسیار بالای شبیه‌سازی است.",
"tour.expT":"🧪 طرح آزمایش",
"tour.expP":"در بخش طرح آزمایش می‌توانید جایگاه‌های پرورشی را تعریف کنید، تعداد پرنده، نوع تیمار و تعداد تکرار هر تیمار را مشخص نمایید. این طرح، مبنای نمایش نقشه فارم، انجام تحلیل‌های آماری و تهیه فایل‌های خروجی خواهد بود.",
"tour.farmT":"🗺 نقشه فارم پویا",
"tour.farmP":"نقشه پویای فارم، روند رشد را به‌صورت زمانی و متحرک نمایش می‌دهد. پرنده‌ها در جایگاه خود حرکت می‌کنند، میزان شلوغی و اشغال هر جایگاه قابل مشاهده است و با انتخاب هر پرنده می‌توانید وزن فعلی، میزان خوراک مصرفی و وضعیت سلامت آن را به‌صورت جداگانه بررسی کنید.",
"tour.simT":"📡 شبیه‌سازی زنده دستگاه",
"tour.simP":"در بخش شبیه‌سازی زنده، اطلاعات دریافتی از سامانه تشخیص هوشمند و حسگرهای وزن‌کشی را به‌صورت لحظه‌ای مشاهده می‌کنید. نمودار رشد زنده، نمودار مصرف تجمعی، جدول کامل رویدادهای تغذیه و امکان دریافت خروجی در قالب فایل متنی یا صفحه گسترده در همین بخش قرار دارد.",
"tour.scnT":"🧪 آزمایشگاه سناریو",
"tour.scnP":"در آزمایشگاه سناریو می‌توانید دو شرایط مختلف را با شرایط اولیه کاملا یکسان مقایسه کنید؛ برای مثال اثر تنش گرمایی یا افزودن ایستگاه دوم تغذیه. نتیجه به‌صورت نمودار رشد، نمودار مصرف خوراک و جدول تغییرات روزانه نمایش داده می‌شود.",
"tour.devT":"💻 دستگاه و داده",
"tour.devP":"در بخش دستگاه و داده، با معماری ارتباطی سامانه، نحوه عملکرد حسگرهای وزن‌کشی و سامانه تشخیص، منطق مدیریت صف انتظار تغذیه و ساختار دوازده‌ستونی هر رکورد آشنا می‌شوید. تمام داده‌ها به‌صورت ایمن و اختصاصی برای هر کاربر ذخیره می‌شود.",
"tour.sciT":"📚 مبانی علمی و روش‌شناسی",
"tour.sciP":"در بخش‌های مبانی علمی و روش‌شناسی می‌توانید منابع معتبر علمی، زنجیره کامل مدل‌سازی، معادلات مورد استفاده و محدودیت‌های شبیه‌سازی را با توضیحی شفاف و مستند مطالعه کنید.",
"tour.expT2":"📦 خروجی داده",
"tour.expP2":"برای دریافت داده‌ها، از دکمه خروجی در بخش شبیه‌سازی زنده یا نقشه فارم استفاده کنید. می‌توانید ستون‌های مورد نظر را انتخاب نمایید و خروجی را در قالب فایل متنی یا چند برگه صفحه گسترده دریافت کنید.",
"tour.doneT":"🎉 آماده‌اید!","tour.doneP":"پیشنهاد می‌کنیم کار را از داشبورد اعتبارسنجی آغاز کنید یا مستقیما وارد بخش طرح آزمایش شوید و جایگاه‌های پرورشی مورد نظر خود را طراحی کنید. آرزوی موفقیت داریم. برای بستن این راهنما از کلید خروج و برای جابه‌جایی بین مراحل از کلیدهای جهت‌نما استفاده کنید.",
"tour.next":"بعدی","tour.prev":"قبلی","tour.skip":"رد کردن","tour.finish":"پایان",
"ex.title":"مرکز خروجی داده","ex.back":"↩ بازگشت","ex.source":"منبع","ex.format":"قالب",
"ex.summary":"خلاصه روزانه پن‌ها","ex.device":"رکوردهای خام دستگاه",
"ex.birds":"رکورد تک‌تک پرندگان","ex.design":"طرح آزمایش","ex.po":"کاتالوگ مرجع PO",
"ex.dataset":"مجموعه‌داده","ex.generate":"تولید و دریافت",
"ex.none":"ابتدا یک شبیه‌سازی اجرا کنید تا داده‌ای برای خروجی وجود داشته باشد.",
"ex.rawSkip":"گله بزرگ — شیت داده خام رد شد.","ex.rowcap":"سقف {cap} ردیف",
"ex.ctxLive":"اجرای زنده · پن {pen} · d{a0}–{a1} · سویه {strain}",
"ex.ctxFarm":"کل فارم · {pens} پن · d{a0}–{a1} · سویه {strain}","theme.dark":"تم تیره","theme.light":"تم روشن",
"btn.resetCycle":"بازنشانی داده‌های دوره","dyn.resetArmed":"⚠️ دوباره کلیک کنید تا همه داده‌های دوره پاک شود","dyn.resetDone":"♻️ همه داده‌های دوره بازنشانی شد",
"btn.defaults":"بازگشت به پیش‌فرض","dyn.designReset":"↺ طرح آزمایش به قالب پیش‌فرض بازگشت",
"dyn.visitOk":"وعده ثبت شد","dyn.readFail":"خطای خوانش RFID","hdr.rows":"رکورد/دوره",
"nav.feedGroup":"سیستم پایش مصرف خوراک","nf.title":"صفحه پیدا نشد","nf.p":"آدرسی که وارد کرده‌اید وجود ندارد یا جابه‌جا شده است.","nf.home":"صفحه اصلی","feed.h":"سیستم پایش مصرف خوراک","feed.p":"پایش لحظه‌ای مصرف خوراک هر پرنده با حسگرهای RFID و لودسل دوگانه — از طراحی آزمایش تا اعتبارسنجی و تحلیل سناریو، تمام داده‌ها به‌صورت ایزوله در حساب شما","feed.badge":"پایش ۲۴ ساعته · داده ایزوله","feed.hero.t":"یکپارچه از مزرعه تا تحلیل","feed.hero.p":"هفت ماژول تخصصی در یک گردش کار پیوسته: اعتبارسنجی، طراحی، نقشه زنده، شبیه‌سازی، سناریو، سخت‌افزار و روش‌شناسی","feed.kpi.acc":"دقت اعتبارسنجی","feed.kpi.acc.v":"۱–۲٪","feed.kpi.acc.s":"MAE وزن در برابر کاتالوگ","feed.kpi.live":"پوشش زمانی","feed.kpi.live.v":"۲۴ ساعته","feed.kpi.live.s":"رکورد ۳-ردیفه هر وعده","feed.kpi.iso":"ایزوله کاربر","feed.kpi.iso.v":"۱۰۰٪","feed.kpi.iso.s":"هر حساب، داده اختصاصی","feed.kpi.through":"ظرفیت","feed.kpi.through.v":"۱۰k+","feed.kpi.through.s":"رکورد در هر دوره","feed.steps.t":"گردش کار","feed.steps.s1.t":"۱. طراحی","feed.steps.s1.p":"پن‌ها، تیمارها، تراکم","feed.steps.s2.t":"۲. شبیه‌سازی","feed.steps.s2.p":"موتور Weibull + صف ۹۰ثانیه","feed.steps.s3.t":"۳. پایش زنده","feed.steps.s3.p":"RFID + دو لودسل","feed.steps.s4.t":"۴. اعتبارسنجی","feed.steps.s4.p":"منحنی رشد vs کاتالوگ","feed.steps.s5.t":"۵. سناریو","feed.steps.s5.p":"تنش گرمایی / ایستگاه دوم","feed.grid.t":"هفت ماژول — یک سامانه","feed.card.dash.t":"داشبورد اعتبارسنجی","feed.card.dash.p":"مقایسه روزبه‌روز با کاتالوگ رسمی سویه، FCR پنجره‌ای و باند نر-ماده","feed.card.exp.t":"طرح آزمایش","feed.card.exp.p":"تعریف پن، تعداد، تیمار و تکرار — مبنای فارم و آمار","feed.card.farm.t":"نقشه فارم پویا","feed.card.farm.p":"پخش زمانی با پرندگان متحرک، اشغال پن و انتخاب پرنده","feed.card.sim.t":"شبیه‌سازی زنده","feed.card.sim.p":"جریان لحظه‌ای RFID/وزن، نمودار زنده و خروجی","feed.card.scn.t":"سناریوها","feed.card.scn.p":"مقایسه جفت‌شده با seed یکسان — اثر تیمار","feed.card.dev.t":"دستگاه و داده","feed.card.dev.p":"معماری سنسور، منطق صف و schema ۱۲-ستونه","feed.card.met.t":"روش‌شناسی","feed.card.met.p":"زنجیره مدل، معادلات و محدودیت‌های شفاف","feed.cta.t":"آماده پایش هستید؟","feed.cta.p":"طرح خود را بسازید یا شبیه‌سازی زنده را آغاز کنید — داده‌ها به‌صورت خودکار ذخیره می‌شود.","feed.btn.sim":"شروع شبیه‌سازی زنده","feed.btn.exp":"طراحی آزمایش","feed.go":"ورود به بخش","nav.landing":"صفحه اصلی","nav.dash":"داشبورد اعتبارسنجی","nav.exp":"طرح آزمایش","nav.farm":"نقشه فارم پویا",
"nav.sim":"شبیه‌سازی زنده","nav.scn":"سناریوها","nav.dev":"دستگاه و داده","nav.sci":"مبانی علمی",
"farm.tags":"تگ‌ها","hdr.settings":"تنظیمات","bird.tag":"تگ پرنده","bird.sex":"جنس",
"sex.m":"نر","sex.f":"ماده","bird.cv":"انحراف ژنتیکی","bird.status":"وضعیت",
"bird.alive":"زنده","bird.dead":"تلف‌شده","bird.bwNow":"وزن فعلی","bird.fiTotal":"کل مصرف خوراک","bird.back":"بازگشت به نمای پن",
"dash.h":"اعتبارسنجی","dash.h.t":"داشبورد اعتبارسنجی عملکرد","dash.p":"اجرای کامل دوره برای همه پن‌ها و مقایسه روزبه‌روز با کاتالوگ رسمی سویه فعال",
"exp.h":"طراحی آزمایش","exp.h.t":"طراح آزمایش","exp.p":"تعریف پن‌ها، تعداد پرنده و تیمارها؛ مبنای نقشه فارم، آمار زیستی و خروجی‌ها",
"farm.h":"پویانمایی","farm.h.t":"نقشه زنده فارم تحقیقاتی","farm.p":"پخش زمانی دوره پرورش با جوجه‌های متحرک قفل‌شده به وعده‌های واقعی موتور شبیه‌سازی",
"sim.h":"جریان دستگاه","sim.h.t":"شبیه‌سازی زنده دستگاه","sim.p":"پخش لحظه‌ای رکوردهای RFID و دو لودسل مطابق schema استاندارد پروژه",
"scn.h":"تحلیل سناریو","scn.h.t":"آزمایشگاه سناریو","scn.p":"مقایسه جفت‌شده با seed یکسان: تنش گرمایی یا ایستگاه دوم تغذیه",
"dev.h":"سخت‌افزار","dev.h.t":"دستگاه و ساختار داده","dev.p":"معماری سنسورها، منطق صف و قواعد schema رکورد",
"sci.h":"پایه علمی","sci.h.t":"مبانی علمی و منابع","sci.p":"منابع داوری‌شده، زنجیره مدل‌سازی و محدودیت‌های شفاف",
"farm.emptyP":"هنوز دوره‌ای ساخته نشده است. ابتدا پن‌ها و تیمارها را در طراح آزمایش تعریف کنید.",
"farm.goExp":"🧪 رفتن به طراح آزمایش",
"h.rows":"رکورد/دوره",

"dash.active":"کاتالوگ فعال:","dash.source":"سند رسمی ↗",
"kpi.bw":"وزن نهایی دوره","kpi.poTarget":"هدف کاتالوگ","kpi.dev":"انحراف",
"kpi.mae":"MAE وزن مقابل کاتالوگ","kpi.maeSub":"میانگین قدرمطلق خطا، همه پن‌ها",
"kpi.fcr":"ضریب تبدیل خوراک (FCR) دوره","kpi.ref":"مرجع کاتالوگ","kpi.visits":"وعده روزانه هر پرنده",
"ms.deaths":"تلفات تجمعی<br>(۰٫۰۸٪/روز از d۲۱)","ms.fills":"شارژ مخزن<br>(۳kg ← ۲۵kg)",
"ms.ovl":"تغذیه همزمان<br>(صرف‌نظر از صف >۹۰ ثانیه)","ms.rows":"رکورد دستگاه<br>(۳ ردیف/وعده)",
"ch.growth":"منحنی رشد — شبیه‌سازی vs کاتالوگ","ch.intake":"مصرف خوراک روزانه هر پرنده",
"ch.fcr":"ضریب تبدیل خوراک به تفکیک اندازه پن","ch.diurnal":"الگوی شبانه‌روزی خوراک‌خوری",
"ch.station":"تحلیل اشباع ایستگاه تغذیه","ch.valTable":"جدول تطبیق روزانه — sim vs کاتالوگ",
"ch.liveGrowth":"رشد زنده vs کاتالوگ","ch.liveCum":"مصرف تجمعی vs هدف",
"ch.farmGrowth":"رشد به تفکیک تیمار (±SE)","ch.farmFi":"مصرف روزانه به تفکیک تیمار",
"nav.met":"روش‌شناسی","met.abstractT":"چکیده",
"met.abstract":"آرین یک شبیه‌ساز گسسته-رویداد از ایستگاه پایش مصرف خوراک طیور است که داده‌های سطح دستگاه (RFID + دو لودسل) را با وضوح سه‌ردیفی به‌ازای هر وعده تولید می‌کند. موتور وعده‌محور آن روی کاتالوگ‌های عملکردی رسمی چهار سویه صنعتی قفل شده و فیزیک سنسورها مطابق ادبیات داوری‌شده کالیبره شده است. اعتبارسنجی در برابر جداول مرجع MAE وزن ۱–۲٪ نشان می‌دهد.",
"met.pipeline":"خط تولید داده",
"met.p1":"کاتالوگ سویه","met.p1s":"BW/FI روزانه نر و ماده",
"met.p2":"مدل فردی","met.p2s":"CV≈۵٪ + AR(1) + بلوک‌بندی",
"met.p3":"موتور وعده","met.p3s":"Weibull shares + دیورنال دوقله",
"met.p4":"فیزیک دستگاه","met.p4s":"لودسل + RFID + صف ≤۹۰s",
"met.p5":"رکورد خام","met.p5s":"۳ ردیف schema ۱۲ستونه",
"met.eqTitle":"معادلات مدل",
"met.e1":"وزن فردی = کاتالوگ × انحراف ژنتیکی × اثر پن × ضریب تنش",
"met.e2":"فرایند خودرگرسیون AR(1) برای نوسان روزانه",
"met.e3":"تعداد وعده = مصرف ÷ نرخ ÷ مدت وعده [5]",
"met.e4":"مدت وعده؛ شیب +۲٫۱۹ ثانیه/روز [5]",
"met.e5":"توزیع اندازه وعده‌ها؛ بیشتر <60 ثانیه [7][8]",
"met.e6":"مدل لودسل: نویز σ≈۴g و فیلتر میانگین متحرک نمایی",
"met.e7":"قدرت سیگنال RFID؛ ۰٫۴٪ خطا و ۲٪ ضعیف [7]",
"met.e8":"اثر تصادفی محیط پن برای واریانس واقعی تکرارها",
"met.accTitle":"ماتریکس صحت — زنده","met.accSub":"اجرای کامل هر سویه و مقایسه با کاتالوگ خودش",
"btn.runAcc":"اجرای اعتبارسنجی ۴ سویه",
"th.strain":"سویه","th.maxDay":"افق","th.d42bw":"BW d۴۲ (g)","th.dev":"انحراف٪","th.visits":"وعده/پرنده","th.mae":"MAE٪",
"met.note":"💡 هر سویه مستقل شبیه‌سازی و در برابر کاتالوگ خودش مقایسه می‌شود — بدون تکرار بین سویه‌ها. MAE = میانگین قدرمطلق انحراف وزن روزانه نسبت به PO همان روز؛ FCR = مصرف تجمعی ÷ افزایش وزن d۱۵ تا پایان افق سویه.",
"met.statT":"روش آماری","st.eu":"واحد","st.block":"بلوک","st.test":"آزمون","st.effect":"اندازه اثر","st.power":"توان",
"met.euText":"پن آزمایشی واحد نمونه آماری است؛ مشاهدات درون پن همبستگی دارند و تحلیل استنباطی بین‌پنی انجام می‌شود.",
"met.crnText":"بلوک‌بندی تصادفی: پرنده i-ام همه پن‌ها هم‌ویژگی ساخته می‌شود تا اختلاف تیمارها از شانس تفکیک شود.",
"met.testText":"ANOVA یک‌راهه برای اثر کلی + مقایسه‌های زوجی Welch-t با اصلاح Holm برای کنترل FWER.",
"met.etaText":"η² نسبت واریانس بین‌گروهی به کل؛ >۰٫۱۴ بزرگ و <۰٫۰۶ کوچک تلقی می‌شود.",
"met.powerText":"با σ_پن ≈ ۱٫۲٪ و α=۰٫۰۵، تشخیص اثر ۲٪ نیاز به ≥۳ تکرار در هر تیمار دارد.",
"met.noiseT":"بودجه عدم‌قطعیت سنسورها",
"nz.s1":"دقت تجاری لودسل پلتفرمی","nz.s2":"فیلتر میانگین متحرک نمایی",
"nz.s6":"تغییرپذیری فردی تغذیه","nz.s7":"واریانس بین‌پنی آزمایشگاهی",
"met.reproT":"تکرارپذیری",
"met.reproBody":"هر اجرا با seed=<code>308</code> و مولد mulberry32 آغاز می‌شود؛ بلوک‌سازی پرندگان از جریان مستقل (<code>seed×7919+13</code>) تغذیه می‌شود تا ترکیب ژنتیکی همه پن‌های هم‌تیمار یکسان باشد (Common Random Numbers). نتیجه: دو اجرا با seed یکسان بیت‌به‌بیت یکسان‌اند و مقایسه تیمارها فقط اثر واقعی را منعکس می‌کند.",
"lg.sim":"شبیه‌سازی",
"about.uniT":"دانشگاه تربیت مدرس — گروه علوم دامی",
"about.subTitle":"شبیه‌ساز آکادمیک دستگاه پایش مصرف خوراک طیور گوشتی",
"about.history":"<b>تاریخچه:</b> این پروژه از یک ایده ساده آغاز شد: چگونه می‌توان بدون صرف هزینه پرورش واقعی، الگوریتم پردازش داده دستگاه پایش مصرف خوراک را طراحی، تست و بهینه کرد؟ نسخه اول (Python) برای اعتبارسنجی مدل ریاضی ساخته شد؛ سپس موتور به JavaScript منتقل و رابط وب تعاملی اضافه گردید تا محققان بتوانند بدون نصب نرم‌افزار سناریوهای مختلف را آزموده و توان آماری طرح خود را بسنجند.",
"about.teamT":"<b>تیم:</b> طراحی و برنامه‌نویسی توسط Arsalan Rezazadeh؛ راهنمایی علمی گروه علوم دامی دانشگاه تربیت مدرس.",
"about.dataNote":"<b>منابع داده:</b> جداول عملکردی Ross 308, Cobb 500, Arbor Acres Plus, Hubbard EP عیناً از اسناد رسمی استخراج شده‌اند. رفتار تغذیه‌ای بر اساس Poultry Science و animal کالیبره شده است.",
"about.future":"<b>نقشه راه:</ب>: افزودن Indian River، ANCOVA با وزن شروع، خروجی PDF گزارش آماری.","ex.columns":"ستون‌های خلاصه روزانه","cp.all":"همه","cp.none":"هیچ",
"col.pen":"پن","col.treat":"تیمار","col.day":"روز دوره","col.alive":"زنده",
"col.bw":"وزن میانگین (g)","col.fi":"مصرف/پرنده (g)","col.fipo":"هدف PO (g)",
"col.visT":"وعده کل","col.visB":"وعده/پرنده","col.busy":"اشغال ٪",
"col.ovl":"همزمانی","col.fill":"شارژ مخزن","col.bin":"سطح پایان مخزن (kg)",
"col.temp":"دما °C","col.hum":"رطوبت ٪","scn.wave":"موج گرمایی +{dT}°C، روز {from}–{to}","scn.stn2":"ایستگاه دوم تغذیه","scn.stn1":"یک ایستگاه (پایه)","scn.dualNote":"با دو سوراخ تغذیه، ظرفیت همزمانی دو برابر می‌شود؛ صف و رویدادهای همزمانی به‌شدت کاهش می‌یابد و پن‌های بزرگ دیگر گلوگاه نیستند.","scn.dipSub":"حداکثر فاصله وزنی در روز {age}","st.ovlShort":"همزمانی","exp.totals":"<b>{pens}</b> پن · <b>{birds}</b> پرنده","exp.heavy":"سنگین برای انیمیشن","dyn.presetDone":"قالب اعمال شد","lg.penMean":"میانگین پن","lg.farmMean":"میانگین فارم","lg.cumSim":"مصرف تجمعی شبیه‌سازی","lg.cumPo":"هدف تجمعی کاتالوگ","btn.delPen":"حذف پن","lg.po":"کاتالوگ رسمی سویه","lg.band":"باند نر–ماده","lg.target":"هدف کاتالوگ",
"lg.hourShare":"سهم ساعت از مصرف","lg.dark":"تاریکی",
"t.day":"روز","t.simBW":"وزن شبیه‌سازی","t.dev":"انحراف","t.simFI":"FI sim","t.status":"وضعیت",
"dash.stationNote":"💡 یافته طراحی: از پن ۱۰تایی به بالا اشباع ساعات پیک معنادار می‌شود و پن ۱۲تایی از ظرفیت عبور می‌کند ⇒ برای پن ≥۱۰ ایستگاه دوم توصیه می‌شود.",

"exp.title":"طراح آزمایش — پن، تعداد و تیمار","exp.sub":"پایه نقشه فارم و خروجی‌ها",
"exp.preset":"قالب آماده","exp.penId":"شناسه پن","exp.n":"تعداد پرنده","exp.treat":"تیمار",
"pre.std":"استاندارد — ۶ پن ۳ تا ۱۲ شاهد","pre.t4x2":"۴ تیمار × ۲ تکرار — ۸ پن × ۱۵",
"pre.heatcmp":"تنش گرمایی — ۲ شاهد + ۲ تنش × ۲۰","pre.vax":"اثر واکسیناسیون — ۳+۳ × ۲۵",
"pre.big":"پن بزرگ واحد — ۵۰",
"exp.effectsNote":"<b>اثر تیمارها</b> (ضرایب کالیبره جهت‌دار): شاهد = مسیر کاتالوگ · پروبیوتیک ≈ +۱٪ مصرف/+۱٫۵٪ وزن · افزاینده رشد ≈ +۲٪/+۲٫۵٪ · واکسن افت موقت ~۱۰٪ در d۱۹–۲۲ · کم‌پروتئین +۴٪ مصرف/−۲٫۵٪ وزن · تنش حرارتی موج +۵°C در d۳۲–۳۸.",
"exp.blockNote":"🎲 بلوک‌بندی تصادفی فعال است: پرنده i-امِ همه پن‌ها هم‌ویژگی ساخته می‌شود تا اختلاف پن‌ها اثر واقعی تیمار باشد؛ برای توان آماری هر تیمار ≥۳ تکرار بدهید.",
"exp.repro":"اجرای تکرارپذیر",
"btn.apply":"↥ اعمال قالب","btn.addPen":"＋ افزودن پن","btn.buildFarm":"🗺️ ساخت نقشه فارم و اجرای دوره",
"btn.play":"پخش","btn.stop":"پایان","btn.pause":"توقف موقت","btn.resume":"ادامه","btn.nextDay":"روز بعد","btn.restart":"از روز ۱۵",
"btn.toEnd":"پرش به پایان","btn.run":"اجرا","btn.compare":"اجرای مقایسه",
"btn.xlsx":"📊 اکسل کامل","btn.csvRaw":"⬇ CSV خام","btn.runStats":"⚡ تحلیل آماری",

"fm.speed":"سرعت زمان","farm.barn":"سالن تحقیقاتی — نمای زنده",
"farm.locked":"هر وعده موتور = یک حرکت جوجه","farm.light":"روشنایی","farm.darkOff":"تاریکی","farm.dark":"دوره تاریکی — 18L:6D",
"farm.insp":"اینسپکتور —","farm.wholeFarm":"کل فارم","farm.ticker":"جریان رویدادها",
"sim.speed":"سرعت","sim.instant":"فوری","sim.day":"روز جاری","sim.meanBw":"میانگین وزن پن",
"sim.fiToday":"مصرف امروز هر پرنده","sim.visits":"وعده‌ها","sim.busy":"اشغال ایستگاه تغذیه",
"sim.capacity":"ظرفیت سوراخ تغذیه واحد","sim.device":"دستگاه در لحظه","sim.stream":"جریان خام داده",
"sim.age0":"سن شروع","sim.age1":"سن پایان","sim.pen":"پن",

"scn.title":"طراحی سناریوی مقایسه‌ای","scn.paired":"seed جفت‌شده — فقط عامل سناریو تغییر می‌کند",
"scn.type":"سناریو","scn.heat":"🌡️ تنش گرمایی","scn.stn":"🏗️ ایستگاه دوم تغذیه",
"scn.from":"شروع موج (روز)","scn.days":"طول (روز)","scn.config":"پیکربندی",
"scn.twoSt":"۲ ایستگاه","scn.oneSt":"۱ ایستگاه (پایه)",
"scn.modelNote":"فرضیات کالیبره گرما: FI×<bdi>exp(−0.045·ΔT)</bdi> حین موج + افت مستقیم وزن ≈۱٫۲٪/°C با بازیابی جزئی پس از تنش؛ ضرایب جهت‌دارند نه قطعی. مسیر پایه دقیقاً نتایج اعتبارسنجی است.",
"scn.dBw":"Δ وزن نهایی","scn.dip":"حداکثر افت حین رویداد","scn.dFcr":"FCR پایه→سناریو",
"scn.dBusy":"اشباع پیک بدترین پن","scn.chGrowth":"رشد پایه vs سناریو","scn.base":"پایه",
"scn.scenario":"سناریو","scn.chFi":"مصرف روزانه پایه vs سناریو","scn.table":"جدول مقایسه پن‌ها",
"scn.bwBase":"وزن پایه","scn.bwScn":"وزن سناریو","scn.fcrBase":"FCR پایه","scn.fcrScn":"FCR سناریو",
"scn.busyBase":"اشغال پایه","scn.busyScn":"اشغال سناریو",

"dev.arch":"معماری دستگاه شبیه‌سازی‌شده","dev.schema":"Schema رکورد دستگاه",
"dev.lc1":"<b>① لودسل ۱ — سکوی توزین:</b> نویز خام σ≈4g روی raw_weight_g و فیلتر EMA برای weight_g مطابق نمونه مرجع کاربر.",
"dev.lc2":"<b>② لودسل ۲ — مخزن ۲۵kg:</b> کاهش لحظه‌ای جرم = مصرف؛ شارژ خودکار در آستانه ۳kg.",
"dev.rfid":"<b>③ RFID بال:</b> شناسایی هنگام ورود؛ ۰٫۴٪ بدون ID، RSSI میانگین −۶۵dBm — سازگار با دقت UHF-RFID منتشرشده [7].",
"dev.queue":"<b>④ منطق صف:</b> سوراخ واحد؛ انتظار ≤۹۰ ثانیه وگرنه رویداد هم‌زمانی — گلوگاه پن‌های بزرگ.",
"dev.threeRows":"هر وعده دقیقاً ۳ ردیف تولید می‌کند (شروع/میانه/پایان) مثل نمونه سه‌ردیفی مرجع.",
"dev.excelNote":"<b>خروجی Excel</b> چهار شیت دارد: خلاصه روزانه · داده دستگاه · طرح آزمایش · PO مرجع — با هدر فریز و نمای RTL.",
"dev.cycles":"دوره‌های پرورشی","dev.newCycle":"ایجاد دوره","dev.live":"جریان داده دستگاه (زنده)",
"dev.liveNote":"رویدادهای خام دستگاه (RFID ورود + لودسل مخزن + تایم وعده) به‌صورت زنده از بک‌اند دریافت می‌شوند.",
"dev.stats":"آمار دوره انتخاب‌شده",
"dev.regs":"ثبت‌های لحظه‌ای ورود پرنده",
"dev.regsNote":"هر پرنده هنگام ورود به دستگاه تگ‌خوانی می‌شود؛ وزن اولیه، تاریخ و ساعت ثبت دقیقاً در لحظه ورود ثبت و در دیتابیس ذخیره می‌گردد — این پنل همان داده‌ها را زنده نمایش می‌دهد.",

"sci.sources":"منابع علمی — با نقل‌قول مستقیم","sci.use1":"جدول وزن↔دما و برنامه نوری مدل.",
"sci.use2":"پارامترهای گومپرتز Ross.","sci.use3":"کاتالوگ کامل وزن/مصرف/FCR هر سویه — عیناً از اسناد رسمی، بدون تکرار بین سویه‌ها.",
"sci.use5":"موتور وعده‌ها (−۲٫۲۱/day؛ مدت +۲٫۱۹s/day).","sci.use6":"جهت اثر اندازه گروه.",
"sci.use7":"مدل RFID و مدت وعده.","sci.use8":"دیورنال دوقله و هم‌زمانی آخور.",
"sci.chain":"زنجیره مدل‌سازی","st.1":"گام ۱","st.2":"گام ۲","st.3":"گام ۳","st.4":"گام ۴","st.5":"گام ۵","st.6":"گام ۶","st.stat":"آمار","st.out":"خروجی",
"chain.1":"کاتالوگ سویه = هدف قفل‌شده هر روز (BW/FI نر و ماده)",
"chain.2":"انحراف فردی CV≈۵٪ + AR(1) + بلوک‌بندی بین پن‌ها",
"chain.3":"رگرسیون‌های RFID = تعداد/مدت وعده (Weibull shares)",
"chain.4":"دیورنال دوقله صبح/عصر + نور 18L:6D",
"chain.5":"اندازه گروه = تعدیل جزئی FI/BW پن",
"chain.6":"فیزیک لودسل/RFID = نویز، EMA، صف ≤۹۰s، شارژ مخزن",
"chain.7":"اثر تصادفی پن (~۱٫۲٪) → واریانس واقعی تکرارها برای ANOVA/Welch",
"chain.8":"MAE وزن ≈ ۱–۲٪ نسبت به کاتالوگ سویه فعال",
"sci.limits":"شفافیت و محدودیت‌ها",
"lim.1":"① Ross booklet سال ۲۰۰۷ است؛ نسخه‌های جدیدتر اهداف متفاوت ولی روند یکسان دارند.",
"lim.2":"② اثر اندازه گروه در ۳–۱۲ پرنده غالباً غیرمعنی‌دار؛ ضرایب کوچک و جهت‌دارند.",
"lim.3":"③ مدل صف ساده (≤۹۰s)؛ رقابت اجتماعی واقعی پیچیده‌تر است.",
"lim.4":"④ تلفات احتمال ثابت روزانه از d۲۱ [تأییدنشده].",
"lim.5":"⑤ ضرایب تیمارها و سناریوی تنش گرمایی کالیبره‌شده‌اند و معادل استخراج مستقیم از منبع نیستند.",
"lim.6":"⑥ آمار استنباطی روی «پن» به‌عنوان واحد نمونه است؛ n کم = توان کم.",
"about.title":"درباره و مالکیت",
"about.body":"آرین نسخه ۱٫۰٫۰ — ساخته و نگهداری‌شده توسط <b>Arsalan Rezazadeh</b>. شبیه‌ساز آکادمیک دستگاه RFID + دو لودسل برای سویه‌های گوشتی صنعتی با کاتالوگ‌های رسمی Aviagen / Cobb-Vantress / Hubbard، موتور وعده‌محور و آزمایشگاه آمار زیستی. اجرای کاملاً آفلاین، بدون سرور، seed تکرارپذیر.",
"landing.badge":"سامانه هوشمند پایش مصرف خوراک و سیستم‌های کنترل محیطی",
"landing.typed":"سامانه یکپارچه هوشمند اصلاح نژاد و مدیریت پرورش جوجه‌های گوشتی",
"landing.register":"ثبت‌نام رایگان","landing.login":"ورود به پنل","landing.guest":"مشاهده معرفی",
"landing.stat.24h":"۲۴ ساعته","landing.stat.trials":"طرح‌های آزمایشی","landing.stat.lab":"آزمایشگاه مجازی و تخصصی",
"landing.stat.live":"داده زنده دستگاه","landing.stat.user":"داده‌های کاربرمحور",
"landing.card.dash.t":"داشبورد اعتبارسنجی","landing.card.dash.p":"مقایسه لحظه‌ای نتایج شبیه‌سازی با عملکرد استاندارد سویه، همراه با نمودار رشد و ضریب تبدیل خوراک اختصاصی هر کاربر.",
"landing.card.exp.t":"طرح آزمایش","landing.card.exp.p":"تعریف دوره‌های پرورشی، گروه‌های تیمار و تکرارهای آزمایشی — هر دوره به‌صورت کامل و ایزوله در حساب کاربری شما ثبت می‌شود.",
"landing.card.farm.t":"نقشه فارم پویا","landing.card.farm.p":"جانمایی جایگاه‌های پرورشی، حسگرها و نمایش وضعیت زنده فارم — داده‌ها به‌صورت اختصاصی و ایزوله در اختیار شما قرار دارد.",
"landing.card.sim.t":"شبیه‌سازی زنده","landing.card.sim.p":"اجرای سناریو با شناسه اختصاصی و مشاهده بلادرنگ نتایج و خروجی‌های شبیه‌سازی.",
"landing.card.scn.t":"سناریوها","landing.card.scn.p":"ذخیره‌سازی، مقایسه و اجرای مجدد سناریوهای شخصی‌سازی‌شده با امکان بازبینی دقیق نتایج.",
"landing.card.dev.t":"دستگاه و داده","landing.card.dev.p":"ثبت و ذخیره‌سازی خودکار اطلاعات دستگاه‌های پایش — داده‌ها به‌صورت کامل کاربرمحور، ایمن و اختصاصی شما نگهداری می‌شود.",
"landing.foot.p":"برای دسترسی به داشبورد، آزمایش‌ها و داده‌های دستگاه، وارد حساب کاربری خود شوید. داده‌ها و شبیه‌سازی‌ها کاملاً اختصاصی و بر اساس عملکرد شما ذخیره می‌شوند.",
"landing.foot.btn":"ورود و شروع",
"landing.live.b":"داده زنده · ۲۴ ساعته","landing.live.s":"داده‌های کاربرمحور و ایمن","landing.iso":"ایزوله",
"ws.title":"محیط کاربری آرین","ws.subtitle":"وارد شده — داده‌های شما کاملاً اختصاصی و ایزوله است",
"ws.badge.user":"کاربر","ws.badge.admin":"مدیر","ws.badge.active":"فعال • کاربرمحور",
"ws.stat.cycles":"دوره‌ها","ws.stat.scenarios":"سناریوها","ws.stat.device":"رکورد دستگاه","ws.stat.live":"داده زنده",
"ws.card.dash.t":"داشبورد اعتبارسنجی","ws.card.dash.p":"مقایسه شبیه‌سازی با داده واقعی و نمودار رشد",
"ws.card.exp.t":"طرح آزمایش","ws.card.exp.p":"تعریف دوره‌ها، تیمارها و تکرارها",
"ws.card.farm.t":"نقشه فارم پویا","ws.card.farm.p":"جانمایی پن‌ها و حسگرها به‌صورت زنده",
"ws.card.sim.t":"شبیه‌سازی زنده","ws.card.sim.p":"اجرای سناریو با نتیجه بلادرنگ",
"ws.card.scn.t":"سناریوها","ws.card.scn.p":"ذخیره، مقایسه و اجرای مجدد",
"ws.card.dev.t":"دستگاه و داده","ws.card.dev.p":"ثبت خودکار داده‌ها — داده‌های کاربرمحور",
"ws.card.sci.t":"مبانی علمی","ws.card.sci.p":"مدل‌های رشد و مصرف خوراک",
"ws.card.met.t":"روش‌شناسی","ws.card.met.p":"روش اندازه‌گیری و اعتبارسنجی",
"ws.go":"ورود به بخش","ws.btn.dash":"رفتن به داشبورد","ws.btn.logout":"خروج از حساب","ws.btn.home":"بازگشت به صفحه اصلی",
"prod.hero.t":"محصولات و خدمات آرین","prod.hero.p":"سامانه‌های هوشمند پرورش و اصلاح نژاد طیور گوشتی — از ثبت دقیق داده در واحد آزمایشی تا کنترل خودکار شرایط محیطی سالن؛ طراحی‌شده برای مراکز تحقیقاتی، واحدهای مادر و فارم‌های تجاری.",
"prod.p1.tag":"محصول ۱","prod.p1.t":"سیستم پایش مصرف خوراک","prod.p1.d":"ثبت خودکار بازدید هر پرنده از ایستگاه تغذیه با شناسایی الکترونیکی و توزین هم‌زمان؛ محاسبه دقیق مصرف خوراک فردی، وزن‌کشی پیوسته و تشخیص هوشمند وعده‌های تغذیه‌ای — بدون دخالت انسانی و بدون استرس گله.",
"prod.p1.f1":"شناسایی الکترونیکی هر پرنده با بال‌تگ و ثبت لحظه‌ای ورود و خروج","prod.p1.f2":"حسگرهای وزن‌کشی با هموارسازی نویز و دقت در حد گرم","prod.p1.f3":"محاسبه خودکار مصرف خوراک فردی، شمارش بازدید و بستن وعده","prod.p1.f4":"مدیریت دوره‌های پرورشی با داده‌های کاملاً اختصاصی هر کاربر","prod.p1.f5":"ثبت و ذخیره‌سازی خودکار داده‌ها و استریم زنده به داشبورد",
"prod.p1.status":"فعال · داده زنده ۲۴ ساعته","prod.p2.tag":"محصول ۲","prod.p2.t":"سیستم هوشمند کنترل محیطی","prod.p2.d":"پایش و کنترل خودکار دما، رطوبت و تهویه سالن بر اساس استانداردهای رسمی پرورش؛ تنظیم هوشمند شرایط محیطی در هر سن، کاهش تنش گرمایی و بهبود ضریب تبدیل خوراک — همه‌چیز از یک داشبورد واحد.",
"prod.p2.f1":"حسگرهای دما و رطوبت با ثبت پیوسته در هر نقطه سالن","prod.p2.f2":"منطق کنترل خودکار تهویه و گرمایش بر اساس سن گله","prod.p2.f3":"هشدار لحظه‌ای انحراف از بازه استاندارد هر سویه","prod.p2.f4":"سناریوهای محیطی قابل تعریف و اجرای آزمایشی","prod.p2.f5":"گزارش‌گیری دوره‌ای و هم‌راستایی با اهداف عملکردی سویه",
"prod.p2.status":"فعال · پایش ۲۴ ساعته","prod.demo":"مشاهده دمو",
"auth.welcome":"خوش آمدید ","auth.workspace":"مدیریت محیط کاربری","auth.changePass":"تغییر رمز","auth.logout":"خروج از حساب",
"auth.loggedOut":"خارج شدید","auth.loginTitle":"ورود به پنل کاربری","auth.loginTab":"ورود","auth.registerTab":"ثبت‌نام",
"auth.identLabel":"ایمیل یا نام کاربری","auth.passLabel":"رمز عبور","auth.loginBtn":"ورود",
"auth.hintNoAccount":"حساب ندارید؟","auth.hintRegister":"ثبت‌نام کنید","auth.hintHasAccount":"حساب دارید؟","auth.hintLogin":"وارد شوید",
"auth.nameLabel":"نام کامل","auth.emailLabel":"ایمیل *","auth.usernameLabel":"نام کاربری","auth.passLabel2":"رمز عبور *","auth.confirmPassLabel":"تکرار رمز","auth.registerBtn":"ثبت‌نام",
"auth.errIdentPass":"ایمیل و رمز الزامی است","auth.errPassShort":"رمز حداقل ۶ کاراکتر","auth.errPassMismatch":"تکرار رمز مطابقت ندارد",
"auth.errLoginFail":"ورود ناموفق","auth.errRegisterFail":"ثبت‌نام ناموفق","auth.changeTitle":"تغییر رمز عبور","auth.changeMsg":"رمز فعلی و رمز جدید خود را وارد کنید.",
"auth.changePh1":"رمز فعلی","auth.changePh2":"رمز جدید (حداقل ۶ کاراکتر)","auth.changeBtn":"تغییر رمز","auth.changeOk":"رمز با موفقیت تغییر کرد.","auth.changeFail":"خطا در تغییر رمز",
"auth.promptOld":"رمز فعلی را وارد کنید:","auth.promptNew":"رمز جدید (حداقل ۶ کاراکتر):","auth.alertShort":"رمز کوتاه است","auth.alertOk":"رمز با موفقیت تغییر کرد",
"dev.empty":"دوره‌ای ثبت نشده است.","dev.birds":"پرنده","dev.delete":"حذف","dev.deleteTitle":"حذف دوره","dev.deleteMsg":"دوره {code} و تمام داده‌های آن حذف شود؟\nاین عمل قابل بازگشت نیست.","dev.deleteConfirm":"حذف","dev.backendError":"خطا در اتصال به بک‌اند: ","dev.codeRequired":"کد و نام دوره الزامی است","dev.created":"دوره {code} ایجاد شد","dev.regEmpty":"هنوز ثبت لحظه‌ای دریافت نشده است.<br>پرنده‌ها هنگام ورود اینجا ظاهر می‌شوند.",
"dialog.cancel":"انصراف","dialog.confirm":"تایید","dialog.ok":"باشه","dialog.required":"این فیلد الزامی است","dialog.oldRequired":"رمز فعلی الزامی است","dialog.newRequired":"رمز جدید الزامی است","dialog.newShort":"رمز جدید حداقل ۶ کاراکتر باشد",
"toast.needLogin":"برای دسترسی به این بخش وارد شوید","ws.role.user":"کاربر","ws.role.admin":"مدیر",
"foot.data":"داده‌ها: Aviagen · Cobb-Vantress · Hubbard · Poultry Science · animal · Arch Anim Breed",
"foot.offline":"اجرای کامل آفلاین · seed تکرارپذیر = 308 · واحد نمونه آماری: پن",

/* ---- dynamic ---- */
"dyn.ready":"آماده — موتور وعده‌محور کالیبره روی کاتالوگ فعال",
"dyn.running":"در حال اجرا — \u2066{pen}\u2069 · روز {day} · \u2066{date}\u2069",
"dyn.gen":"در حال تولید داده…",
"dyn.done":"✅ کامل شد — {rows} رکورد · وزن پایانی \u2066{bw} g\u2069 · FCR \u2066{fcr}\u2069",
"dyn.paused":"متوقف شد — می‌توانید ادامه دهید یا خروجی بگیرید",
"dyn.records":"{n} رکورد",
"dyn.csvDone":"{n} رکورد CSV دانلود شد",
"dyn.xlsxBuilding":"در حال ساخت فایل اکسل…",
"dyn.xlsxDone":"اکسل ساخته شد — خلاصه، داده خام، طرح آزمایش و PO",
"dyn.noData":"داده‌ای برای خروجی نیست",
"dyn.badRange":"سن شروع باید کمتر از سن پایان باشد",
"dyn.rangeLimit":"بازه مجاز این سویه: ۱۰ تا {max} روز",
"dyn.stale":"⚠️ طرح آزمایش تغییر کرد — نقشه فارم را دوباره بسازید.",
"dyn.built":"🌱 دوره ساخته شد — {birds} پرنده در {pens} پن · سویه \u2066{strain}\u2069",
"dyn.playing":"پخش آغاز شد — روی هر پن کلیک کنید تا اینسپکتور باز شود",
"dyn.finished":"🏁 پایان دوره — نتایج در اینسپکتور و نمودارها",
"dyn.rebuilt":"🔄 بازگشت به روز ۱۵",
"dyn.death":"☠ مرگ \u2066{id}\u2069 در پن \u2066{pen}\u2069 (روز {age})",
"dyn.refill":"🛢 شارژ مخزن {pen}{x}",
"dyn.vaxDay":"💉 واکسیناسیون (d۱۹–۲۲) — افت موقت مصرف ~۱۰٪",
"dyn.heatDay":"🔥 آغاز موج تنش گرمایی (+۵°C تا d۳۸)",
"dyn.maxBirds":"برای انیمیشن حداکثر ۴۰۰ پرنده — طرح را سبک‌تر کنید",
"dyn.bigCsv":"برای گله بزرگ‌تر از ۲۵۰، CSV خام غیرفعال است (حجم)",
"dyn.bigXlsx":"گله بزرگ — شیت داده خام حذف شد",
"dyn.buildingRaw":"در حال تولید داده خام…",
"dyn.scnDone":"مقایسه سناریو انجام شد",
"val.excellent":"عالی","val.ok":"قابل قبول","val.review":"بررسی",
"ver.free":"آزاد","ver.near":"نزدیک اشباع","ver.bottle":"گلوگاه پیک",
"fcr.note":"FCR پن‌ها بین <b>\u2066{lo}\u2069</b> و <b>\u2066{hi}\u2069</b> — پراکندگی طبیعی ترکیب جنسیتی و اندازه گروه؛ بدترین اشغال: <b>\u2066{worst}\u2069</b> با <b>{peak}٪</b>.",
"tr.control":"شاهد","tr.probiotic":"پروبیوتیک","tr.agp":"افزاینده رشد",
"tr.vaccine":"واکسن d۱۹–۲۲","tr.lowprot":"کم‌پروتئین","tr.heat":"تنش گرمایی d۳۲–۳۸",
"insp.treat":"تیمار","insp.meanBw":"وزن میانگین","insp.vsPO":"vs PO",
"insp.fiToday":"مصرف امروز/پرنده","insp.visitsToday":"وعده‌های امروز",
"insp.perBird":"/پرنده","insp.busy":"اشباع ایستگاه","insp.bin":"سطح مخزن",
"insp.refills":"شارژها تا امروز","insp.ovl":"تغذیه‌های همزمان تا امروز","insp.mort":"تلفات این پن",
"insp.pensAlive":"پن‌ها / پرندگان زنده","insp.farmBw":"میانگین وزن فارم",
"insp.farmFiToday":"مصرف امروز کل","insp.totalVisits":"وعده‌های امروز",
"insp.todayRefills":"شارژ مخزن امروز","insp.totalDeaths":"تلفات کل","insp.todayOvl":"تغذیه همزمان امروز",
"bio.descTable":"آمار توصیفی به تفکیک تیمار","bio.anovaTitle":"ANOVA یک‌راهه",
"bio.pairwise":"مقایسات زوجی Welch–t (اصلاح Holm)","bio.metricCol":"متغیر","bio.nCol":"n(پن)",
"bio.meanCol":"میانگین±SD","bio.seCol":"SE","bio.ciCol":"CI۹۵٪",
"bio.noReps":"برای تحلیل استنباطی حداقل ۲ تیمار با ≥۲ تکرار لازم است.",
"bio.method":"واحد آزمایشی = پن. مقایسه‌های زوجی پس‌هوک با آزمون t ولچ و اصلاح هولم انجام شده است؛ * p<0.05، ** p<0.01، *** p<0.001؛ η² اندازه اثر تحلیل واریانس است. بازه اطمینان ۹۵٪ بر مبنای ت-دانشجویی محاسبه می‌شود.",
"bio.anovaLine":"F({dfB},{dfW}) = {F} · p = {p} · η² = {eta2}",
"scn.noteHeat":"🌡️ {label} — بیشینه افت وزن <b>{dip}٪</b> در روز {age}؛ وزن نهایی {dir}<b>{dbw}٪</b>. مصرف حین موج تا ~۲۵٪ کاهش می‌یابد و پس از تنش بازیابی جبرانی جزئی دیده می‌شود (FCR پنجره‌ای ممکن است تغییر کمی کند).",
"scn.noteStn":"🏗️ {label} — اشغال پیک بدترین پن از <b>\u2066{from}%\u2069</b> به <b>\u2066{to}%\u2069</b> رسید؛ تغذیه‌های همزمان کل گله: {ovlB} → <b>\u2066{ovlS}\u2069</b>. یافته REPORT.md بازتولید شد.",
"scn.fcrSub":"با بازیابی جبرانی پس از تنش، تغییر جزئی است",
"scn.busySub":"بدترین پن: \u2066{pen}\u2069","hdr.clockTitle":"تاریخ و ساعت کنونی","hdr.strainAria":"سویه","hdr.settingsAria":"تنظیمات","ws.aria":"محیط کاربری","ws.prefix":"محیط کاربری — ","ws.isolated":" — داده‌های شما کاملاً اختصاصی و ایزوله است","ws.role.admin":"مدیر","dev.stat.visits":"بازدید","dev.stat.birds":"پرندگان یکتا","dev.stat.rows":"ردیف دستگاه","dev.stat.intake":"مصرف کل (g)","dev.stat.avgw":"میانگین وزن اولیه (g)","dev.stat.miss":"شناسه ازدست‌رفته","dev.live":"زنده","dev.reg.bird":"پرنده","dev.reg.weight":"وزن اولیه","dev.reg.date":"تاریخ","dev.reg.time":"ساعت","dev.reg.sensor":"سنسور","dev.reg.tag":"تگ / کد مرغ","form.codeLabel":"کد دوره (مثلاً F01)","form.nameLabel":"نام دوره","form.strainAria":"سویه","day.prefix":"روز ","bird.unknown":"؟؟؟","btn.pause":"⏸ توقف موقت","bw.base":"پایه: ","bw.lower":"پایین‌تر از پایه ","bw.higher":"بالاتر از پایه ","footer.brand":"آرین v1.0.0","footer.copyright":"© 2026 Arsalan Rezazadeh","sci.effectTitle":"اثر تیمارها"
},
en:{
"bio.title":"Biostatistics laboratory","bio.sub":"unit = pen · Welch t / one-way ANOVA / η² / Holm",
"bio.metric":"Response variable","bio.bw":"Final weight (g)","bio.fi":"Total intake per bird (g)",
"bio.fcr":"Window FCR","bio.mort":"Mortality (%)",
"app.title":"Arian — Intelligent Poultry Breeding & Rearing Platform","brand.name":"Arian",
"app.tag":"Intelligent Breeding & Rearing Platform",
"app.uni":"Animal Science Dept., Tarbiat Modares University",
"hdr.strain":"Strain","hdr.rows":"records/cycle",
"nav.feedGroup":"Feed Intake Monitoring","nf.title":"Page not found","nf.p":"The address you entered does not exist or has moved.","nf.home":"Home","feed.h":"Feed Intake Monitoring System","feed.p":"Real-time per-bird feed intake with RFID + dual load-cell — from trial design to validation and scenario analysis, all data isolated per account","feed.badge":"24/7 monitoring · isolated data","feed.hero.t":"From farm to insight — one flow","feed.hero.p":"Seven specialist modules in one continuous workflow: validation, design, live map, live stream, scenarios, hardware and methodology","feed.kpi.acc":"Validation accuracy","feed.kpi.acc.v":"1–2%","feed.kpi.acc.s":"Weight MAE vs catalog","feed.kpi.live":"Coverage","feed.kpi.live.v":"24/7","feed.kpi.live.s":"3 rows per visit","feed.kpi.iso":"User isolation","feed.kpi.iso.v":"100%","feed.kpi.iso.s":"Per-account data","feed.kpi.through":"Throughput","feed.kpi.through.v":"10k+","feed.kpi.through.s":"Records per cycle","feed.steps.t":"Workflow","feed.steps.s1.t":"1. Design","feed.steps.s1.p":"Pens, treatments, density","feed.steps.s2.t":"2. Simulate","feed.steps.s2.p":"Weibull engine + 90s queue","feed.steps.s3.t":"3. Monitor","feed.steps.s3.p":"RFID + dual load-cell","feed.steps.s4.t":"4. Validate","feed.steps.s4.p":"Growth vs catalog","feed.steps.s5.t":"5. Scenario","feed.steps.s5.p":"Heat stress / 2nd station","feed.grid.t":"Seven modules — one system","feed.card.dash.t":"Validation dashboard","feed.card.dash.p":"Day-by-day vs official catalog, window FCR and male–female band","feed.card.exp.t":"Trial designer","feed.card.exp.p":"Define pens, heads, treatments and replicates — basis for farm and stats","feed.card.farm.t":"Live farm map","feed.card.farm.p":"Time-play with moving birds, pen occupancy and bird picker","feed.card.sim.t":"Live stream","feed.card.sim.p":"Live RFID/weight flow, live charts and exports","feed.card.scn.t":"Scenarios","feed.card.scn.p":"Paired comparison with identical seed — treatment effect","feed.card.dev.t":"Device & data","feed.card.dev.p":"Sensor architecture, queue logic and 12-col schema","feed.card.met.t":"Methodology","feed.card.met.p":"Model chain, equations and transparent limits","feed.cta.t":"Ready to monitor?","feed.cta.p":"Build your trial or start the live stream — data is saved automatically.","feed.btn.sim":"Start live stream","feed.btn.exp":"Design trial","feed.go":"Open","nav.landing":"Home","nav.dash":"Validation dashboard","nav.exp":"Trial designer","nav.farm":"Live farm map",
"nav.sim":"Live device stream","nav.scn":"Scenario lab","nav.dev":"Device & schema","nav.sci":"Scientific basis",
"btn.defaults":"Defaults","btn.resetCycle":"Reset cycle data",
"dyn.designReset":"↺ Trial design restored to defaults","dyn.readFail":"RFID read failure",
"dyn.resetArmed":"⚠️ Click again to clear all cycle data","dyn.resetDone":"♻️ All cycle data has been reset",
"dyn.visitOk":"Visit logged","hdr.lang":"Language","hdr.mae":"MAE","hdr.theme":"Theme",
"nav.products":"Products & Services","nav.about":"About us","hdr.help":"Quick tour",
"tour.welcomeT":"🎓 Welcome — 90-second guided tour",
"tour.welcomeP":"Arian is an intelligent broiler growth and feed intake simulator. Each account keeps its own fully isolated data. In less than two minutes you will learn the whole workflow, and you can always reopen this guide from Settings.",
"tour.authT":"🔒 Sign in and data isolation",
"tour.authP":"The landing page and About page are open to all visitors. The other seven specialist sections become available after you sign in, and every rearing cycle and device report is stored exclusively in your own account.",
"tour.strainT":"🧬 Choosing the strain",
"tour.strainP":"Four validated strains are available: Ross 308, Cobb 500, Arbor Acres Plus and Hubbard. You can select your preferred strain from the strain menu in Settings. All indicators, charts and the mean absolute error are calculated precisely according to the official guide for that strain.",
"tour.settingsT":"⚙️ Settings and language",
"tour.settingsP":"Use the settings button in the top bar to change the strain, switch the language between English and Persian, choose between dark and light appearance, and access the Shamsi and Gregorian clock as well as this quick guide. The T key is also a shortcut for switching appearance.",
"tour.navT":"🧭 Main navigation",
"tour.navP":"The navigation bar contains nine main sections: Landing page, Validation Dashboard, Trial Design, Dynamic Farm Map, Live Simulation, Scenarios, Device and Data, Scientific Basis, Methodology and About. Selecting any item will take you to that section.",
"tour.dashT":"📊 Validation Dashboard",
"tour.dashP":"On the Validation Dashboard you will see the key indicators such as the mean absolute error, the feed conversion ratio and the final body weight. You will also find the growth curve compared with the official guide for the strain, daily feed intake, the feeding pattern throughout the day and the feeder station saturation. A mean error below two percent indicates very high simulation fidelity.",
"tour.expT":"🧪 Trial Design",
"tour.expP":"In the Trial Design section you can define rearing pens, specify the number of birds, the treatment type and the number of replications. This design forms the basis for displaying the farm map, performing statistical analyses and preparing export files.",
"tour.farmT":"🗺 Dynamic Farm Map",
"tour.farmP":"The dynamic farm map shows the rearing process on a timeline. Birds move inside their pens, the crowding and occupancy of each pen can be observed, and by selecting any bird you can individually review its current weight, feed consumption and health status.",
"tour.simT":"📡 Live Device Simulation",
"tour.simP":"In the Live Simulation section you can watch the data arriving from the intelligent identification system and the weighing sensors in real time. The live growth chart, cumulative intake chart, complete feeding event table and the option to download the results as a text file or spreadsheet are all located here.",
"tour.scnT":"🧪 Scenario Laboratory",
"tour.scnP":"In the Scenario Laboratory you can compare two different conditions with exactly the same starting point, for example the effect of heat stress or the addition of a second feeding station. The result is shown as growth charts, feed intake charts and a daily change table.",
"tour.devT":"💻 Device and Data",
"tour.devP":"In the Device and Data section you will learn about the communication architecture, how the weighing sensors and the identification system work, the feeding queue management logic and the twelve-column structure of each record. All data is stored securely and exclusively for each user.",
"tour.sciT":"📚 Scientific Basis and Methodology",
"tour.sciP":"In the Scientific Basis and Methodology sections you can review the peer-reviewed references, the complete modelling chain, the equations used and the limitations of the simulation with clear and well-documented explanations.",
"tour.expT2":"📦 Data Export",
"tour.expP2":"To obtain your data, use the export button in the Live Simulation or Farm Map section. You can select the desired columns and receive the output as a text file or as a multi-sheet spreadsheet.",
"tour.doneT":"🎉 You are ready!","tour.doneP":"We recommend starting from the Validation Dashboard or going directly to the Trial Design section to create your own rearing pens. We wish you success. Use the Escape key to close this guide and the arrow keys to move between steps.",
"tour.next":"Next","tour.prev":"Back","tour.skip":"Skip","tour.finish":"Finish",
"ex.title":"Export center","ex.back":"↩ Back","ex.source":"Source","ex.format":"Format",
"ex.summary":"Daily pen summary","ex.device":"Raw device records",
"ex.birds":"Per-bird records","ex.design":"Trial design","ex.po":"Reference PO catalog",
"ex.dataset":"Dataset","ex.generate":"Generate & download",
"ex.none":"Run a simulation first so there is data to export.",
"ex.rawSkip":"Large flock \u2014 raw-data sheet skipped.","ex.rowcap":"capped at {cap} rows",
"ex.ctxLive":"Live run \u00b7 pen {pen} \u00b7 d{a0}\u2013{a1} \u00b7 strain {strain}",
"ex.ctxFarm":"Whole farm \u00b7 {pens} pens \u00b7 d{a0}\u2013{a1} \u00b7 strain {strain}",

"farm.tags":"Tags","hdr.settings":"Settings","bird.tag":"Bird tag","bird.sex":"Sex",
"sex.m":"Male","sex.f":"Female","bird.cv":"Genetic deviation","bird.status":"Status",
"bird.alive":"Alive","bird.dead":"Lost","bird.bwNow":"Current weight","bird.fiTotal":"Total feed intake","bird.back":"Back to pen view",
"dash.h":"Validation","dash.h.t":"Performance validation dashboard","dash.p":"Full-cycle runs for every pen reconciled day-by-day against the active breeder catalog",
"exp.h":"Design","exp.h.t":"Broiler trial designer","exp.p":"Define pens, stocking and treatments — the basis for the farm map, biostatistics and exports",
"farm.h":"Animation","farm.h.t":"Live research-house map","farm.p":"Time-scrub the growing cycle with chicks driven by real engine feeder visits",
"sim.h":"Device stream","sim.h.t":"Live device simulator","sim.p":"Moment-by-moment replay of RFID and dual load-cell records in the project schema",
"scn.h":"Scenarios","scn.h.t":"Scenario laboratory","scn.p":"Paired-seed comparisons: heat stress or a second feeding station",
"dev.h":"Hardware","dev.h.t":"Device & data schema","dev.p":"Sensor architecture, queueing logic and record-schema rules",
"sci.h":"Foundations","sci.h.t":"Scientific basis & sources","sci.p":"Peer-reviewed sources, the modeling chain and transparent limitations",
"farm.emptyP":"No cycle generated yet — define pens and treatments in the Trial designer first.",
"farm.goExp":"🧪 Open trial designer",
"h.rows":"records/cycle",

"dash.active":"Active catalog:","dash.source":"Official document ↗",
"kpi.bw":"Final flock weight","kpi.poTarget":"Catalog target","kpi.dev":"deviation",
"kpi.mae":"Weight MAE vs catalog","kpi.maeSub":"Mean absolute error across all pens",
"kpi.fcr":"Window FCR","kpi.ref":"Catalog reference","kpi.visits":"Daily visits per bird",
"ms.deaths":"Cumulative mortality<br>(0.08%/day from d21)","ms.fills":"Bin refills<br>(3 kg → 25 kg)",
"ms.ovl":"Co-feeding events<br>(queue give-up >90 s)","ms.rows":"Device records<br>(3 rows/visit)",
"ch.growth":"Growth curve — simulation vs catalog","ch.intake":"Daily feed intake per bird",
"ch.fcr":"Window FCR by pen size","ch.diurnal":"Diurnal feeding pattern",
"ch.station":"Feeding-station occupancy analysis","ch.valTable":"Daily reconciliation — sim vs catalog",
"ch.liveGrowth":"Live growth vs catalog","ch.liveCum":"Cumulative intake vs target",
"ch.farmGrowth":"Growth by treatment (±SE)","ch.farmFi":"Daily intake by treatment",
"nav.met":"Methodology","met.abstractT":"Abstract",
"met.abstract":"Arian is a discrete-event simulator of a poultry feeding-monitoring station that produces device-level data (RFID + dual load-cell) at three-row resolution per visit. Its visit-based engine is locked onto official performance catalogs of four industrial strains, and sensor physics are calibrated against peer-reviewed literature. Validation against reference tables shows weight MAE of 1\u20132%.",
"met.pipeline":"Data pipeline",
"met.p1":"Strain catalog","met.p1s":"Daily BW/FI male & female",
"met.p2":"Individual model","met.p2s":"CV\u22485% + AR(1) + blocking",
"met.p3":"Visit engine","met.p3s":"Weibull shares + dual peaks",
"met.p4":"Device physics","met.p4s":"Load cells + RFID + queue \u226490s",
"met.p5":"Raw records","met.p5s":"3 rows per visit (12-col schema)",
"met.eqTitle":"Model equations",
"met.e1":"Individual BW = catalog \u00d7 genetic deviation \u00d7 pen effect \u00d7 stress factor",
"met.e2":"First-order autoregressive process for daily fluctuation",
"met.e3":"Visit count = intake \u00f7 eating rate \u00f7 bout duration [5]",
"met.e4":"Bout duration; slope +2.19 s/day [5]",
"met.e5":"Meal-size distribution; most <60 s [7][8]",
"met.e6":"Load-cell model: noise \u03c3\u22484 g and EMA filter",
"met.e7":"RFID signal strength; 0.4% miss rate and 2% weak [7]",
"met.e8":"Pen random effect for realistic replicate variance",
"met.accTitle":"Accuracy matrix \u2014 live","met.accSub":"Full-cycle run per strain vs its own catalog",
"btn.runAcc":"Validate all 4 strains",
"th.strain":"Strain","th.maxDay":"Horizon","th.d42bw":"BW d42 (g)","th.dev":"Dev%","th.visits":"Visits/bird","th.mae":"MAE%",
"met.note":"\ud83d\udca1 Each strain is simulated independently and compared against its own catalog \u2014 no cross-strain duplication. MAE = mean absolute daily-weight deviation from same-day PO; FCR = cumulative intake \u00f7 weight gain over the strain horizon.",
"met.statT":"Statistical method","st.eu":"EU","st.block":"Block","st.test":"Test","st.effect":"Effect","st.power":"Power",
"met.euText":"The pen is the experimental unit; observations within a pen are correlated and inference is performed between pens.",
"met.crnText":"Randomized blocking: the i-th bird of every pen shares attributes so treatment differences reflect real effects, not sampling luck.",
"met.testText":"One-way ANOVA tests the overall effect + pairwise Welch-t comparisons with Holm correction to control FWER.",
"met.etaText":"\u03b7² reports between-group variance share; >0.14 considered large, <0.06 small.",
"met.powerText":"With \u03c3_pen \u2248 1.2% and \u03b1=0.05, detecting a 2% effect requires \u22653 replicates per treatment.",
"met.noiseT":"Sensor uncertainty budget",
"nz.s1":"Commercial platform load-cell spec","nz.s2":"Exponential moving average filter",
"nz.s6":"Individual feeding variability","nz.s7":"Between-pen laboratory variance",
"met.reproT":"Reproducibility",
"met.reproBody":"Every run starts with seed=<code>308</code> and a mulberry32 PRNG; bird blocking draws from an independent stream (<code>seed\u00d77919+13</code>) so all same-treatment pens share identical genetic composition (Common Random Numbers). Result: two runs with the same seed are bit-identical and treatment comparisons reflect only true effects.",
"lg.sim":"Simulation","about.uniT":"Tarbiat Modares University — Animal Science Dept.",
"about.subTitle":"Academic simulator of poultry feeding-monitoring station",
"about.history":"<b>History:</b> This project started from a simple question: how can we design, test and optimise the data-processing algorithm of a feeding-monitoring station without spending on real birds? A Python prototype was built for mathematical validation; the engine was then ported to JavaScript with an interactive web interface so researchers can test scenarios and assess statistical power without installing software.",
"about.teamT":"<b>Team:</b> Designed & programmed by Arsalan Rezazadeh; scientific guidance from the Animal Science Dept., Tarbiat Modares University.",
"about.dataNote":"<b>Data sources:</b> Performance tables for Ross 308, Cobb 500, Arbor Acres Plus, Hubbard EP extracted verbatim from breeder documents. Feeding behaviour calibrated on Poultry Science and animal publications.",
"about.future":"<b>Roadmap:</b> Add Indian River strain, ANCOVA with start weight, PDF statistical report export.","ex.columns":"Daily-summary columns","cp.all":"All","cp.none":"None",
"col.pen":"Pen","col.treat":"Treatment","col.day":"Cycle day","col.alive":"Alive",
"col.bw":"Mean BW (g)","col.fi":"FI/bird (g)","col.fipo":"PO target (g)",
"col.visT":"Visits","col.visB":"Visits/bird","col.busy":"Occupancy %",
"col.ovl":"Co-feedings","col.fill":"Bin refills","col.bin":"Bin end (kg)",
"col.temp":"Temp °C","col.hum":"Humidity %","scn.wave":"Heat wave +{dT}°C, days {from}\u2013{to}","scn.stn2":"Second feeding station","scn.stn1":"Single station (baseline)","scn.dualNote":"With two head-holes, concurrent capacity doubles; queueing and co-feeding events drop sharply and large pens are no longer the bottleneck.","scn.dipSub":"Maximum weight gap on day {age}","st.ovlShort":"Co-feed","exp.totals":"<b>{pens}</b> pens \u00b7 <b>{birds}</b> birds","exp.heavy":"heavy for animation","dyn.presetDone":"Template applied","lg.penMean":"Pen mean","lg.farmMean":"Farm mean","lg.cumSim":"Cumulative intake (sim)","lg.cumPo":"Catalog cumulative target","btn.delPen":"Delete pen","lg.po":"Official catalog","lg.band":"Male–female band","lg.target":"Catalog target",
"lg.hourShare":"Hourly share of intake","lg.dark":"Dark period",
"t.day":"Day","t.simBW":"Sim BW","t.dev":"Dev","t.simFI":"Sim FI","t.status":"Status",
"dash.stationNote":"💡 Design finding: peak-hour saturation becomes significant from 10-bird pens; the 12-bird pen exceeds capacity ⇒ a second station is recommended (see Scenario lab).",

"exp.title":"Trial designer — pens, stocking & treatments","exp.sub":"drives the farm map and exports",
"exp.preset":"Template","exp.penId":"Pen ID","exp.n":"Birds / pen","exp.treat":"Treatment",
"pre.std":"Project standard — six pens 3–12 control","pre.t4x2":"4 treatments × 2 reps — 8 pens × 15",
"pre.heatcmp":"Heat stress — 2 control + 2 heat × 20","pre.vax":"Vaccination effect — 3+3 × 25",
"pre.big":"Single large pen — 50",
"exp.effectsNote":"<b>Treatment effects</b> (directional calibrated coefficients): control = catalog path · probiotic ≈ +1% FI/+1.5% BW · growth promoter ≈ +2%/+2.5% · vaccine transient −10% FI d19–22 · low-protein +4% FI/−2.5% BW · heat stress +5°C wave d32–38.",
"exp.blockNote":"🎲 Randomized blocking is active: the i-th bird of every pen shares attributes, so pen differences reflect true treatment effects. Give each treatment ≥3 replicates (pens) for statistical power.",
"exp.repro":"reproducible runs",
"btn.apply":"↥ Apply template","btn.addPen":"＋ Add pen","btn.buildFarm":"🗺️ Build farm map & run cycle",
"btn.play":"Play","btn.stop":"Stop","btn.pause":"Pause","btn.resume":"Resume","btn.nextDay":"Next day","btn.restart":"Restart d15",
"btn.toEnd":"Skip to end","btn.run":"Run","btn.compare":"Run comparison",
"btn.xlsx":"📊 Full Excel","btn.csvRaw":"⬇ Raw CSV","btn.runStats":"⚡ Run statistics",

"fm.speed":"Time speed","farm.barn":"Research house — live view",
"farm.locked":"each engine visit = one bird move","farm.light":"Lights","farm.darkOff":"Dark","farm.dark":"Dark period — 18L:6D",
"farm.insp":"Inspector —","farm.wholeFarm":"whole farm","farm.ticker":"Event stream",
"sim.speed":"Speed","sim.instant":"Instant","sim.day":"Current day","sim.meanBw":"Pen mean weight",
"sim.fiToday":"Intake today / bird","sim.visits":"Visits","sim.busy":"Station occupancy",
"sim.capacity":"single head-hole capacity","sim.device":"Device — live","sim.stream":"Raw data stream",
"sim.age0":"Start age","sim.age1":"End age","sim.pen":"Pen",

"scn.title":"Comparative scenario designer","scn.paired":"paired seeds — only the scenario factor differs",
"scn.type":"Scenario","scn.heat":"🌡️ Heat stress","scn.stn":"🏗️ Second feeding station",
"scn.from":"Wave start (day)","scn.days":"Duration (days)","scn.config":"Configuration",
"scn.twoSt":"2 stations","scn.oneSt":"1 station (baseline)",
"scn.modelNote":"Calibrated heat assumptions: FI×exp(−0.045·ΔT) during the wave + direct weight loss ≈1.2%/°C with partial post-stress recovery. Coefficients are directional, not absolute; the baseline path equals the validated results exactly.",
"scn.dBw":"Δ final weight","scn.dip":"Maximum event dip","scn.dFcr":"FCR base→scenario",
"scn.dBusy":"Peak occupancy (worst pen)","scn.chGrowth":"Growth baseline vs scenario","scn.base":"Baseline",
"scn.scenario":"Scenario","scn.chFi":"Daily intake baseline vs scenario","scn.table":"Per-pen comparison",
"scn.bwBase":"Base BW","scn.bwScn":"Scenario BW","scn.fcrBase":"Base FCR","scn.fcrScn":"Scenario FCR",
"scn.busyBase":"Base occupancy","scn.busyScn":"Scenario occupancy",

"dev.arch":"Simulated device architecture","dev.schema":"Device record schema",
"dev.lc1":"<b>① Load cell 1 — platform scale:</b> raw noise σ≈4 g on raw_weight_g; EMA filter yields weight_g, matching the user's reference sample.",
"dev.lc2":"<b>② Load cell 2 — 25 kg bin:</b> instantaneous mass drop = intake; automatic refill at the 3 kg trigger.",
"dev.rfid":"<b>③ Wing RFID:</b> identification at entry; 0.4% missed reads, mean RSSI ≈ −65 dBm — consistent with published UHF-RFID accuracy [7].",
"dev.queue":"<b>④ Queue logic:</b> single head-hole; birds wait ≤90 s otherwise a co-feeding event is logged — the bottleneck of large pens.",
"dev.threeRows":"Every visit emits exactly 3 rows (start/mid/end), mirroring the user's three-row sample.",
"dev.excelNote":"<b>The Excel export</b> contains four sheets: daily summary · raw device data · trial design · reference PO — frozen header, RTL views.",
"dev.cycles":"Rearing cycles","dev.newCycle":"New cycle","dev.live":"Live device stream",
"dev.liveNote":"Raw device events (RFID entry + bin load cell + visit timing) arrive live from the backend.",
"dev.stats":"Selected cycle statistics",
"dev.regs":"Live bird-entry registrations",
"dev.regsNote":"Each bird is tag-read on entry; initial weight and the exact date/time of entry are recorded and saved to the database — this panel shows that same data live.",

"sci.sources":"Scientific sources — direct quotations","sci.use1":"weight↔temperature table and lighting program of the model.",
"sci.use2":"Ross Gompertz parameters.","sci.use3":"complete BW/intake/FCR catalogs per strain — verbatim from breeder documents, no cross-strain duplication.",
"sci.use5":"visit engine (−2.21/day; duration +2.19 s/day).","sci.use6":"direction of group-size effect.",
"sci.use7":"RFID model and visit duration.","sci.use8":"dual-peak diurnal rhythm and feeder concurrency.",
"sci.chain":"Modeling chain","st.1":"Step 1","st.2":"Step 2","st.3":"Step 3","st.4":"Step 4","st.5":"Step 5","st.6":"Step 6","st.stat":"Stats","st.out":"Output",
"chain.1":"strain catalog = locked daily target (male/female BW & FI)",
"chain.2":"individual CV≈5% deviation + AR(1) + randomized blocking across pens",
"chain.3":"RFID regressions = visit count/duration (Weibull shares)",
"chain.4":"dual dawn/dusk peaks + 18L:6D photoperiod",
"chain.5":"group size = small calibrated FI/BW adjustment",
"chain.6":"load-cell/RFID physics = noise, EMA, ≤90 s queueing, bin refill",
"chain.7":"pen random effect (~1.2%) → realistic replicate variance for ANOVA/Welch",
"chain.8":"weight MAE ≈ 1–2% against the active strain catalog",
"sci.limits":"Transparency & limitations",
"lim.1":"① The Ross booklet dates to 2007; newer editions differ numerically with identical trends.",
"lim.2":"② Group-size effects within 3–12 birds are largely non-significant; coefficients are small and directional.",
"lim.3":"③ The queue model is simple (≤90 s); real social competition is more complex.",
"lim.4":"④ Mortality modeled as constant daily hazard from d21 [unverified].",
"lim.5":"⑤ Treatment and heat coefficients are calibrated, not extracted directly from sources.",
"lim.6":"⑥ Inference uses the pen as the sampling unit; small n = low power.",
"about.title":"About & ownership",
"about.body":"Arian v1.0.0 — designed and maintained by <b>Arsalan Rezazadeh</b>. An academic simulator of an RFID + dual load-cell feeding station for industrial broiler strains using official Aviagen / Cobb-Vantress / Hubbard catalogs, a visit-based engine and a biostatistics laboratory. Fully offline, server-less, reproducible seed.",
"landing.badge":"Intelligent feed-intake & environmental control platform",
"landing.typed":"Integrated intelligent breeding & broiler rearing management platform",
"landing.register":"Free sign-up","landing.login":"Sign in","landing.guest":"See overview",
"landing.stat.24h":"24/7","landing.stat.trials":"Trial designs","landing.stat.lab":"Virtual labs",
"landing.stat.live":"Live device data","landing.stat.user":"User-isolated data",
"landing.card.dash.t":"Validation dashboard","landing.card.dash.p":"Live comparison of simulation vs. breeder catalog with growth curves and feed-conversion per user.",
"landing.card.exp.t":"Trial designer","landing.card.exp.p":"Define rearing cycles, treatment groups and replicates — each cycle fully isolated in your account.",
"landing.card.farm.t":"Live farm map","landing.card.farm.p":"Pen layouts, sensors and live house status — data isolated per user.",
"landing.card.sim.t":"Live simulation","landing.card.sim.p":"Run a scenario with an isolated seed and watch results in real time.",
"landing.card.scn.t":"Scenarios","landing.card.scn.p":"Save, compare and replay personalised scenarios with full result review.",
"landing.card.dev.t":"Device & data","landing.card.dev.p":"Automatic capture of monitoring devices — fully user-isolated and secure.",
"landing.foot.p":"Sign in to access dashboards, trials and device data. All data and simulations are fully isolated per account.",
"landing.foot.btn":"Sign in & start",
"landing.live.b":"Live data · 24h","landing.live.s":"User-isolated & secure","landing.iso":"Isolated",
"ws.title":"Arian workspace","ws.subtitle":"Signed in — your data is fully isolated",
"ws.badge.user":"User","ws.badge.admin":"Admin","ws.badge.active":"Active · User-isolated",
"ws.stat.cycles":"Cycles","ws.stat.scenarios":"Scenarios","ws.stat.device":"Device rows","ws.stat.live":"Live data",
"ws.card.dash.t":"Validation dashboard","ws.card.dash.p":"Simulation vs. real data and growth chart",
"ws.card.exp.t":"Trial designer","ws.card.exp.p":"Define cycles, treatments and replicates",
"ws.card.farm.t":"Live farm map","ws.card.farm.p":"Pen & sensor live layout",
"ws.card.sim.t":"Live simulation","ws.card.sim.p":"Run a scenario with live results",
"ws.card.scn.t":"Scenarios","ws.card.scn.p":"Save, compare and replay",
"ws.card.dev.t":"Device & data","ws.card.dev.p":"Automatic data capture — user-isolated",
"ws.card.sci.t":"Scientific basis","ws.card.sci.p":"Growth & feed-intake models",
"ws.card.met.t":"Methodology","ws.card.met.p":"Measurement & validation methods",
"ws.go":"Open","ws.btn.dash":"Go to dashboard","ws.btn.logout":"Sign out","ws.btn.home":"Back to home",
"prod.hero.t":"Arian — Products & Services","prod.hero.p":"Intelligent broiler breeding & rearing platforms — from precise pen-level data capture to automated house environment control; built for research centres, breeder units and commercial farms.",
"prod.p1.tag":"Product 1","prod.p1.t":"Feed Intake Monitoring System","prod.p1.d":"Automatic recording of each bird visit at the feeder with electronic ID and simultaneous weighing; precise individual intake, continuous weighing and intelligent meal detection — without human intervention and without flock stress.",
"prod.p1.f1":"Electronic ID per bird with wing tag and instant entry/exit logging","prod.p1.f2":"Weighing sensors with noise smoothing and gram-level accuracy","prod.p1.f3":"Automatic individual intake, visit count and meal closure","prod.p1.f4":"Rearing-cycle management with fully user-isolated data","prod.p1.f5":"Automatic data logging and live stream to the dashboard",
"prod.p1.status":"Active · 24h live data","prod.p2.tag":"Product 2","prod.p2.t":"Intelligent Environmental Control System","prod.p2.d":"Automated monitoring and control of house temperature, humidity and ventilation to official breeder standards; intelligent environment per age, reduced heat stress and improved feed conversion — all from a single dashboard.",
"prod.p2.f1":"Temperature & humidity sensors with continuous point logging","prod.p2.f2":"Automated ventilation & heating control per flock age","prod.p2.f3":"Instant alerts when outside the strain standard range","prod.p2.f4":"Configurable & testable environmental scenarios","prod.p2.f5":"Periodic reporting aligned with strain performance targets",
"prod.p2.status":"Active · 24h monitoring","prod.demo":"View demo",
"auth.welcome":"Welcome ","auth.workspace":"Workspace","auth.changePass":"Change password","auth.logout":"Sign out",
"auth.loggedOut":"Signed out","auth.loginTitle":"Sign in","auth.loginTab":"Sign in","auth.registerTab":"Sign up",
"auth.identLabel":"Email or username","auth.passLabel":"Password","auth.loginBtn":"Sign in",
"auth.hintNoAccount":"No account?","auth.hintRegister":"Sign up","auth.hintHasAccount":"Have an account?","auth.hintLogin":"Sign in",
"auth.nameLabel":"Full name","auth.emailLabel":"Email *","auth.usernameLabel":"Username","auth.passLabel2":"Password *","auth.confirmPassLabel":"Confirm password","auth.registerBtn":"Sign up",
"auth.errIdentPass":"Email and password are required","auth.errPassShort":"Password must be ≥6 characters","auth.errPassMismatch":"Passwords do not match",
"auth.errLoginFail":"Sign-in failed","auth.errRegisterFail":"Sign-up failed","auth.changeTitle":"Change password","auth.changeMsg":"Enter your current and new password.",
"auth.changePh1":"Current password","auth.changePh2":"New password (≥6 characters)","auth.changeBtn":"Change password","auth.changeOk":"Password changed successfully.","auth.changeFail":"Failed to change password",
"auth.promptOld":"Enter current password:","auth.promptNew":"New password (≥6 chars):","auth.alertShort":"Password too short","auth.alertOk":"Password changed successfully",
"dev.empty":"No cycles yet.","dev.birds":"birds","dev.delete":"Delete","dev.deleteTitle":"Delete cycle","dev.deleteMsg":"Delete cycle {code} and all its data?\nThis cannot be undone.","dev.deleteConfirm":"Delete","dev.backendError":"Backend connection error: ","dev.codeRequired":"Cycle code and label are required","dev.created":"Cycle {code} created","dev.regEmpty":"No live entries yet.<br>Birds appear here on entry.",
"dialog.cancel":"Cancel","dialog.confirm":"Confirm","dialog.ok":"OK","dialog.required":"This field is required","dialog.oldRequired":"Current password is required","dialog.newRequired":"New password is required","dialog.newShort":"New password must be ≥6 characters",
"toast.needLogin":"Please sign in to access this section","ws.role.user":"User","ws.role.admin":"Admin",
"foot.data":"Data: Aviagen · Cobb-Vantress · Hubbard · Poultry Science · animal · Arch Anim Breed",
"foot.offline":"Fully offline · reproducible seed = 308 · statistical unit: pen",

/* ---- dynamic ---- */
"dyn.ready":"Ready — visit engine calibrated on the active catalog",
"dyn.running":"Running — \u2066{pen}\u2069 · day {day} · \u2066{date}\u2069",
"dyn.gen":"Generating data…",
"dyn.done":"✅ Finished — {rows} records · final BW \u2066{bw} g\u2069 · FCR \u2066{fcr}\u2069",
"dyn.paused":"Paused — resume or export whenever you like",
"dyn.records":"{n} records",
"dyn.csvDone":"{n} records exported to CSV",
"dyn.xlsxBuilding":"Building Excel workbook…",
"dyn.xlsxDone":"Excel ready — summary, raw data, design and PO sheets",
"dyn.noData":"Nothing to export yet",
"dyn.badRange":"Start age must be lower than end age",
"dyn.rangeLimit":"Allowed range for this strain: 10–{max} days",
"dyn.stale":"⚠️ Trial design changed — rebuild the farm map.",
"dyn.built":"🌱 Cycle generated — {birds} birds in {pens} pens · strain \u2066{strain}\u2069",
"dyn.playing":"Playing — click any pen to open the inspector",
"dyn.finished":"🏁 Cycle complete — results in the inspector and charts",
"dyn.rebuilt":"🔄 Back to day 15",
"dyn.death":"☠ Mortality \u2066{id}\u2069 in \u2066{pen}\u2069 (day {age})",
"dyn.refill":"🛢 Bin refill {pen}{x}",
"dyn.vaxDay":"💉 Vaccination (d19–22) — transient ~10% intake drop",
"dyn.heatDay":"🔥 Heat wave started for the stress treatment (+5°C until d38)",
"dyn.maxBirds":"Animation cap is 400 birds — lighten the design",
"dyn.bigCsv":"Raw CSV disabled above 250 birds (size)",
"dyn.bigXlsx":"Large flock — raw-data sheet skipped",
"dyn.buildingRaw":"Generating raw data…",
"dyn.scnDone":"Scenario comparison finished",
"val.excellent":"excellent","val.ok":"acceptable","val.review":"review",
"ver.free":"free","ver.near":"near-saturated","ver.bottle":"peak bottleneck",
"fcr.note":"Pen FCRs range <b>{lo}</b>–<b>{hi}</b> — natural spread of sex mix and group size; worst saturation: <b>{worst}</b> at <b>{peak}%</b>.",
"tr.control":"Control","tr.probiotic":"Probiotic","tr.agp":"Growth promoter",
"tr.vaccine":"Vaccine d19–22","tr.lowprot":"Low protein","tr.heat":"Heat stress d32–38",
"insp.treat":"Treatment","insp.meanBw":"Mean weight","insp.vsPO":"vs PO",
"insp.fiToday":"Intake today/bird","insp.visitsToday":"Visits today",
"insp.perBird":"/bird","insp.busy":"Station occupancy","insp.bin":"Bin level",
"insp.refills":"Refills to date","insp.ovl":"Co-feedings to date","insp.mort":"Mortality this pen",
"insp.pensAlive":"Pens / birds alive","insp.farmBw":"Farm mean weight",
"insp.farmFiToday":"Total intake today","insp.totalVisits":"Visits today",
"insp.todayRefills":"Bin refills today","insp.totalDeaths":"Total mortality","insp.todayOvl":"Co-feedings today",
"bio.descTable":"Descriptive statistics by treatment","bio.anovaTitle":"One-way ANOVA",
"bio.pairwise":"Pairwise Welch t-tests (Holm-adjusted)","bio.metricCol":"Variable","bio.nCol":"n(pens)",
"bio.meanCol":"Mean±SD","bio.seCol":"SE","bio.ciCol":"95% CI",
"bio.noReps":"Inference needs ≥2 treatments with ≥2 replicates each.",
"bio.method":"Sampling unit = pen (experimental). Pairwise tests use Welch's t with Holm correction; * p<0.05, ** p<0.01, *** p<0.001; η² is the ANOVA effect size.",
"bio.anovaLine":"F({dfB},{dfW}) = {F} · p = {p} · η² = {eta2}",
"scn.noteHeat":"🌡️ {label} — maximum weight dip <b>{dip}%</b> on day {age}; final weight {dir}<b>{dbw}%</b>. Intake falls up to ~25% during the wave with partial compensatory recovery afterwards (window FCR may change little).",
"scn.noteStn":"🏗️ {label} — worst-pen peak occupancy moved from <b>{from}%</b> to <b>{to}%</b>; whole-flock co-feedings: {ovlB} → <b>{ovlS}</b>. Reproduces the REPORT.md design finding.",
"scn.fcrSub":"small change due to post-stress compensation",
"scn.busySub":"worst pen: {pen}","hdr.clockTitle":"Current date & time","hdr.strainAria":"Strain","hdr.settingsAria":"Settings","ws.aria":"Workspace","ws.prefix":"Workspace — ","ws.isolated":" — your data is fully isolated","ws.role.admin":"Admin","dev.stat.visits":"Visits","dev.stat.birds":"Unique birds","dev.stat.rows":"Device rows","dev.stat.intake":"Total intake (g)","dev.stat.avgw":"Mean initial weight (g)","dev.stat.miss":"Lost IDs","dev.live":"Live","dev.reg.bird":"Bird","dev.reg.weight":"Initial weight","dev.reg.date":"Date","dev.reg.time":"Time","dev.reg.sensor":"Sensor","dev.reg.tag":"Tag / Bird ID","form.codeLabel":"Cycle code (e.g. F01)","form.nameLabel":"Cycle name","form.strainAria":"Strain","day.prefix":"Day ","bird.unknown":"???","btn.pause":"⏸ Pause","bw.base":"base: ","bw.lower":"lower than baseline ","bw.higher":"higher than baseline ","footer.brand":"Arian v1.0.0","footer.copyright":"© 2026 Arsalan Rezazadeh","sci.effectTitle":"Treatment effects"
}
};
let LANG="fa";
try{LANG=localStorage.getItem("rossim_lang")==="en"?"en":"fa"}catch(e){}
function tr(key){const d=I18N[LANG]||I18N.fa;return d[key]??I18N.fa[key]??key}
function trf(key,vars){let s=tr(key);
  for(const k in (vars||{}))s=s.split("{"+k+"}").join(vars[k]);return s}
/* locale-aware number formatter driven by LANG */
function num(v,d=0){
  const loc=LANG==="fa"?"fa-IR":"en-US";
  return new Intl.NumberFormat(loc,{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)}
/* plain integer/float formatter that follows LANG (no thousands grouping) */
function lnum(v,d=0){
  if(v==null||isNaN(v))return "—";
  const s=Number(v).toFixed(d);
  if(LANG==="fa"){
    const FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
    return s.replace(/[0-9]/g,c=>FA[+c]);
  }
  return s;
}
/* centralized locale-aware formatters — single source for numbers/dates/times */
function formatNumber(v,d=0){ return num(v,d) }
function formatDate(input, opts){
  // opts: {longMonth:boolean, withTime:boolean}
  opts=opts||{};
  try{
    if(LANG==="fa" && window.Shamsi && typeof window.Shamsi.toShamsi==="function"){
      return window.Shamsi.toShamsi(input, opts);
    }
    var dt=(input instanceof Date)?input:new Date(input);
    if(isNaN(dt)) return String(input);
    if(opts.longMonth){
      return new Intl.DateTimeFormat(LANG==="fa"?"fa-IR":"en-US",{year:"numeric",month:"long",day:"numeric"}).format(dt);
    }
    return new Intl.DateTimeFormat(LANG==="fa"?"fa-IR":"en-US",{year:"numeric",month:"2-digit",day:"2-digit"}).format(dt);
  }catch(e){ return String(input) }
}
function formatTime(input){
  try{
    var dt=(input instanceof Date)?input:new Date(input);
    if(isNaN(dt)) dt=new Date();
    var s=String(dt.getHours()).padStart(2,"0")+":"+String(dt.getMinutes()).padStart(2,"0");
    if(dt.getSeconds) s+=":"+String(dt.getSeconds()).padStart(2,"0");
    if(LANG==="fa"){
      var FA=["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
      return s.replace(/[0-9]/g,function(c){return FA[+c]});
    }
    return s;
  }catch(e){ return "" }
}
function formatDateTime(input, opts){
  opts=opts||{};
  var d=formatDate(input, opts);
  var t=formatTime(input);
  return d+" "+t;
}
function formatRelativeTime(value, unit){
  // value: numeric, unit: "second"|"minute"|"hour"|"day"|"week"|"month"|"year"
  try{
    var loc=LANG==="fa"?"fa-IR":"en-US";
    if(typeof Intl.RelativeTimeFormat==="function"){
      var rtf=new Intl.RelativeTimeFormat(loc,{numeric:"auto", style:"long"});
      return rtf.format(value, unit);
    }
  }catch(e){}
  // fallback simple
  if(LANG==="fa"){
    var map={second:"ثانیه",minute:"دقیقه",hour:"ساعت",day:"روز",week:"هفته",month:"ماه",year:"سال"};
    var u=map[unit]||unit;
    if(value===0) return "همین الان";
    if(value<0) return Math.abs(value)+" "+u+" پیش";
    return value+" "+u+" بعد";
  } else {
    if(value===0) return "now";
    if(value<0) return Math.abs(value)+" "+unit+(Math.abs(value)!==1?"s":"")+" ago";
    return "in "+value+" "+unit+(value!==1?"s":"");
  }
}
function formatCurrency(v,currency){
  currency=currency||"IRR";
  try{
    var loc=LANG==="fa"?"fa-IR":"en-US";
    return new Intl.NumberFormat(loc,{style:"currency",currency:currency, minimumFractionDigits:0, maximumFractionDigits:0}).format(v);
  }catch(e){ return num(v,0)+" "+currency }
}
function formatPercent(v,d){ return lnum(v,d)+"%" }
// expose globally for app components
try{ window.formatNumber=formatNumber; window.formatDate=formatDate; window.formatTime=formatTime; window.formatDateTime=formatDateTime; window.formatRelativeTime=formatRelativeTime; window.formatCurrency=formatCurrency; window.formatPercent=formatPercent; }catch(e){}

function applyLang(){
  document.documentElement.lang=LANG;
  document.documentElement.dir=LANG==="fa"?"rtl":"ltr";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    if(el.id==="landing-typed")return; // owned by typing effect module (restarts on rossim:lang)
    el.textContent=tr(el.dataset.i18n)});
  document.querySelectorAll("[data-i18n-html]").forEach(el=>{el.innerHTML=tr(el.dataset.i18nHtml)});
  document.querySelectorAll("[data-title-i18n]").forEach(el=>{
    el.title=tr(el.dataset.titleI18n);
    el.setAttribute("aria-label",tr(el.dataset.titleI18n))});
  document.querySelectorAll("[data-alt-i18n]").forEach(el=>{el.alt=tr(el.dataset.altI18n)});
  if(window.Router&&window.Router.syncTitle){window.Router.syncTitle();}
  else{const t=document.querySelector("title");if(t)t.textContent=tr("app.title");}
  $("lang-fa").classList.toggle("on",LANG==="fa");
  $("lang-en").classList.toggle("on",LANG==="en");
  $("lang-fa-dd").classList.toggle("on",LANG==="fa");
  $("lang-en-dd").classList.toggle("on",LANG==="en");
}
function setLang(l){if(LANG===l)return;LANG=l;
  try{localStorage.setItem("rossim_lang",l)}catch(e){}
  try{window.dispatchEvent(new CustomEvent("rossim:lang",{detail:l}))}catch(e){}
  applyLang();
  try{
    if(typeof updateLandingCTA==="function")try{updateLandingCTA()}catch(e){}
    if(typeof renderAuthArea==="function")try{renderAuthArea()}catch(e){}
    if(typeof renderWorkspace==="function")try{renderWorkspace()}catch(e){}
    if(typeof expRender==="function")expRender();
    if(typeof DASH!=="undefined"&&DASH)runDashboard();
    if(typeof FM!=="undefined"&&FM&&!FM.stale){
      document.querySelectorAll(".penbox").forEach(box=>{
        const pm=FM.run.pensMeta.find(x=>x.pid===box.dataset.pen);if(!pm)return;
        const chip=box.querySelector(".penhead .tchip");
        if(chip)chip.textContent=tr("tr."+pm.treat)+" · "+num(pm.n)});
      renderInspector();renderFarmCharts();updateFarmDay(true);
      if(typeof setPlaying==="function")setPlaying(FM.playing);
      const fl2=document.getElementById("fm-lbl");
      if(fl2)fl2.textContent=FM.stale?tr("dyn.stale"):tr("dyn.playing");
      const bo=document.getElementById("bio-out");
      if(bo&&bo.innerHTML)runBioStats();
      const tk=document.getElementById("ticker");
      if(tk)tk.innerHTML=""}
    const sr=document.getElementById("scn-res");
    if(sr&&sr.style.display!=="none"){
      const bs=document.getElementById("btn-scn");if(bs)bs.click()}
  }catch(e){}
  requestAnimationFrame(()=>requestAnimationFrame(()=>repaintView(CUR_VIEW)))}
// initial apply on load — ensure html lang/dir and translations match stored LANG
try{
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", function(){ try{applyLang()}catch(e){} });
  } else { try{applyLang()}catch(e){} }
}catch(e){}
