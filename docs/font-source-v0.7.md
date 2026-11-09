# Источник шрифта Nunito — v0.7

На сайте используются локальные файлы Nunito из пакета **`@fontsource-variable/nunito@5.3.0`**. Запросов к Google Fonts или другим внешним сервисам при показе страницы не требуется.

- Метаданные версии: `https://registry.npmjs.org/@fontsource-variable%2Fnunito/5.3.0`.
- Архив: `https://registry.npmjs.org/@fontsource-variable/nunito/-/nunito-5.3.0.tgz`.
- Лицензия: **SIL Open Font License 1.1 (OFL-1.1)**. Оригинальный файл `package/LICENSE` сохранён как `assets/fonts/OFL.txt` без изменения содержимого.
- Архив скачан с сохранением проверки TLS. Его SHA512 сопоставлен с `dist.integrity` из метаданных npm **до** чтения выбранных файлов. Значение: `sha512-tw0ch7evIDSwoeUy+0XzocYHfbRWLeCRPJy22KgbrLjDLAbNw/fErBiil10Ssrs3Sjr55zaZrr36a975j8cBkQ==`.
- Скрипты пакета не исполнялись, пакет не устанавливался в зависимости проекта. Выбранные файлы WOFF2 скопированы из проверенного архива без преобразований.

| Локальный файл | Размер | SHA256 |
|---|---:|---|
| `assets/fonts/nunito-cyrillic-wght-normal.woff2` | 20 776 байт | `63b14e3ef0966785438b8947380dfbcad178cbd3c6a5ed2172672ca0d8b839ac` |
| `assets/fonts/nunito-latin-wght-normal.woff2` | 39 128 байт | `ba344451eab25b217a165363b1982048a5e5830a0daf36577973955a04cac793` |
| `assets/fonts/nunito-latin-ext-wght-normal.woff2` | 35 588 байт | `2c8d792869818ecb253a46bc3c63c7013df7aac2f69291c3c85e5cdc94160960` |
| `assets/fonts/OFL.txt` | 4 491 байт | `40991bfa02ac620aae16dc527f3c47765a25e43f270d4c301ee6ab663a8d9015` |

Файл `wght.css` в исходном пакете объявляет обычное начертание, переменную насыщенность **200–1000** и раздельные Unicode ranges. Сайт может ограничить используемый диапазон до **400–900**. Кириллица покрывает русские тексты; латиница — латинские буквы, цифры и основную пунктуацию. `latin-ext` добавлен в том числе для символа рубля **₽ (U+20BD)**.

Исходные диапазоны из `wght.css`:

```css
/* nunito-cyrillic-wght-normal */
unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;

/* nunito-latin-wght-normal */
unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;

/* nunito-latin-ext-wght-normal */
unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
```

Все три шрифта и лицензия включены в явный манифест `site-assets.json`. Для лицензии в проверке публичного набора разрешён только точный путь `assets/fonts/OFL.txt`; ограничения размера и запрет встроенного base64 сохранены.
