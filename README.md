# moodnight

Простір української поезії — статичний прототип на React 18 + Babel standalone (без збірки).

## Як запустити

Потрібен HTTP-сервер — `file://` не працює, бо JSX підвантажується через `<script src>`.

```bash
python3 -m http.server 8777
```

Далі відкрий http://localhost:8777/MoodNight.html

## Файли

- `MoodNight.html` — сторінка-оболонка
- `app.jsx` — компоненти сторінки
- `data.jsx` — приклади віршів
- `ornaments.jsx` — SVG-орнаменти
- `styles.css` — стилі
- `tweaks-panel.jsx` — панель налаштувань
