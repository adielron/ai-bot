# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.


System Component                     / Scenario,Model (Provider)                         ,Avg. Latency (ms)             ,Quality / Accuracy (1-5),  Estimated Cost
Router (Classification & Planning)                    ,OpenAI GPT-4o-mini                         ,"~2,900ms"                                     ,5     ,$
RAG Retrieval (KB Search)                    ,Python (ChromaDB)                         ,"~1,587ms"                                     ,5,                0
Currency Exchange Tool                    ,Local Logic (TS)                         ,< 1ms                                             2              ,0
Math Calculation Tool,                    Local Logic (TS)                         ,< 1ms,                                     3                     ,0
Orchestration Synthesis                    ,OpenAI GPT-4o-mini                         ,"~4,835ms"                                     ,5               ,$
End-to-End Response                    ,Hybrid System                         ,                         "~9,362ms"                                     ,5,$


הצדקת בחירות ארכיטקטוניות: השתמשתי במודל ענן (OpenAI) ל-Orchestration וסיכום כי נדרשת "בינה" גבוהה לניהול כלים. לעומת זאת, ה-RAG והלוגיקה (מתמטיקה/המרת מטבע) מבוצעים מקומית ב-Python/TS כדי לחסוך בעלויות, לשמור על פרטיות המידע ולאפשר שליפה מהירה מבסיס נתונים וקטורי.

השפעת ה-Microservices: ההפרדה לשרת Python ייעודי אפשרה להשתמש בספריות AI מקצועיות (ChromaDB) בלי להעמיס על שרת ה-TS. זה שיפר את הגמישות (ניתן לעדכן את ה-DB בלי להפיל את הבוט) אך הוסיף זמן תקשורת (Latency) בין השירותים.

אתגרים ופשרות (Trade-offs): הפשרה העיקרית היא זמן תגובה מול איכות. שימוש ב-GPT-4o לסיכום סופי לוקח כמעט 5 שניות (כפי שנראה ב-Logs), אך מבטיח תשובה מדויקת. אתגר נוסף הוא סנכרון הפרמטרים בין ה-Router לכלים (מניעת undefined).

שיפורים עתידיים:

מעבר ל-Streaming כדי שהמשתמש יראה טקסט נכתב בזמן אמת ולא ימתין 9 שניות.

הטמעת Parallel Tool Use כדי להריץ RAG וכלים אחרים במקביל במקום אחד אחרי השני.