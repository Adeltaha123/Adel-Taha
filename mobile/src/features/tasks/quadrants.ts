// Eisenhower matrix labels shared by the task board and voice review (same wording as the web app).
export const QUADRANTS = [
  { q:1 as const, en:'Do now', ar:'افعلها الآن', hintEn:'Urgent + important', hintAr:'عاجل ومهم' },
  { q:2 as const, en:'Schedule', ar:'جدولها', hintEn:'Important, not urgent', hintAr:'مهم وغير عاجل' },
  { q:3 as const, en:'Delegate', ar:'فوّضها', hintEn:'Urgent, not important', hintAr:'عاجل وغير مهم' },
  { q:4 as const, en:'Drop', ar:'تجاهلها', hintEn:'Neither', hintAr:'لا هذا ولا ذاك' },
];
