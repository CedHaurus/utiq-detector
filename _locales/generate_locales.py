#!/usr/bin/env python3
"""
Generate the _locales/<lang>/messages.json files for the Utiq Detector extension.

A single source of truth (the T dict) -> one messages.json per language.
Language codes follow Chrome (https://developer.chrome.com/docs/extensions/reference/api/i18n#locales).

Usage: python3 generate_locales.py
"""

import json
import os

# Key order (= write order in each file)
KEYS = [
    "extensionName", "extensionDescription",
    "popupDetected", "popupClean", "popupUnknown", "popupUnknownSite",
    "popupSitesLabel", "popupMoreInfo", "popupOptout",
    "popupReportPrompt", "popupReportBtn", "popupReporting",
    "popupReported", "popupKnown", "popupReportError",
    "toastTitle", "toastLink",
]

NAME = "Utiq Detector"

# Each language: tuple of 16 strings (all keys except extensionName, which is fixed).
# Order: desc, detected, clean, unknown, unknownSite, sitesLabel, moreInfo,
#        optout, reportPrompt, reportBtn, reporting, reported, known,
#        reportError, toastTitle, toastLink
T = {
"fr": ("Détecte si un site utilise Utiq, le pistage publicitaire des opérateurs télécom, et vous avertit.","utilise Utiq (pistage opérateur)","n'utilise pas Utiq","Analyse en cours…","ce site","sites","Plus d'infos sur Utiq Tracker →","Se désinscrire d'Utiq →","🔍 Ce site n'est pas encore dans notre liste.<br><strong>Aidez-nous à le référencer !</strong>","Signaler ce site","Envoi…","✓ Merci ! Ce site sera bientôt ajouté à la liste.","✓ Ce site est déjà en cours d'ajout.","Erreur, réessaie dans quelques instants.","Ce site utilise Utiq","En savoir plus →"),
"en": ("Detects whether a website uses Utiq, the telco advertising tracker, and warns you.","uses Utiq (telco tracking)","does not use Utiq","Analysing…","this site","sites","More info on Utiq Tracker →","Opt out of Utiq →","🔍 This site is not in our list yet.<br><strong>Help us reference it!</strong>","Report this site","Sending…","✓ Thanks! This site will soon be added to the list.","✓ This site is already being added.","Error, please try again in a moment.","This site uses Utiq","Learn more →"),
"de": ("Erkennt, ob eine Website Utiq verwendet, das Werbe-Tracking der Telekommunikationsanbieter, und warnt Sie.","verwendet Utiq (Anbieter-Tracking)","verwendet kein Utiq","Wird analysiert…","diese Website","Websites","Mehr Infos auf Utiq Tracker →","Utiq abbestellen →","🔍 Diese Website ist noch nicht in unserer Liste.<br><strong>Helfen Sie uns, sie zu erfassen!</strong>","Diese Website melden","Wird gesendet…","✓ Danke! Diese Website wird bald zur Liste hinzugefügt.","✓ Diese Website wird bereits hinzugefügt.","Fehler, bitte versuchen Sie es gleich noch einmal.","Diese Website verwendet Utiq","Mehr erfahren →"),
"es": ("Detecta si un sitio utiliza Utiq, el rastreo publicitario de los operadores de telecomunicaciones, y te avisa.","utiliza Utiq (rastreo de operador)","no utiliza Utiq","Analizando…","este sitio","sitios","Más información en Utiq Tracker →","Darse de baja de Utiq →","🔍 Este sitio aún no está en nuestra lista.<br><strong>¡Ayúdanos a registrarlo!</strong>","Reportar este sitio","Enviando…","✓ ¡Gracias! Este sitio se añadirá pronto a la lista.","✓ Este sitio ya se está añadiendo.","Error, inténtalo de nuevo en un momento.","Este sitio utiliza Utiq","Más información →"),
"it": ("Rileva se un sito utilizza Utiq, il tracciamento pubblicitario degli operatori telefonici, e ti avvisa.","utilizza Utiq (tracciamento operatore)","non utilizza Utiq","Analisi in corso…","questo sito","siti","Maggiori info su Utiq Tracker →","Disiscriviti da Utiq →","🔍 Questo sito non è ancora nella nostra lista.<br><strong>Aiutaci a registrarlo!</strong>","Segnala questo sito","Invio…","✓ Grazie! Questo sito verrà presto aggiunto alla lista.","✓ Questo sito è già in fase di aggiunta.","Errore, riprova tra un momento.","Questo sito utilizza Utiq","Scopri di più →"),
"pt": ("Deteta se um site utiliza o Utiq, o rastreio publicitário dos operadores de telecomunicações, e avisa-o.","utiliza Utiq (rastreio do operador)","não utiliza Utiq","A analisar…","este site","sites","Mais informações no Utiq Tracker →","Cancelar subscrição do Utiq →","🔍 Este site ainda não está na nossa lista.<br><strong>Ajude-nos a referenciá-lo!</strong>","Reportar este site","A enviar…","✓ Obrigado! Este site será em breve adicionado à lista.","✓ Este site já está a ser adicionado.","Erro, tente novamente dentro de momentos.","Este site utiliza Utiq","Saber mais →"),
"pt_BR": ("Detecta se um site usa o Utiq, o rastreamento publicitário das operadoras de telecomunicações, e avisa você.","usa Utiq (rastreamento da operadora)","não usa Utiq","Analisando…","este site","sites","Mais informações no Utiq Tracker →","Cancelar inscrição no Utiq →","🔍 Este site ainda não está na nossa lista.<br><strong>Ajude-nos a referenciá-lo!</strong>","Denunciar este site","Enviando…","✓ Obrigado! Este site será adicionado à lista em breve.","✓ Este site já está sendo adicionado.","Erro, tente novamente em instantes.","Este site usa Utiq","Saiba mais →"),
"nl": ("Detecteert of een website Utiq gebruikt, de advertentietracking van telecomoperators, en waarschuwt je.","gebruikt Utiq (telecom-tracking)","gebruikt geen Utiq","Bezig met analyseren…","deze site","sites","Meer info op Utiq Tracker →","Afmelden voor Utiq →","🔍 Deze site staat nog niet in onze lijst.<br><strong>Help ons hem toe te voegen!</strong>","Deze site melden","Bezig met verzenden…","✓ Bedankt! Deze site wordt binnenkort aan de lijst toegevoegd.","✓ Deze site wordt al toegevoegd.","Fout, probeer het zo meteen opnieuw.","Deze site gebruikt Utiq","Meer informatie →"),
"pl": ("Wykrywa, czy witryna korzysta z Utiq, reklamowego śledzenia operatorów telekomunikacyjnych, i ostrzega Cię.","korzysta z Utiq (śledzenie operatora)","nie korzysta z Utiq","Analizowanie…","ta witryna","witryn","Więcej informacji w Utiq Tracker →","Zrezygnuj z Utiq →","🔍 Tej witryny nie ma jeszcze na naszej liście.<br><strong>Pomóż nam ją dodać!</strong>","Zgłoś tę witrynę","Wysyłanie…","✓ Dziękujemy! Ta witryna zostanie wkrótce dodana do listy.","✓ Ta witryna jest już dodawana.","Błąd, spróbuj ponownie za chwilę.","Ta witryna korzysta z Utiq","Dowiedz się więcej →"),
"cs": ("Zjišťuje, zda web používá Utiq, reklamní sledování telekomunikačních operátorů, a upozorní vás.","používá Utiq (sledování operátora)","nepoužívá Utiq","Analyzuji…","tento web","webů","Více informací na Utiq Tracker →","Odhlásit se z Utiq →","🔍 Tento web zatím není v našem seznamu.<br><strong>Pomozte nám ho zaznamenat!</strong>","Nahlásit tento web","Odesílání…","✓ Děkujeme! Tento web bude brzy přidán do seznamu.","✓ Tento web se již přidává.","Chyba, zkuste to za okamžik znovu.","Tento web používá Utiq","Více informací →"),
"sk": ("Zisťuje, či webová lokalita používa Utiq, reklamné sledovanie telekomunikačných operátorov, a upozorní vás.","používa Utiq (sledovanie operátora)","nepoužíva Utiq","Analyzujem…","táto lokalita","lokalít","Viac informácií na Utiq Tracker →","Odhlásiť sa z Utiq →","🔍 Táto lokalita zatiaľ nie je v našom zozname.<br><strong>Pomôžte nám ju zaznamenať!</strong>","Nahlásiť túto lokalitu","Odosielanie…","✓ Ďakujeme! Táto lokalita bude čoskoro pridaná do zoznamu.","✓ Táto lokalita sa už pridáva.","Chyba, skúste to o chvíľu znova.","Táto lokalita používa Utiq","Viac informácií →"),
"ro": ("Detectează dacă un site folosește Utiq, urmărirea publicitară a operatorilor de telecomunicații, și te avertizează.","folosește Utiq (urmărire operator)","nu folosește Utiq","Se analizează…","acest site","site-uri","Mai multe informații pe Utiq Tracker →","Renunță la Utiq →","🔍 Acest site nu este încă în lista noastră.<br><strong>Ajută-ne să îl înregistrăm!</strong>","Raportează acest site","Se trimite…","✓ Mulțumim! Acest site va fi adăugat în curând în listă.","✓ Acest site este deja în curs de adăugare.","Eroare, încearcă din nou peste un moment.","Acest site folosește Utiq","Află mai multe →"),
"hu": ("Felismeri, ha egy webhely Utiq-ot használ – a távközlési szolgáltatók hirdetési nyomkövetését –, és figyelmeztet.","Utiq-ot használ (szolgáltatói nyomkövetés)","nem használ Utiq-ot","Elemzés…","ez a webhely","webhely","További információ az Utiq Trackeren →","Leiratkozás az Utiq-ról →","🔍 Ez a webhely még nem szerepel a listánkban.<br><strong>Segíts felvenni!</strong>","Webhely jelentése","Küldés…","✓ Köszönjük! Ez a webhely hamarosan bekerül a listába.","✓ Ez a webhely már hozzáadás alatt áll.","Hiba, próbáld újra egy pillanat múlva.","Ez a webhely Utiq-ot használ","Tudj meg többet →"),
"el": ("Εντοπίζει αν ένας ιστότοπος χρησιμοποιεί το Utiq, τη διαφημιστική παρακολούθηση των τηλεπικοινωνιακών παρόχων, και σας προειδοποιεί.","χρησιμοποιεί Utiq (παρακολούθηση παρόχου)","δεν χρησιμοποιεί Utiq","Ανάλυση…","αυτός ο ιστότοπος","ιστότοποι","Περισσότερα στο Utiq Tracker →","Εξαίρεση από το Utiq →","🔍 Αυτός ο ιστότοπος δεν είναι ακόμη στη λίστα μας.<br><strong>Βοηθήστε μας να τον καταχωρίσουμε!</strong>","Αναφορά ιστότοπου","Αποστολή…","✓ Ευχαριστούμε! Ο ιστότοπος θα προστεθεί σύντομα στη λίστα.","✓ Ο ιστότοπος προστίθεται ήδη.","Σφάλμα, δοκιμάστε ξανά σε λίγο.","Αυτός ο ιστότοπος χρησιμοποιεί Utiq","Μάθετε περισσότερα →"),
"ru": ("Определяет, использует ли сайт Utiq — рекламное отслеживание телеком-операторов — и предупреждает вас.","использует Utiq (отслеживание оператора)","не использует Utiq","Анализ…","этот сайт","сайтов","Подробнее на Utiq Tracker →","Отказаться от Utiq →","🔍 Этого сайта ещё нет в нашем списке.<br><strong>Помогите нам его добавить!</strong>","Сообщить о сайте","Отправка…","✓ Спасибо! Сайт скоро будет добавлен в список.","✓ Сайт уже добавляется.","Ошибка, повторите попытку чуть позже.","Этот сайт использует Utiq","Подробнее →"),
"uk": ("Визначає, чи використовує сайт Utiq — рекламне відстеження телеком-операторів — і попереджає вас.","використовує Utiq (відстеження оператора)","не використовує Utiq","Аналіз…","цей сайт","сайтів","Докладніше на Utiq Tracker →","Відмовитися від Utiq →","🔍 Цього сайту ще немає в нашому списку.<br><strong>Допоможіть нам його додати!</strong>","Повідомити про сайт","Надсилання…","✓ Дякуємо! Сайт незабаром буде додано до списку.","✓ Сайт уже додається.","Помилка, спробуйте ще раз за мить.","Цей сайт використовує Utiq","Дізнатися більше →"),
"tr": ("Bir sitenin Utiq'i (telekom operatörlerinin reklam takibi) kullanıp kullanmadığını algılar ve sizi uyarır.","Utiq kullanıyor (operatör takibi)","Utiq kullanmıyor","Analiz ediliyor…","bu site","site","Utiq Tracker'da daha fazla bilgi →","Utiq'ten çık →","🔍 Bu site henüz listemizde değil.<br><strong>Kaydetmemize yardım edin!</strong>","Bu siteyi bildir","Gönderiliyor…","✓ Teşekkürler! Bu site yakında listeye eklenecek.","✓ Bu site zaten ekleniyor.","Hata, birazdan tekrar deneyin.","Bu site Utiq kullanıyor","Daha fazla bilgi →"),
"ar": ("يكتشف ما إذا كان الموقع يستخدم Utiq، تتبّع الإعلانات الخاص بمشغّلي الاتصالات، وينبّهك.","يستخدم Utiq (تتبّع المشغّل)","لا يستخدم Utiq","جارٍ التحليل…","هذا الموقع","مواقع","مزيد من المعلومات على Utiq Tracker ←","إلغاء الاشتراك في Utiq ←","🔍 هذا الموقع ليس في قائمتنا بعد.<br><strong>ساعدنا في إضافته!</strong>","الإبلاغ عن هذا الموقع","جارٍ الإرسال…","✓ شكرًا! ستتم إضافة هذا الموقع إلى القائمة قريبًا.","✓ تتم إضافة هذا الموقع بالفعل.","خطأ، حاول مرة أخرى بعد لحظات.","هذا الموقع يستخدم Utiq","اعرف المزيد ←"),
"he": ("מזהה אם אתר משתמש ב-Utiq, מעקב הפרסום של מפעילי הסלולר, ומזהיר אותך.","משתמש ב-Utiq (מעקב מפעיל)","אינו משתמש ב-Utiq","מנתח…","אתר זה","אתרים","מידע נוסף ב-Utiq Tracker ←","ביטול הסכמה ל-Utiq ←","🔍 האתר הזה עדיין לא ברשימה שלנו.<br><strong>עזרו לנו להוסיף אותו!</strong>","דווח על אתר זה","שולח…","✓ תודה! האתר יתווסף לרשימה בקרוב.","✓ האתר כבר בתהליך הוספה.","שגיאה, נסה שוב בעוד רגע.","האתר הזה משתמש ב-Utiq","מידע נוסף ←"),
"fa": ("تشخیص می‌دهد که آیا یک وب‌سایت از Utiq، ردیابی تبلیغاتی اپراتورهای مخابراتی، استفاده می‌کند و به شما هشدار می‌دهد.","از Utiq استفاده می‌کند (ردیابی اپراتور)","از Utiq استفاده نمی‌کند","در حال تحلیل…","این سایت","سایت","اطلاعات بیشتر در Utiq Tracker ←","انصراف از Utiq ←","🔍 این سایت هنوز در فهرست ما نیست.<br><strong>به ما در ثبت آن کمک کنید!</strong>","گزارش این سایت","در حال ارسال…","✓ ممنون! این سایت به‌زودی به فهرست افزوده می‌شود.","✓ این سایت در حال افزوده‌شدن است.","خطا، چند لحظه دیگر دوباره تلاش کنید.","این سایت از Utiq استفاده می‌کند","بیشتر بدانید ←"),
"ja": ("ウェブサイトが通信事業者の広告トラッキング「Utiq」を使用しているか検出して警告します。","Utiq を使用（通信事業者トラッキング）","Utiq を使用していません","分析中…","このサイト","サイト","Utiq Tracker で詳細 →","Utiq をオプトアウト →","🔍 このサイトはまだ一覧にありません。<br><strong>登録にご協力ください！</strong>","このサイトを報告","送信中…","✓ ありがとうございます！このサイトはまもなく一覧に追加されます。","✓ このサイトはすでに追加処理中です。","エラーです。しばらくして再試行してください。","このサイトは Utiq を使用しています","詳しく見る →"),
"ko": ("웹사이트가 통신사 광고 추적기 Utiq를 사용하는지 감지하고 알려줍니다.","Utiq 사용 중(통신사 추적)","Utiq를 사용하지 않음","분석 중…","이 사이트","개 사이트","Utiq Tracker에서 자세히 보기 →","Utiq 수신 거부 →","🔍 이 사이트는 아직 목록에 없습니다.<br><strong>등록을 도와주세요!</strong>","이 사이트 신고","전송 중…","✓ 감사합니다! 이 사이트는 곧 목록에 추가됩니다.","✓ 이 사이트는 이미 추가 중입니다.","오류입니다. 잠시 후 다시 시도하세요.","이 사이트는 Utiq를 사용합니다","자세히 알아보기 →"),
"zh_CN": ("检测网站是否使用电信运营商广告追踪技术 Utiq，并向你发出提醒。","使用 Utiq（运营商追踪）","未使用 Utiq","分析中…","此网站","个网站","在 Utiq Tracker 上了解更多 →","退出 Utiq →","🔍 此网站尚未列入我们的名单。<br><strong>帮助我们收录它！</strong>","举报此网站","发送中…","✓ 谢谢！此网站很快会被加入名单。","✓ 此网站已在添加中。","出错了，请稍后重试。","此网站使用 Utiq","了解更多 →"),
"zh_TW": ("偵測網站是否使用電信業者廣告追蹤技術 Utiq，並提醒你。","使用 Utiq（業者追蹤）","未使用 Utiq","分析中…","此網站","個網站","在 Utiq Tracker 上了解更多 →","退出 Utiq →","🔍 此網站尚未列入我們的清單。<br><strong>協助我們收錄它！</strong>","回報此網站","傳送中…","✓ 謝謝！此網站很快會被加入清單。","✓ 此網站已在新增中。","發生錯誤，請稍後再試。","此網站使用 Utiq","了解更多 →"),
"hi": ("पता लगाता है कि कोई वेबसाइट Utiq — टेलीकॉम ऑपरेटरों की विज्ञापन ट्रैकिंग — का उपयोग करती है या नहीं, और आपको सचेत करता है।","Utiq का उपयोग करती है (ऑपरेटर ट्रैकिंग)","Utiq का उपयोग नहीं करती","विश्लेषण हो रहा है…","यह साइट","साइटें","Utiq Tracker पर अधिक जानकारी →","Utiq से ऑप्ट आउट करें →","🔍 यह साइट अभी हमारी सूची में नहीं है।<br><strong>इसे जोड़ने में हमारी मदद करें!</strong>","इस साइट की रिपोर्ट करें","भेजा जा रहा है…","✓ धन्यवाद! यह साइट जल्द ही सूची में जोड़ी जाएगी।","✓ यह साइट पहले से ही जोड़ी जा रही है।","त्रुटि, कुछ देर बाद पुनः प्रयास करें।","यह साइट Utiq का उपयोग करती है","और जानें →"),
"id": ("Mendeteksi apakah sebuah situs menggunakan Utiq, pelacakan iklan operator telekomunikasi, dan memperingatkan Anda.","menggunakan Utiq (pelacakan operator)","tidak menggunakan Utiq","Menganalisis…","situs ini","situs","Info selengkapnya di Utiq Tracker →","Keluar dari Utiq →","🔍 Situs ini belum ada di daftar kami.<br><strong>Bantu kami mendaftarkannya!</strong>","Laporkan situs ini","Mengirim…","✓ Terima kasih! Situs ini akan segera ditambahkan ke daftar.","✓ Situs ini sudah dalam proses penambahan.","Kesalahan, coba lagi sebentar lagi.","Situs ini menggunakan Utiq","Pelajari lebih lanjut →"),
"ms": ("Mengesan sama ada sesuatu tapak menggunakan Utiq, penjejakan iklan pengendali telekom, dan memberi amaran kepada anda.","menggunakan Utiq (penjejakan pengendali)","tidak menggunakan Utiq","Menganalisis…","tapak ini","tapak","Maklumat lanjut di Utiq Tracker →","Tarik diri daripada Utiq →","🔍 Tapak ini belum ada dalam senarai kami.<br><strong>Bantu kami mendaftarkannya!</strong>","Laporkan tapak ini","Menghantar…","✓ Terima kasih! Tapak ini akan ditambah ke senarai tidak lama lagi.","✓ Tapak ini sudah dalam proses penambahan.","Ralat, cuba lagi sebentar lagi.","Tapak ini menggunakan Utiq","Ketahui lebih lanjut →"),
"th": ("ตรวจจับว่าเว็บไซต์ใช้ Utiq ซึ่งเป็นการติดตามโฆษณาของผู้ให้บริการโทรคมนาคมหรือไม่ และแจ้งเตือนคุณ","ใช้ Utiq (การติดตามของผู้ให้บริการ)","ไม่ใช้ Utiq","กำลังวิเคราะห์…","เว็บไซต์นี้","เว็บไซต์","ข้อมูลเพิ่มเติมที่ Utiq Tracker →","ยกเลิกการใช้ Utiq →","🔍 เว็บไซต์นี้ยังไม่อยู่ในรายการของเรา<br><strong>ช่วยเราเพิ่มเว็บไซต์นี้!</strong>","รายงานเว็บไซต์นี้","กำลังส่ง…","✓ ขอบคุณ! เว็บไซต์นี้จะถูกเพิ่มลงในรายการเร็วๆ นี้","✓ เว็บไซต์นี้กำลังถูกเพิ่มอยู่แล้ว","เกิดข้อผิดพลาด โปรดลองอีกครั้งในอีกสักครู่","เว็บไซต์นี้ใช้ Utiq","ดูเพิ่มเติม →"),
"vi": ("Phát hiện một trang web có sử dụng Utiq, công nghệ theo dõi quảng cáo của các nhà mạng viễn thông, hay không và cảnh báo bạn.","sử dụng Utiq (theo dõi nhà mạng)","không sử dụng Utiq","Đang phân tích…","trang này","trang","Tìm hiểu thêm trên Utiq Tracker →","Từ chối Utiq →","🔍 Trang này chưa có trong danh sách của chúng tôi.<br><strong>Hãy giúp chúng tôi thêm nó!</strong>","Báo cáo trang này","Đang gửi…","✓ Cảm ơn! Trang này sẽ sớm được thêm vào danh sách.","✓ Trang này đang được thêm vào.","Lỗi, vui lòng thử lại sau giây lát.","Trang này sử dụng Utiq","Tìm hiểu thêm →"),
"fi": ("Tunnistaa, käyttääkö sivusto Utiqia, teleoperaattoreiden mainosseurantaa, ja varoittaa sinua.","käyttää Utiqia (operaattoriseuranta)","ei käytä Utiqia","Analysoidaan…","tämä sivusto","sivustoa","Lisätietoja Utiq Trackerissa →","Kieltäydy Utiqista →","🔍 Tätä sivustoa ei ole vielä luettelossamme.<br><strong>Auta meitä lisäämään se!</strong>","Ilmoita tämä sivusto","Lähetetään…","✓ Kiitos! Tämä sivusto lisätään pian luetteloon.","✓ Tätä sivustoa lisätään jo.","Virhe, yritä uudelleen hetken kuluttua.","Tämä sivusto käyttää Utiqia","Lue lisää →"),
"sv": ("Upptäcker om en webbplats använder Utiq, teleoperatörernas annonsspårning, och varnar dig.","använder Utiq (operatörsspårning)","använder inte Utiq","Analyserar…","den här webbplatsen","webbplatser","Mer info på Utiq Tracker →","Avregistrera dig från Utiq →","🔍 Den här webbplatsen finns inte i vår lista ännu.<br><strong>Hjälp oss att registrera den!</strong>","Rapportera den här webbplatsen","Skickar…","✓ Tack! Den här webbplatsen läggs snart till i listan.","✓ Den här webbplatsen håller redan på att läggas till.","Fel, försök igen om en stund.","Den här webbplatsen använder Utiq","Läs mer →"),
"da": ("Registrerer, om et websted bruger Utiq, teleselskabernes reklamesporing, og advarer dig.","bruger Utiq (teleselskabssporing)","bruger ikke Utiq","Analyserer…","dette websted","websteder","Mere info på Utiq Tracker →","Frameld dig Utiq →","🔍 Dette websted er ikke på vores liste endnu.<br><strong>Hjælp os med at registrere det!</strong>","Anmeld dette websted","Sender…","✓ Tak! Dette websted bliver snart føjet til listen.","✓ Dette websted er allerede ved at blive tilføjet.","Fejl, prøv igen om et øjeblik.","Dette websted bruger Utiq","Læs mere →"),
"nb": ("Oppdager om et nettsted bruker Utiq, teleoperatørenes annonsesporing, og varsler deg.","bruker Utiq (operatørsporing)","bruker ikke Utiq","Analyserer…","dette nettstedet","nettsteder","Mer info på Utiq Tracker →","Reserver deg mot Utiq →","🔍 Dette nettstedet er ikke i listen vår ennå.<br><strong>Hjelp oss å registrere det!</strong>","Rapporter dette nettstedet","Sender…","✓ Takk! Dette nettstedet legges snart til i listen.","✓ Dette nettstedet er allerede i ferd med å bli lagt til.","Feil, prøv igjen om et øyeblikk.","Dette nettstedet bruker Utiq","Les mer →"),
"bg": ("Открива дали даден сайт използва Utiq — рекламното проследяване на телеком операторите — и ви предупреждава.","използва Utiq (проследяване от оператор)","не използва Utiq","Анализиране…","този сайт","сайта","Повече информация в Utiq Tracker →","Откажете се от Utiq →","🔍 Този сайт все още не е в нашия списък.<br><strong>Помогнете ни да го добавим!</strong>","Подайте сигнал за сайта","Изпращане…","✓ Благодарим! Този сайт скоро ще бъде добавен в списъка.","✓ Този сайт вече се добавя.","Грешка, опитайте отново след малко.","Този сайт използва Utiq","Научете повече →"),
"hr": ("Otkriva koristi li web-mjesto Utiq, oglašivačko praćenje telekom operatera, i upozorava vas.","koristi Utiq (praćenje operatera)","ne koristi Utiq","Analiziram…","ovo web-mjesto","web-mjesta","Više informacija na Utiq Trackeru →","Odjavi se s Utiqa →","🔍 Ovo web-mjesto još nije na našem popisu.<br><strong>Pomozite nam da ga zabilježimo!</strong>","Prijavi ovo web-mjesto","Slanje…","✓ Hvala! Ovo web-mjesto uskoro će biti dodano na popis.","✓ Ovo web-mjesto već se dodaje.","Pogreška, pokušajte ponovno za trenutak.","Ovo web-mjesto koristi Utiq","Saznajte više →"),
"sr": ("Открива да ли веб-сајт користи Utiq, рекламно праћење телеком оператора, и упозорава вас.","користи Utiq (праћење оператора)","не користи Utiq","Анализирам…","овај сајт","сајтова","Више информација на Utiq Tracker-у →","Одјавите се са Utiq-а →","🔍 Овај сајт још увек није на нашој листи.<br><strong>Помозите нам да га забележимо!</strong>","Пријави овај сајт","Слање…","✓ Хвала! Овај сајт ће ускоро бити додат на листу.","✓ Овај сајт се већ додаје.","Грешка, покушајте поново за тренутак.","Овај сајт користи Utiq","Сазнајте више →"),
"sl": ("Zazna, ali spletno mesto uporablja Utiq, oglaševalsko sledenje telekomunikacijskih operaterjev, in vas opozori.","uporablja Utiq (sledenje operaterja)","ne uporablja Utiq","Analiziranje…","to spletno mesto","spletnih mest","Več informacij na Utiq Tracker →","Odjava od Utiq →","🔍 To spletno mesto še ni na našem seznamu.<br><strong>Pomagajte nam ga zabeležiti!</strong>","Prijavi to spletno mesto","Pošiljanje…","✓ Hvala! To spletno mesto bo kmalu dodano na seznam.","✓ To spletno mesto se že dodaja.","Napaka, poskusite znova čez trenutek.","To spletno mesto uporablja Utiq","Več o tem →"),
"et": ("Tuvastab, kas veebisait kasutab Utiqi, telekomioperaatorite reklaamijälgimist, ja hoiatab teid.","kasutab Utiqi (operaatori jälgimine)","ei kasuta Utiqi","Analüüsimine…","see sait","saiti","Lisateave Utiq Trackeris →","Loobu Utiqist →","🔍 Seda saiti pole veel meie loendis.<br><strong>Aidake meil see lisada!</strong>","Teata sellest saidist","Saatmine…","✓ Aitäh! See sait lisatakse peagi loendisse.","✓ See sait on juba lisamisel.","Viga, proovige hetke pärast uuesti.","See sait kasutab Utiqi","Loe lähemalt →"),
"lv": ("Nosaka, vai vietne izmanto Utiq — telekomunikāciju operatoru reklāmas izsekošanu — un brīdina jūs.","izmanto Utiq (operatora izsekošana)","neizmanto Utiq","Notiek analīze…","šī vietne","vietnes","Vairāk informācijas vietnē Utiq Tracker →","Atteikties no Utiq →","🔍 Šī vietne vēl nav mūsu sarakstā.<br><strong>Palīdziet mums to reģistrēt!</strong>","Ziņot par šo vietni","Notiek sūtīšana…","✓ Paldies! Šī vietne drīz tiks pievienota sarakstam.","✓ Šī vietne jau tiek pievienota.","Kļūda, mēģiniet vēlreiz pēc brīža.","Šī vietne izmanto Utiq","Uzzināt vairāk →"),
"lt": ("Nustato, ar svetainė naudoja Utiq – telekomunikacijų operatorių reklaminį sekimą – ir jus įspėja.","naudoja Utiq (operatoriaus sekimas)","nenaudoja Utiq","Analizuojama…","ši svetainė","svetainių","Daugiau informacijos Utiq Tracker →","Atsisakyti Utiq →","🔍 Šios svetainės dar nėra mūsų sąraše.<br><strong>Padėkite mums ją įtraukti!</strong>","Pranešti apie šią svetainę","Siunčiama…","✓ Ačiū! Ši svetainė netrukus bus įtraukta į sąrašą.","✓ Ši svetainė jau įtraukiama.","Klaida, pabandykite dar kartą po akimirkos.","Ši svetainė naudoja Utiq","Sužinoti daugiau →"),
"ca": ("Detecta si un lloc web utilitza Utiq, el rastreig publicitari dels operadors de telecomunicacions, i t'avisa.","utilitza Utiq (rastreig d'operador)","no utilitza Utiq","S'està analitzant…","aquest lloc","llocs","Més informació a Utiq Tracker →","Dona't de baixa d'Utiq →","🔍 Aquest lloc encara no és a la nostra llista.<br><strong>Ajuda'ns a referenciar-lo!</strong>","Informa d'aquest lloc","S'està enviant…","✓ Gràcies! Aquest lloc s'afegirà aviat a la llista.","✓ Aquest lloc ja s'està afegint.","Error, torna-ho a provar d'aquí a un moment.","Aquest lloc utilitza Utiq","Més informació →"),
"uk_extra_placeholder": None,
}
T.pop("uk_extra_placeholder", None)

# Extra keys (server responses invalid / 429). (invalid, rate_limited)
EXTRA = {
"fr": ("Ce site ne peut pas être signalé.", "Trop de signalements, réessaie plus tard."),
"en": ("This site can't be reported.", "Too many reports, try again later."),
"de": ("Diese Website kann nicht gemeldet werden.", "Zu viele Meldungen, später erneut versuchen."),
"es": ("Este sitio no se puede reportar.", "Demasiados reportes, inténtalo más tarde."),
"it": ("Questo sito non può essere segnalato.", "Troppe segnalazioni, riprova più tardi."),
"pt": ("Este site não pode ser reportado.", "Demasiados relatórios, tente mais tarde."),
"pt_BR": ("Este site não pode ser denunciado.", "Muitas denúncias, tente mais tarde."),
"nl": ("Deze site kan niet worden gemeld.", "Te veel meldingen, probeer het later opnieuw."),
"pl": ("Tej witryny nie można zgłosić.", "Zbyt wiele zgłoszeń, spróbuj później."),
"cs": ("Tento web nelze nahlásit.", "Příliš mnoho hlášení, zkuste to později."),
"sk": ("Túto lokalitu nemožno nahlásiť.", "Príliš veľa hlásení, skúste to neskôr."),
"ro": ("Acest site nu poate fi raportat.", "Prea multe raportări, încearcă mai târziu."),
"hu": ("Ez a webhely nem jelenthető.", "Túl sok jelentés, próbáld később."),
"el": ("Αυτός ο ιστότοπος δεν μπορεί να αναφερθεί.", "Πάρα πολλές αναφορές, δοκιμάστε αργότερα."),
"ru": ("Этот сайт нельзя отправить.", "Слишком много сообщений, повторите позже."),
"uk": ("Цей сайт не можна повідомити.", "Забагато повідомлень, спробуйте пізніше."),
"tr": ("Bu site bildirilemiyor.", "Çok fazla bildirim, daha sonra tekrar deneyin."),
"ar": ("لا يمكن الإبلاغ عن هذا الموقع.", "عدد كبير من البلاغات، حاول لاحقًا."),
"he": ("לא ניתן לדווח על אתר זה.", "יותר מדי דיווחים, נסה שוב מאוחר יותר."),
"fa": ("این سایت قابل گزارش نیست.", "گزارش‌های زیاد، بعداً دوباره تلاش کنید."),
"ja": ("このサイトは報告できません。", "報告が多すぎます。後でもう一度お試しください。"),
"ko": ("이 사이트는 신고할 수 없습니다.", "신고가 너무 많습니다. 나중에 다시 시도하세요."),
"zh_CN": ("无法举报此网站。", "举报过多，请稍后再试。"),
"zh_TW": ("無法回報此網站。", "回報過多，請稍後再試。"),
"hi": ("इस साइट की रिपोर्ट नहीं की जा सकती।", "बहुत अधिक रिपोर्टें, बाद में पुनः प्रयास करें।"),
"id": ("Situs ini tidak dapat dilaporkan.", "Terlalu banyak laporan, coba lagi nanti."),
"ms": ("Tapak ini tidak boleh dilaporkan.", "Terlalu banyak laporan, cuba lagi nanti."),
"th": ("ไม่สามารถรายงานเว็บไซต์นี้ได้", "รายงานมากเกินไป โปรดลองใหม่ภายหลัง"),
"vi": ("Không thể báo cáo trang này.", "Quá nhiều báo cáo, hãy thử lại sau."),
"fi": ("Tätä sivustoa ei voi ilmoittaa.", "Liian monta ilmoitusta, yritä myöhemmin uudelleen."),
"sv": ("Den här webbplatsen kan inte rapporteras.", "För många rapporter, försök igen senare."),
"da": ("Dette websted kan ikke anmeldes.", "For mange anmeldelser, prøv igen senere."),
"nb": ("Dette nettstedet kan ikke rapporteres.", "For mange rapporter, prøv igjen senere."),
"bg": ("Този сайт не може да бъде докладван.", "Твърде много сигнали, опитайте по-късно."),
"hr": ("Ovo web-mjesto ne može se prijaviti.", "Previše prijava, pokušajte kasnije."),
"sr": ("Овај сајт не може да се пријави.", "Превише пријава, покушајте касније."),
"sl": ("Tega spletnega mesta ni mogoče prijaviti.", "Preveč prijav, poskusite pozneje."),
"et": ("Seda saiti ei saa teavitada.", "Liiga palju teateid, proovige hiljem uuesti."),
"lv": ("Šo vietni nevar ziņot.", "Pārāk daudz ziņojumu, mēģiniet vēlāk."),
"lt": ("Šios svetainės pranešti negalima.", "Per daug pranešimų, bandykite vėliau."),
"ca": ("Aquest lloc no es pot informar.", "Massa informes, torna-ho a provar més tard."),
}

EXTRA_KEYS = ["popupReportInvalid", "popupReportRateLimited"]

# Short prompt shown in the in-page toast (before the "Report" button).
TOAST = {
"fr": "Ce site n'est pas encore référencé.", "en": "This site isn't listed yet.",
"de": "Diese Website ist noch nicht erfasst.", "es": "Este sitio aún no está listado.",
"it": "Questo sito non è ancora elencato.", "pt": "Este site ainda não está listado.",
"pt_BR": "Este site ainda não está listado.", "nl": "Deze site staat nog niet in de lijst.",
"pl": "Tej witryny nie ma jeszcze na liście.", "cs": "Tento web zatím není v seznamu.",
"sk": "Táto lokalita zatiaľ nie je v zozname.", "ro": "Acest site nu este încă listat.",
"hu": "Ez a webhely még nincs a listán.", "el": "Αυτός ο ιστότοπος δεν είναι ακόμη καταχωρισμένος.",
"ru": "Этого сайта ещё нет в списке.", "uk": "Цього сайту ще немає у списку.",
"tr": "Bu site henüz listede değil.", "ar": "هذا الموقع غير مُدرج بعد.",
"he": "אתר זה עדיין לא רשום.", "fa": "این سایت هنوز فهرست نشده است.",
"ja": "このサイトはまだ一覧にありません。", "ko": "이 사이트는 아직 목록에 없습니다.",
"zh_CN": "此网站尚未收录。", "zh_TW": "此網站尚未收錄。",
"hi": "यह साइट अभी सूचीबद्ध नहीं है।", "id": "Situs ini belum terdaftar.",
"ms": "Tapak ini belum disenaraikan.", "th": "เว็บไซต์นี้ยังไม่อยู่ในรายการ",
"vi": "Trang này chưa được liệt kê.", "fi": "Tätä sivustoa ei ole vielä luettelossa.",
"sv": "Den här webbplatsen är inte listad ännu.", "da": "Dette websted er ikke på listen endnu.",
"nb": "Dette nettstedet er ikke oppført ennå.", "bg": "Този сайт все още не е в списъка.",
"hr": "Ovo web-mjesto još nije na popisu.", "sr": "Овај сајт још није на листи.",
"sl": "To spletno mesto še ni na seznamu.", "et": "Seda saiti pole veel loendis.",
"lv": "Šī vietne vēl nav sarakstā.", "lt": "Šios svetainės dar nėra sąraše.",
"ca": "Aquest lloc encara no està a la llista.",
}


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    for lang, vals in T.items():
        msgs = {"extensionName": {"message": NAME}}
        for key, val in zip(KEYS[1:], vals):
            msgs[key] = {"message": val}
        for key, val in zip(EXTRA_KEYS, EXTRA.get(lang, EXTRA["en"])):
            msgs[key] = {"message": val}
        msgs["toastReportPrompt"] = {"message": TOAST.get(lang, TOAST["en"])}
        folder = os.path.join(base, lang)
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, "messages.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(msgs, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"  {lang} ({len(vals)} keys)")
    print(f"{len(T)} languages generated.")


if __name__ == "__main__":
    main()
