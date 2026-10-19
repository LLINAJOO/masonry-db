# База экспериментов по каменной кладке (статический сайт)

1. Откройте `js/config.js` и вставьте SUPABASE_URL и SUPABASE_KEY (anon public) из Supabase → Settings → API.
2. Запуск локально: `python -m http.server 8000` в этой папке → http://localhost:8000
3. Деплой: загрузите папку целиком на Netlify / GitHub Pages / Vercel (сборка не нужна).

4. **Один раз** выполните `sql/submit_experiment.sql` в Supabase → SQL Editor (сохранение заявки) и `sql/admin_review.sql` (одобрить/отклонить/удалить).

Готово: каталог (`/`), форма заявки (`/add.html`), админ-панель (`/admin`, в меню её нет — только по адресу).
Админ-вход: пользователь из Supabase → Authentication → Users.

## Форматирование кода
Проект отформатирован Prettier (`.prettierrc` в корне): `npx prettier --write "js/*.js" "css/*.css" "*.html"`.
