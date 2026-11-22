export type GuideLang = 'en' | 'ar' | 'hi' | 'ur' | 'bn';
export type GuideStepId = 'intro' | '1' | '2' | '3' | '4';

export interface GuideCopy {
  label: string;
  rtl: boolean;
  title: string;
  sub: string;
  example: string;
  ok: string;
  voiceBannerTitle: string;
  voiceBannerSub: string;
  playAll: string;
  stopVoice: string;
  listenStep: string;
  playingStep: string;
  loadingVoice: string;
  speedNormal: string;
  speedSlow: string;
  speakingPrefix: string;
  s1t: string;
  s1d: string;
  s2t: string;
  s2d: string;
  s3t: string;
  s3d: string;
  s4t: string;
  s4d: string;
  scripts: Record<GuideStepId, string>;
}

export const GUIDE_LANGS: GuideLang[] = ['en', 'ar', 'hi', 'ur', 'bn'];

export const GUIDE_CONTENT: Record<GuideLang, GuideCopy> = {
  en: {
    label: 'English',
    rtl: false,
    title: 'How to Fill Shift Data',
    sub: 'Visual & voice guide for station staff · Easy to follow',
    example: 'EXAMPLE',
    ok: 'Got it — start',
    voiceBannerTitle: 'Friendly Voice Guide',
    voiceBannerSub: 'Tap Play to hear easy step-by-step instructions',
    playAll: 'Play Full Guide',
    stopVoice: 'Stop',
    listenStep: 'Listen',
    playingStep: 'Playing...',
    loadingVoice: 'Loading...',
    speedNormal: '1.0x Normal',
    speedSlow: '0.85x Slow',
    speakingPrefix: 'Speaking',
    s1t: 'Station & Prices',
    s1d: 'Type Station Name & set fuel prices (91, 95, D).',
    s2t: 'Initial & Final Meter',
    s2d: 'Type numbers, or tap Camera / Mic to capture.',
    s3t: 'Apps & Cash Check',
    s3d: 'Tap APPS to enter ATM / Reben App totals.',
    s4t: 'Send & Next Shift',
    s4d: 'Tap WhatsApp to send report, SHIFT to rotate.',
    scripts: {
      intro:
        "Hi there! Welcome to Reben! Don't worry, filling your shift report is super easy. Just follow these four quick steps with me, okay? Let's go!",
      '1':
        "Step one! Tap the top box and type your station name. Then tap 91, 95, and Diesel to enter today's fuel prices. Easy, right?",
      '2':
        'Step two! Check your meter numbers. The starting reading locks automatically for safety. For the final reading, just type the number, tap the camera to scan the pump screen, or tap the mic and speak the numbers! Total liters calculate by themselves!',
      '3':
        'Step three! Tap the black APPS button. Enter the total money from ATM cards, Reben App, and other apps. Your cash in hand will show up automatically in the green box!',
      '4':
        "Step four, all done! Tap the green WhatsApp button to send your report, or tap PDF to save and share it. When your shift finishes, tap SHIFT so today's final numbers become the next shift's starting numbers. Great job!"
    }
  },
  ar: {
    label: 'العربية',
    rtl: true,
    title: 'كيفية تعبئة بيانات الوردية',
    sub: 'دليل مرئي وصوتي لموظفي المحطة · سهل الفهم',
    example: 'مثال',
    ok: 'فهمت — ابدأ',
    voiceBannerTitle: 'الدليل الصوتي اللطيف',
    voiceBannerSub: 'اضغط تشغيل لسماع الشرح خطوة بخطوة بسهولة',
    playAll: 'تشغيل الشرح الكامل',
    stopVoice: 'إيقاف',
    listenStep: 'استماع',
    playingStep: 'جاري التشغيل...',
    loadingVoice: 'جاري التحميل...',
    speedNormal: '1.0x عادي',
    speedSlow: '0.85x بطيء',
    speakingPrefix: 'تتحدث الآن',
    s1t: 'المحطة والأسعار',
    s1d: 'اكتب اسم المحطة وحدّد أسعار الوقود (91، 95، D).',
    s2t: 'قراءة العداد: البداية والنهاية',
    s2d: 'اكتب الأرقام، أو اضغط على الكاميرا / الميكروفون لإدخال القراءة.',
    s3t: 'التطبيقات وفحص النقد',
    s3d: 'اضغط على APPS لإدخال إجمالي مبالغ ATM / Reben App.',
    s4t: 'الإرسال والوردية التالية',
    s4d: 'اضغط على زر واتساب لإرسال التقرير، وعلى SHIFT لتبديل الوردية.',
    scripts: {
      intro:
        'أهلاً بك في ريبن! لا تقلق، تعبئة تقرير الوردية سهلة جداً. فقط اتبع معي هذه الخطوات الأربع البسيطة، حسناً؟ هيا نبدأ!',
      '1':
        'الخطوة الأولى! اضغط على الخانة في الأعلى واكتب اسم المحطة. بعد ذلك اضغط على 91 و 95 والديزل لكتابة أسعار الوقود لليوم. سهل، أليس كذلك؟',
      '2':
        'الخطوة الثانية! انظر إلى أرقام العداد. قراءة البداية تُقفل تلقائياً للأمان. أما قراءة النهاية، فاكتب الرقم أو اضغط على الكاميرا لتصوير شاشة المضخة، أو اضغط على الميكروفون وانطق الأرقام! وسيتحسب إجمالي اللترات تلقائياً!',
      '3':
        'الخطوة الثالثة! اضغط على زر التطبيقات الأسود. أدخل إجمالي المبالغ من الشبكة وتطبيق ريبن والتطبيقات الأخرى. وسيظهر لك مبلغ الكاش في يدك تلقائياً في المربع الأخضر!',
      '4':
        'الخطوة الرابعة، انتهينا! اضغط على زر واتساب الأخضر لإرسال التقرير، أو اضغط على PDF لحفظه ومشاركته. وعند انتهاء ورديتك، اضغط على SHIFT لتصبح أرقام النهاية هي أرقام البداية للوردية التالية. عمل رائع!'
    }
  },
  hi: {
    label: 'हिन्दी',
    rtl: false,
    title: 'शिफ्ट डेटा कैसे भरें',
    sub: 'स्टेशन स्टाफ के लिए विज़ुअल और आवाज़ गाइड · बेहद आसान',
    example: 'उदाहरण',
    ok: 'समझ गया — शुरू करें',
    voiceBannerTitle: 'आसान आवाज़ गाइड',
    voiceBannerSub: 'आसान भाषा में हर कदम सुनने के लिए प्ले दबाएँ',
    playAll: 'पूरा गाइड सुनें',
    stopVoice: 'रोकें',
    listenStep: 'सुनें',
    playingStep: 'चल रहा है...',
    loadingVoice: 'लोड हो रहा है...',
    speedNormal: '1.0x सामान्य',
    speedSlow: '0.85x धीमा',
    speakingPrefix: 'आवाज़',
    s1t: 'स्टेशन और कीमतें',
    s1d: 'स्टेशन का नाम लिखें और ईंधन की कीमतें (91, 95, D) भरें।',
    s2t: 'शुरुआती और अंतिम मीटर',
    s2d: 'नंबर टाइप करें, या कैमरा / माइक दबाकर दर्ज करें।',
    s3t: 'ऐप्स और कैश जाँच',
    s3d: 'ATM / Reben App की कुल रकम भरने के लिए APPS दबाएँ।',
    s4t: 'भेजें और अगली शिफ्ट',
    s4d: 'रिपोर्ट भेजने के लिए WhatsApp दबाएँ, शिफ्ट बदलने के लिए SHIFT दबाएँ।',
    scripts: {
      intro:
        'नमस्ते! रीबेन में आपका स्वागत है! बिल्कुल चिंता न करें, शिफ्ट रिपोर्ट भरना बहुत आसान है। बस मेरे साथ ये चार छोटे कदम देखें, ठीक है? चलिए शुरू करते हैं!',
      '1':
        'पहला कदम! ऊपर वाले बॉक्स पर दबाएं और अपने स्टेशन का नाम लिखें। फिर 91, 95 और डीज़ल पर दबाकर आज के पेट्रोल और डीज़ल के दाम भरें। बहुत आसान है ना?',
      '2':
        'दूसरा कदम! अब मीटर के नंबर देखें। शुरुआती रीडिंग सुरक्षा के लिए अपने आप लॉक हो जाती है। आखिरी रीडिंग के लिए नंबर टाइप करें, या कैमरा दबाकर मीटर की फोटो लें, या माइक दबाकर नंबर बोल दें! कुल लीटर अपने आप निकल आएगा!',
      '3':
        'तीसरा कदम! काले ऐप्स बटन पर दबाएं। एटीएम कार्ड, रीबेन ऐप और बाकी ऐप्स से मिले कुल पैसे भरें। आपके हाथ का कैश हरे बॉक्स में अपने आप जुड़कर आ जाएगा!',
      '4':
        'चौथा कदम, काम पूरा हुआ! रिपोर्ट भेजने के लिए हरे व्हाट्सएप बटन पर दबाएं, या सेव और शेयर करने के लिए पीडीएफ दबाएं। जब आपकी शिफ्ट खत्म हो जाए, तो शिफ्ट बटन दबाएं ताकि आज के आखिरी नंबर अगली शिफ्ट के शुरुआती नंबर बन जाएं। बहुत बढ़िया काम!'
    }
  },
  ur: {
    label: 'اردو',
    rtl: true,
    title: 'شفٹ کا ڈیٹا کیسے بھریں',
    sub: 'اسٹیشن عملے کے لیے بصری اور آواز گائیڈ · سمجھنے میں آسان',
    example: 'مثال',
    ok: 'سمجھ گیا — شروع کریں',
    voiceBannerTitle: 'آسان آواز گائیڈ',
    voiceBannerSub: 'ہر قدم کی آسان وضاحت سننے کے لیے پلے دبائیں',
    playAll: 'مکمل گائیڈ سنیں',
    stopVoice: 'روکیں',
    listenStep: 'سنیں',
    playingStep: 'چل رہا ہے...',
    loadingVoice: 'لوڈ ہو رہا ہے...',
    speedNormal: '1.0x نارمل',
    speedSlow: '0.85x آہستہ',
    speakingPrefix: 'آواز',
    s1t: 'اسٹیشن اور قیمتیں',
    s1d: 'اسٹیشن کا نام لکھیں اور ایندھن کی قیمتیں (91، 95، D) درج کریں۔',
    s2t: 'ابتدائی اور آخری میٹر',
    s2d: 'نمبر ٹائپ کریں، یا کیمرا / مائیک دبا کر درج کریں۔',
    s3t: 'ایپس اور کیش چیک',
    s3d: 'ATM / Reben App کی کل رقم درج کرنے کے لیے APPS دبائیں۔',
    s4t: 'بھیجیں اور اگلی شفٹ',
    s4d: 'رپورٹ بھیجنے کے لیے WhatsApp دبائیں، شفٹ بدلنے کے لیے SHIFT دبائیں۔',
    scripts: {
      intro:
        'السلام علیکم! ریبن میں خوش آمدید! بالکل پریشان نہ ہوں، شفٹ رپورٹ بھرنا بہت آسان ہے۔ بس میرے ساتھ یہ چار آسان قدم دیکھیں، ٹھیک ہے؟ چلیے شروع کرتے ہیں!',
      '1':
        'پہلا قدم! اوپر والے خانے پر دبائیں اور اپنے اسٹیشن کا نام لکھیں۔ پھر 91، 95 اور ڈیزل پر دبا کر آج کی قیمتیں لکھیں۔ بہت آسان ہے نا؟',
      '2':
        'دوسرا قدم! اب میٹر کے نمبر دیکھیں۔ شروع کی ریڈنگ حفاظت کے لیے خود بخود لاک ہو جاتی ہے۔ آخری ریڈنگ کے لیے نمبر لکھیں، یا کیمرا دبا کر میٹر اسکین کریں، یا مائیک دبا کر نمبر بول دیں! کل لیٹر خود بخود نکل آئیں گے!',
      '3':
        'تیسرا قدم! کالے ایپس بٹن پر دبائیں۔ اے ٹی ایم کارڈ، ریبن ایپ اور دیگر ایپس کی کل رقم لکھیں۔ آپ کے ہاتھ میں موجود کیش سبز باکس میں خود بخود آ جائے گا!',
      '4':
        'چوتھا قدم، کام مکمل ہو گیا! رپورٹ بھیجنے کے لیے سبز واٹس ایپ بٹن پر دبائیں، یا محفوظ اور شیئر کرنے کے لیے پی ڈی ایف دبائیں۔ جب آپ کی شفٹ ختم ہو جائے، تو شفٹ دبائیں تاکہ آخری نمبر اگلی شفٹ کے ابتدائی نمبر بن جائیں۔ شاباش!'
    }
  },
  bn: {
    label: 'বাংলা',
    rtl: false,
    title: 'শিফটের তথ্য কীভাবে পূরণ করবেন',
    sub: 'স্টেশন কর্মীদের জন্য ভিজ্যুয়াল ও ভয়েস গাইড · খুব সহজ',
    example: 'উদাহরণ',
    ok: 'বুঝেছি — শুরু করুন',
    voiceBannerTitle: 'সহজ ভয়েস গাইড',
    voiceBannerSub: 'সহজ ভাষায় প্রতিটি ধাপ শুনতে প্লে বাটনে চাপুন',
    playAll: 'পুরো গাইড শুনুন',
    stopVoice: 'থামান',
    listenStep: 'শুনুন',
    playingStep: 'চলছে...',
    loadingVoice: 'লোড হচ্ছে...',
    speedNormal: '1.0x সাধারণ',
    speedSlow: '0.85x ধীরে',
    speakingPrefix: 'শুনছেন',
    s1t: 'স্টেশন ও দাম',
    s1d: 'স্টেশনের নাম লিখুন এবং জ্বালানির দাম (91, 95, D) দিন।',
    s2t: 'শুরু ও শেষ মিটার',
    s2d: 'সংখ্যা টাইপ করুন, অথবা ক্যামেরা / মাইক চেপে ইনপুট দিন।',
    s3t: 'অ্যাপস ও ক্যাশ চেক',
    s3d: 'ATM / Reben App-এর মোট টাকার অঙ্ক দিতে APPS চাপুন।',
    s4t: 'পাঠান ও পরবর্তী শিফট',
    s4d: 'রিপোর্ট পাঠাতে WhatsApp চাপুন, শিফট বদলাতে SHIFT চাপুন।',
    scripts: {
      intro:
        'হ্যালো! রেবেন-এ স্বাগতম! একদম চিন্তা করবেন না, শিফটের হিসাব লেখা খুবই সহজ। শুধু আমার সাথে এই চারটি ছোট ধাপ দেখুন, ঠিক আছে? চলুন শুরু করি!',
      '1':
        'প্রথম ধাপ! উপরের বক্সে ট্যাপ করে আপনার স্টেশনের নাম লিখুন। তারপর ৯১, ৯৫ আর ডিজেলে ট্যাপ করে আজকের তেলের দাম বসান। একদম সহজ, তাই না?',
      '2':
        'দ্বিতীয় ধাপ! এবার মিটারের নম্বর দেখুন। নিরাপত্তার জন্য শুরুর রিডিং নিজে থেকেই লক থাকে। শেষ রিডিংয়ের জন্য নম্বর টাইপ করুন, অথবা ক্যামেরা চেপে পাম্পের মিটার স্ক্যান করুন, বা মাইক চেপে নম্বর বলে দিন! কত লিটার বিক্রি হলো তা নিজে থেকেই হিসাব হয়ে যাবে!',
      '3':
        'তৃতীয় ধাপ! কালো অ্যাপস বাটনে ট্যাপ করুন। এটিএম কার্ড, রেবেন অ্যাপ আর অন্যান্য অ্যাপের মোট টাকা বসান। আপনার হাতে থাকা ক্যাশ সবুজ বক্সে নিজে থেকেই হিসাব হয়ে যাবে!',
      '4':
        'চতুর্থ ধাপ, কাজ শেষ! রিপোর্ট পাঠাতে সবুজ হোয়াটসঅ্যাপ বাটনে ট্যাপ করুন, অথবা সেভ ও শেয়ার করতে পিডিএফ ট্যাপ করুন। আপনার শিফট শেষ হলে শিফট বাটনে ট্যাপ করুন, তাহলে শেষ নম্বরগুলো পরের শিফটের শুরুর নম্বর হয়ে যাবে। দারুণ কাজ করেছেন!'
    }
  }
};
