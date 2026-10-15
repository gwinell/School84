# Data Science с нуля

Импортируемый курс SchoolSphere на русском языке для начинающих учеников от 16 лет.

- 7 глав и 27 уроков: от Python и статистического мышления до оценки ML-моделей и итогового проекта.
- Оценочная нагрузка полного маршрута — около 320 часов вместе с внешними материалами; это ориентир для самостоятельного темпа.
- Учебные тексты, проверочные вопросы и короткие задачи написаны для этого курса. Материалы внешних репозиториев не копируются: они указаны как ссылки.
- Крупные notebook-задания выполняются отдельно в Colab/Jupyter; ZIP-пакет содержит объяснения, quizzes и ограниченные stdin/stdout Python-задачи.

## Файлы

- `manifest.json` — редактируемый исходник курса.
- `data-science-s-nulya.s84course` — архив для импорта в SchoolSphere.

## Пересборка и проверка

Из этой папки пересоберите архив командой:

```bash
python3 -m zipfile -c data-science-s-nulya.s84course manifest.json
```

Из корня SchoolSphere проверьте его встроенным валидатором и тестами:

```bash
pnpm course-package:validate courses/data-science-s-nulya/data-science-s-nulya.s84course
node --test tests/course-package.test.cjs tests/course-package-validator.test.cjs
```

Quiz-ключи входят в импортный архив согласно формату SchoolSphere; после импорта платформа использует их для проверки ответов. Эти вопросы предназначены для формирующей проверки, не для защищённого экзамена.

## Основные источники

- [UBC Programming in Python for Data Science](https://ubc-mds.github.io/programming-in-python-for-data-science/)
- [Microsoft Data Science for Beginners — русский перевод](https://github.com/microsoft/Data-Science-For-Beginners/tree/main/translations/ru)
- [Berkeley Data 8: Computational and Inferential Thinking](https://inferentialthinking.com)
- [Python Data Science Handbook](https://jakevdp.github.io/PythonDataScienceHandbook/) — справочник по NumPy, pandas и визуализации; учитывайте возраст примеров и зависимостей.
- [mlcourse.ai](https://mlcourse.ai)
- [INRIA scikit-learn MOOC](https://inria.github.io/scikit-learn-mooc/)
- [Machine Learning Zoomcamp](https://courses.datatalks.club/ml-zoomcamp-2026/)