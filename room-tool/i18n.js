/* Arabic localisation for the room-transformation tool.
   Plain global script — no Babel. */

window.ROOM_UI = {
  en: {
    dir: "ltr",
    docTitle: "JOOD — Villa Dunes · Transformation",
    portal: "Owner Portal",
    projectName: "Villa",
    projectEm: "Dunes",
    projectMeta: "New Cairo · Model 01 — Operate",
    scrubHint: "Drag to transform — or tap a stage",
    stage: "Stage",
    viewDetails: "View details",
    hideDetails: "Hide details",
    materials: "Materials & products",
    prev: "Prev",
    next: "Next",
    dropPhoto: (n) => `Drop the "${n}" photo`,
    langBtn: "عربي",
    langBtnAria: "Switch to Arabic",
  },
  ar: {
    dir: "rtl",
    docTitle: "جود — فيلا ديونز · التحويل",
    portal: "بوابة المالك",
    projectName: "فيلا",
    projectEm: "ديونز",
    projectMeta: "القاهرة الجديدة · نموذج 01 — التشغيل",
    scrubHint: "اسحب لتنفيذ التحويل — أو اضغط على أي مرحلة",
    stage: "مرحلة",
    viewDetails: "عرض التفاصيل",
    hideDetails: "إخفاء التفاصيل",
    materials: "الخامات والمنتجات",
    prev: "السابق",
    next: "التالي",
    dropPhoto: (n) => `أضف صورة "${n}"`,
    langBtn: "EN",
    langBtnAria: "التبديل إلى الإنجليزية",
  },
};

/* Arabic overrides for each stage, keyed by stage key. */
window.ROOM_STAGES_AR = {
  current: {
    name: "كما وُجدت",
    tag: "اليوم صفر · المعاينة",
    blurb:
      "الوحدة كما وجدتها جود أثناء معاينة العقار — أساس سليم وإضاءة جيدة، لكن بطابع الإيجار طويل الأجل الذي لا يحقق سعر الليلة المستهدف. هذه هي نقطة البداية.",
    items: [
      { name: "المساحة", spec: "4.8 × 5.4 م · بروز جنوبي" },
      { name: "الحالة", spec: "6.2 / 10 · معيار من 40 نقطة" },
      { name: "للمعالجة", spec: "سجاد · جدران بيج · وحدات داكنة" },
    ],
  },
  cleared: {
    name: "الإخلاء",
    tag: "الأسبوع الأول · التجهيز",
    blurb:
      "إزالة الأثاث القائم، وحماية الأرضيات، وستائر عزل الأتربة نحو الممر. لوحة بيضاء لتنفيذ خطة التصميم المعتمدة.",
    items: [
      { name: "الإخلاء", spec: "رفع الأثاث بالكامل والتخلص منه" },
      { name: "الحماية", spec: "ألواح حماية أرضيات قابلة للتنفس" },
      { name: "تجهيز الموقع", spec: "ستائر عزل الأتربة للممر" },
    ],
  },
  paint: {
    name: "دهان الجدران",
    tag: "الأسبوع الثاني · اللون",
    blurb:
      "غلاف دافئ وهادئ يظهر بجمال في ضوء النهار. الجدران بلون رمادي بيج طباشيري، والأخشاب أفتح بنصف درجة، والسقف أبيض مطفي نقي.",
    items: [
      { name: "الجدران", spec: "رمادي بيج طباشيري · دهان مطفي" },
      { name: "الأخشاب", spec: "أبيض دافئ · نصف لامع" },
      { name: "لمسة البروز", spec: "تراكوتا · حائط مميز" },
    ],
  },
  furniture: {
    name: "الأثاث والإضاءة",
    tag: "الأسبوع الثالث · التنفيذ",
    blurb:
      "يدخل الأثاث والإضاءة معًا. كنبة مقسّمة عميقة، وكرسيان جلديان، وطاولة ترافرتين فوق سجادة معقودة يدويًا — بإضاءة LED مخفية، ونجفة جبسية، وأباليك نحاسية بمخفتات إضاءة.",
    items: [
      { name: "الكنبة", spec: "3.5 مقعد · مقسّمة · بوكليه · لون الشوفان" },
      { name: "الكراسي", spec: "زوج · جوز وجلد بني فاتح" },
      { name: "إضاءة عامة", spec: "LED مخفي · 2700 كلفن · قابل للتخفيت" },
      { name: "قطعة مميزة", spec: "نجفة جبسية على شكل قبة" },
      { name: "السجادة", spec: "صوف معقود يدويًا · 3 × 4 م" },
    ],
  },
  styling: {
    name: "التنسيق النهائي",
    tag: "الأسبوع الثالث · اللمسة الأخيرة",
    blurb:
      "الفن والملمس والنباتات تمنح الغرفة حياتها استعدادًا للتصوير — وسائد كتانية، وبطانية صوف، وقطع سيراميك، وكتب، وشجرة زيتون بجوار النافذة.",
    items: [
      { name: "الأعمال الفنية", spec: "ثلاثية مؤطرة فوق الكنبة" },
      { name: "المفروشات", spec: "وسائد كتان وبطانية صوف" },
      { name: "النباتات", spec: "شجرة زيتون + أحواض متدلية" },
      { name: "النوافذ", spec: "ستائر رومانية كتانية + شيفون" },
    ],
  },
};

/* Merge an Arabic override onto a stage. */
window.ROOM_L = function (s, lang) {
  if (lang !== "ar") return s;
  var o = window.ROOM_STAGES_AR[s.key];
  return o ? Object.assign({}, s, o) : s;
};
